import { settings } from "./settings.js";
import { b64Mime, callDescribe, callGenerate, callOptimize } from "./api.js";
import { HistoryManager, ImageEntry } from "./history.js";
import { type UI } from "./ui.js";

export class Controller {
    private ui: UI;
    private isRunning = false;
    private imageTitle = "generated-image";
    private history = new HistoryManager();
    private hasImage = false;
    private uploadedImageB64 = "";

    constructor(ui: UI) {
        this.ui = ui;
    }

    // ── Theme ─────────────────────────────────────────────────────────────────

    private applyTheme(theme: string): void {
        const isLight = theme === "light";
        document.documentElement.setAttribute("data-theme", theme);
        this.ui.themeToggle.innerHTML = `<span class="material-icon">${isLight ? "dark_mode" : "light_mode"}</span>`;
        const label = isLight ? "Switch to dark mode" : "Switch to light mode";
        this.ui.themeToggle.setAttribute("aria-label", label);
        this.ui.themeToggle.title = label;
    }

    // ── Prompt bar ────────────────────────────────────────────────────────────

    private setExpanded(expanded: boolean): void {
        this.ui.promptBar.classList.toggle("expanded", expanded);
        this.ui.promptToggle.setAttribute("aria-expanded", String(expanded));
    }

    // ── Loading / messages ────────────────────────────────────────────────────

    private setLoading(active: boolean, msg?: string): void {
        this.ui.loadingMsg.textContent = active ? (msg ?? "Loading…") : "";
        this.ui.loadingOverlay.classList.toggle("hidden", !active);
    }

    private setControlsDisabled(disabled: boolean): void {
        this.ui.generateBtn.disabled = disabled;
        this.ui.optimizeOnlyBtn.disabled = disabled;
        this.ui.historyToggle.disabled = disabled;
        this.ui.describeBtn.disabled = disabled || !this.hasImage;
        this.ui.historyList.style.pointerEvents = disabled ? "none" : "";
    }

    private clearMessages(): void {
        this.ui.blockedMsg.classList.add("hidden");
        this.ui.errorMsg.classList.add("hidden");
        this.ui.fallbackMsg.classList.add("hidden");
    }

    private showBlocked(message: string): void {
        this.ui.blockedMsg.textContent = message;
        this.ui.blockedMsg.classList.remove("hidden");
    }

    private showImage(src: string): void {
        this.ui.generatedImage.src = src;
        this.ui.imageContainer.classList.remove("hidden");
    }

    private showFallback(model: string): void {
        this.ui.fallbackMsg.textContent = `Primary model failed — using fallback: ${model}`;
        this.ui.fallbackMsg.classList.remove("hidden");
    }

    private showError(err: unknown): void {
        this.ui.errorMsg.textContent = err instanceof Error
            ? err.message
            : "Something went wrong. Is Ollama running?";
        this.ui.errorMsg.classList.remove("hidden");
    }

    // ── History ───────────────────────────────────────────────────────────────

    private createThumbnail(entry: ImageEntry, index: number): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.className = "history-thumb";
        btn.title = entry.prompt;
        btn.setAttribute("aria-label", entry.prompt);
        btn.addEventListener("click", () => this.restoreFromHistory(index));

        const img = document.createElement("img");
        img.src = entry.src;
        img.alt = "";
        img.loading = "lazy";

        const caption = document.createElement("span");
        caption.className = "history-thumb-caption";
        caption.textContent = entry.prompt;

        btn.append(img, caption);
        return btn;
    }

    private renderHistory(): void {
        const images = this.history.getImages();
        this.ui.historyCount.textContent = String(images.length);
        this.ui.historyPanel.classList.toggle("hidden", images.length === 0);
        this.ui.historyList.replaceChildren(
            ...images.map((entry, i) => this.createThumbnail(entry, i))
        );
    }

    private restoreFromHistory(index: number): void {
        if (this.isRunning) return;
        const entry = this.history.getImages()[index] as ImageEntry | undefined;
        if (!entry) return;
        this.clearMessages();
        this.showImage(entry.src);
        this.imageTitle = entry.title;
        this.ui.prompt.value = entry.prompt;
        this.ui.enhanceBtn.classList.remove("hidden");
    }

    private enhance(): void {
        this.setExpanded(true);
        this.ui.prompt.focus();
    }

    private toggleHistoryPanel(): void {
        const isOpen = this.ui.historyPanel.classList.toggle("open");
        this.ui.historyToggle.setAttribute("aria-expanded", String(isOpen));
        this.ui.historyList.setAttribute("aria-hidden", isOpen ? "false" : "true");
    }

    // ── Prompt history navigation ─────────────────────────────────────────────

    private handleArrowNav(e: KeyboardEvent): void {
        const dir = e.key === "ArrowUp" ? "up" : "down";
        const value = this.ui.prompt.value;
        const atFirstLine = !value.slice(0, this.ui.prompt.selectionStart ?? 0).includes("\n");

        if (!this.history.isNavigating() && !(dir === "up" && atFirstLine)) return;

        const result = this.history.navigate(dir, value);
        if (result === null) return;

        e.preventDefault();
        this.ui.prompt.value = result;
        this.ui.prompt.selectionStart = this.ui.prompt.selectionEnd = result.length;
        this.ui.prompt.classList.toggle("history-nav", this.history.isNavigating());
    }

    // ── Generation ────────────────────────────────────────────────────────────

    private async generate(prompt: string): Promise<void> {
        const { image, title, fallback_model } = await callGenerate(prompt);
        this.imageTitle = title;
        if (fallback_model) this.showFallback(fallback_model);

        const src = `data:${b64Mime(image)};base64,${image}`;
        this.showImage(src);
        this.ui.enhanceBtn.classList.remove("hidden");
        this.history.addImage({ prompt, src, title });
        this.renderHistory();
        await this.history.save(prompt);
    }

    private async runGenerate(): Promise<void> {
        const prompt = this.ui.prompt.value.trim();
        if (!prompt || this.isRunning) return;

        this.isRunning = true;
        this.history.resetNav();
        this.ui.prompt.classList.remove("history-nav");
        this.ui.enhanceBtn.classList.add("hidden");
        this.setExpanded(false);
        this.clearMessages();
        this.setLoading(true, "Generating image — this may take a while…");
        this.setControlsDisabled(true);

        try {
            const check = await callOptimize(prompt, false);
            if (check.blocked) { this.showBlocked(check.message); return; }
            await this.generate(prompt);
        } catch (err) {
            this.showError(err);
        } finally {
            this.isRunning = false;
            this.setLoading(false);
            this.setControlsDisabled(false);
        }
    }

    private async runOptimize(): Promise<void> {
        const original = this.ui.prompt.value.trim();
        if (!original || this.isRunning) return;

        this.isRunning = true;
        this.clearMessages();
        this.setLoading(true, "Optimizing prompt…");
        this.setControlsDisabled(true);

        try {
            const result = await callOptimize(original, true);
            if (!result.blocked && result.optimized !== original) {
                this.ui.prompt.value = result.optimized;
            }
        } catch (err) {
            this.showError(err);
        } finally {
            this.isRunning = false;
            this.setLoading(false);
            this.setControlsDisabled(false);
        }
    }

    // ── Describe tab ─────────────────────────────────────────────────────────

    private switchTab(tab: "generate" | "describe"): void {
        const isGenerate = tab === "generate";
        this.ui.generatePanel.classList.toggle("hidden", !isGenerate);
        this.ui.describePanel.classList.toggle("hidden", isGenerate);
        this.ui.tabGenerate.classList.toggle("active", isGenerate);
        this.ui.tabDescribe.classList.toggle("active", !isGenerate);
        this.ui.tabGenerate.setAttribute("aria-selected", String(isGenerate));
        this.ui.tabDescribe.setAttribute("aria-selected", String(!isGenerate));
        this.setExpanded(true);
    }

    private handleFileSelect(file: File): void {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            this.uploadedImageB64 = dataUrl.split(",")[1] ?? "";
            this.hasImage = Boolean(this.uploadedImageB64);
            this.ui.uploadPreview.src = dataUrl;
            this.ui.uploadPreview.classList.remove("hidden");
            this.ui.describeBtn.disabled = !this.hasImage;
            this.ui.describeResult.classList.add("hidden");
            this.ui.useAsPromptBtn.classList.add("hidden");
        };
        reader.readAsDataURL(file);
    }

    private async runDescribe(): Promise<void> {
        if (this.isRunning || !this.hasImage) return;

        this.isRunning = true;
        this.clearMessages();
        this.setExpanded(false);
        this.setLoading(true, "Describing image…");
        this.setControlsDisabled(true);

        try {
            const description = await callDescribe(this.uploadedImageB64);
            this.ui.describeResult.textContent = description;
            this.ui.describeResult.classList.remove("hidden");
            this.ui.useAsPromptBtn.classList.remove("hidden");
        } catch (err) {
            this.showError(err);
        } finally {
            this.isRunning = false;
            this.setLoading(false);
            this.setControlsDisabled(false);
            this.setExpanded(true);
        }
    }

    private useDescriptionAsPrompt(): void {
        const description = this.ui.describeResult.textContent ?? "";
        if (!description) return;
        this.ui.prompt.value = description;
        this.switchTab("generate");
    }

    // ── Download ──────────────────────────────────────────────────────────────

    download(): void {
        const a = document.createElement("a");
        a.href = this.ui.generatedImage.src;
        a.download = this.imageTitle;
        a.click();
    }

    // ── Bootstrap ─────────────────────────────────────────────────────────────

    private bindGenerateEvents(): void {
        this.ui.themeToggle.addEventListener("click", () => {
            const next = settings.theme === "light" ? "dark" : "light";
            settings.theme = next;
            this.applyTheme(next);
        });
        this.ui.promptToggle.addEventListener("click", () => {
            const expanding = !this.ui.promptBar.classList.contains("expanded");
            this.setExpanded(expanding);
            if (expanding) this.ui.prompt.focus();
        });
        this.ui.generateBtn.addEventListener("click", () => this.runGenerate());
        this.ui.optimizeOnlyBtn.addEventListener("click", () => this.runOptimize());
        this.ui.prompt.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.runGenerate(); }
            if (e.key === "ArrowUp" || e.key === "ArrowDown") this.handleArrowNav(e);
        });
        this.ui.prompt.addEventListener("input", () => {
            if (this.history.isNavigating()) {
                this.history.resetNav();
                this.ui.prompt.classList.remove("history-nav");
            }
        });
        this.ui.enhanceBtn.addEventListener("click", () => this.enhance());
        this.ui.downloadBtn.addEventListener("click", () => this.download());
        this.ui.historyToggle.addEventListener("click", () => this.toggleHistoryPanel());
    }

    private bindDescribeEvents(): void {
        this.ui.tabGenerate.addEventListener("click", () => this.switchTab("generate"));
        this.ui.tabDescribe.addEventListener("click", () => this.switchTab("describe"));
        this.ui.uploadZone.addEventListener("click", () => this.ui.imageUpload.click());
        this.ui.uploadZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            this.ui.uploadZone.classList.add("drag-over");
        });
        this.ui.uploadZone.addEventListener("dragleave", () => {
            this.ui.uploadZone.classList.remove("drag-over");
        });
        this.ui.uploadZone.addEventListener("drop", (e) => {
            e.preventDefault();
            this.ui.uploadZone.classList.remove("drag-over");
            const file = e.dataTransfer?.files[0];
            if (file) this.handleFileSelect(file);
        });
        this.ui.imageUpload.addEventListener("change", (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) this.handleFileSelect(file);
        });
        this.ui.describeBtn.addEventListener("click", () => this.runDescribe());
        this.ui.useAsPromptBtn.addEventListener("click", () => this.useDescriptionAsPrompt());
    }

    bindEvents(): void {
        this.bindGenerateEvents();
        this.bindDescribeEvents();
    }

    init(): void {
        this.applyTheme(settings.theme);
        this.history.load().catch(() => undefined);
    }
}
