import { type AspectFormat, settings } from "./settings.js";
import {
    b64Mime,
    callDescribe,
    callDriveStatus,
    callDriveUpload,
    callGenerate,
    callOptimize,
} from "./api.js";
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
        this.ui.aspectLand.disabled = disabled;
        this.ui.aspectPort.disabled = disabled;
        this.ui.aspectSquare.disabled = disabled;
    }

    private clearMessages(): void {
        this.ui.errorMsg.classList.add("hidden");
        this.ui.fallbackMsg.classList.add("hidden");
    }

    private applyOutputAspect(aspect: AspectFormat): void {
        this.ui.imageContainer.setAttribute("data-aspect", aspect);
    }

    private showImage(src: string, aspect: AspectFormat): void {
        this.applyOutputAspect(aspect);
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
        this.showImage(entry.src, entry.aspect ?? "square");
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
        const { image, title, fallback_model } = await callGenerate(
            prompt,
            settings.aspect,
        );
        this.imageTitle = title;
        if (fallback_model) this.showFallback(fallback_model);

        const aspect = settings.aspect;
        const src = `data:${b64Mime(image)};base64,${image}`;
        this.showImage(src, aspect);
        this.ui.enhanceBtn.classList.remove("hidden");
        this.history.addImage({ prompt, src, title, aspect });
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
            await this.generate(prompt);
        } catch (err) {
            this.showError(err);
            this.setExpanded(true);
            this.ui.prompt.focus();
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
            if (result.optimized && result.optimized !== original) {
                this.ui.prompt.value = result.optimized;
            }
        } catch (err) {
            this.showError(err);
            this.setExpanded(true);
            this.ui.prompt.focus();
        } finally {
            this.isRunning = false;
            this.setLoading(false);
            this.setControlsDisabled(false);
        }
    }

    // ── Describe tab ─────────────────────────────────────────────────────────

    private switchTab(tab: "generate" | "describe"): void {
        const activeBtn = tab === "generate" ? this.ui.tabGenerate : this.ui.tabDescribe;
        if (activeBtn.classList.contains("active") && this.ui.promptBar.classList.contains("expanded")) {
            this.setExpanded(false);
            return;
        }
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
        this.expandTextareaIfNeeded();
    }

    // ── Textarea expand ───────────────────────────────────────────────────────

    private syncExpandBtn(): void {
        const ta = this.ui.prompt;
        this.ui.textareaWrap.classList.toggle("has-overflow", ta.scrollHeight > ta.clientHeight);
    }

    private expandTextareaIfNeeded(): void {
        const ta = this.ui.prompt;
        if (ta.scrollHeight <= ta.clientHeight) return;
        this.ui.textareaWrap.classList.add("is-expanded", "has-overflow");
        ta.style.height = `${ta.scrollHeight}px`;
    }

    private toggleTextareaExpand(): void {
        const wrap = this.ui.textareaWrap;
        const ta = this.ui.prompt;
        const expanding = !wrap.classList.contains("is-expanded");
        wrap.classList.toggle("is-expanded", expanding);
        if (expanding) {
            ta.style.height = `${ta.scrollHeight}px`;
        } else {
            ta.style.height = "";
            this.syncExpandBtn();
        }
    }

    // ── Download ──────────────────────────────────────────────────────────────

    download(): void {
        const a = document.createElement("a");
        a.href = this.ui.generatedImage.src;
        a.download = this.imageTitle;
        a.click();
    }

    // ── Drive upload ──────────────────────────────────────────────────────────

    private setDriveBtnIcon(icon: string): void {
        const span = this.ui.driveUploadBtn.querySelector(".material-icon");
        if (span) span.textContent = icon;
    }

    async uploadToDrive(): Promise<void> {
        if (!this.ui.generatedImage.src) return;
        const btn = this.ui.driveUploadBtn;
        btn.disabled = true;
        btn.setAttribute("aria-busy", "true");
        this.setDriveBtnIcon("progress_activity");
        try {
            await callDriveUpload(this.ui.generatedImage.src, this.imageTitle);
            this.setDriveBtnIcon("cloud_done");
            setTimeout(() => this.setDriveBtnIcon("cloud_upload"), 2000);
        } catch (err) {
            this.setDriveBtnIcon("cloud_upload");
            this.showError(err);
        } finally {
            btn.disabled = false;
            btn.removeAttribute("aria-busy");
        }
    }

    private applyDriveStatus(s: { configured: boolean; connected: boolean }): void {
        if (!s.configured) {
            this.ui.driveUploadBtn.classList.add("hidden");
            return;
        }
        this.ui.googleConnect?.classList.toggle("hidden", s.connected);
        this.ui.googleDriveOk?.classList.toggle("hidden", !s.connected);
        this.ui.driveUploadBtn.classList.toggle("hidden", !s.connected);
    }

    private async refreshDriveUi(): Promise<void> {
        try {
            this.applyDriveStatus(await callDriveStatus());
        } catch {
            // ignore: Drive optional or server down
        }
    }

    private handleDriveQueryParams(): void {
        const u = new URL(window.location.href);
        const d = u.searchParams.get("drive");
        if (!d) return;
        u.searchParams.delete("drive");
        history.replaceState({}, "", u.pathname + u.search + u.hash);
        if (d === "error") {
            this.showError(new Error(
                'Google sign-in failed. Try "Connect Google Drive" again.',
            ));
        }
    }

    // ── Bootstrap ─────────────────────────────────────────────────────────────

    private applyAspectFromSettings(): void {
        const a = settings.aspect;
        this.ui.aspectLand.checked = a === "landscape";
        this.ui.aspectPort.checked = a === "portrait";
        this.ui.aspectSquare.checked = a === "square";
    }

    private bindAspectRadios(): void {
        const rads = [this.ui.aspectLand, this.ui.aspectPort, this.ui.aspectSquare];
        for (const r of rads) {
            r.addEventListener("change", () => {
                if (r.checked) settings.aspect = r.value as AspectFormat;
            });
        }
    }

    private bindGenerateEvents(): void {
        this.ui.themeToggle.addEventListener("click", () => {
            const next = settings.theme === "light" ? "dark" : "light";
            settings.theme = next;
            this.applyTheme(next);
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
            this.syncExpandBtn();
        });
        this.ui.textareaExpandBtn.addEventListener("click", () => this.toggleTextareaExpand());
        this.ui.enhanceBtn.addEventListener("click", () => this.enhance());
        this.ui.downloadBtn.addEventListener("click", () => this.download());
        this.ui.driveUploadBtn.addEventListener("click", () => this.uploadToDrive());
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
        this.bindAspectRadios();
        this.bindGenerateEvents();
        this.bindDescribeEvents();
    }

    init(): void {
        this.applyTheme(settings.theme);
        this.applyAspectFromSettings();
        this.handleDriveQueryParams();
        void this.refreshDriveUi();
        this.history.load().catch(() => undefined);
    }
}
