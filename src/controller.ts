import { settings } from "./settings.js";
import { b64Mime, callGenerate, callOptimize } from "./api.js";
import { HistoryManager, ImageEntry } from "./history.js";

export interface UI {
    themeToggle:            HTMLButtonElement;
    prompt:                 HTMLTextAreaElement;
    generateBtn:            HTMLButtonElement;
    optimizeBtn:            HTMLButtonElement;
    promptBar:              HTMLDivElement;
    promptToggle:           HTMLButtonElement;
    imageContainer:         HTMLDivElement;
    generatedImage:         HTMLImageElement;
    loadingOverlay:         HTMLDivElement;
    loadingMsg:             HTMLSpanElement;
    optimizedPromptDisplay: HTMLDivElement;
    blockedMsg:             HTMLDivElement;
    errorMsg:               HTMLDivElement;
    downloadBtn:            HTMLButtonElement;
    historyPanel:           HTMLDivElement;
    historyToggle:          HTMLButtonElement;
    historyCount:           HTMLSpanElement;
    historyList:            HTMLDivElement;
}

export class Controller {
    private ui: UI;
    private isRunning = false;
    private imageTitle = "generated-image";
    private history = new HistoryManager();

    constructor(ui: UI) {
        this.ui = ui;
    }

    // ── View updates ──────────────────────────────────────────────────────────

    private applyTheme(theme: string): void {
        const isLight = theme === "light";
        document.documentElement.setAttribute("data-theme", theme);
        this.ui.themeToggle.innerHTML = `<span class="material-icon">${isLight ? "dark_mode" : "light_mode"}</span>`;
        const label = isLight ? "Switch to dark mode" : "Switch to light mode";
        this.ui.themeToggle.setAttribute("aria-label", label);
        this.ui.themeToggle.title = label;
    }

    private setExpanded(expanded: boolean): void {
        this.ui.promptBar.classList.toggle("expanded", expanded);
        this.ui.promptToggle.setAttribute("aria-expanded", String(expanded));
    }

    private setLoading(active: boolean, msg?: string): void {
        this.ui.loadingMsg.textContent = active ? (msg ?? "Loading…") : "";
        this.ui.loadingOverlay.classList.toggle("hidden", !active);
    }

    private setButtonsDisabled(disabled: boolean): void {
        this.ui.generateBtn.disabled = disabled;
        this.ui.optimizeBtn.disabled = disabled;
        this.ui.historyToggle.disabled = disabled;
        this.ui.historyList.style.pointerEvents = disabled ? "none" : "";
    }

    private resetMessages(): void {
        this.ui.blockedMsg.classList.add("hidden");
        this.ui.errorMsg.classList.add("hidden");
        this.ui.optimizedPromptDisplay.classList.add("hidden");
    }

    // ── History ───────────────────────────────────────────────────────────────

    private renderHistory(): void {
        const images = this.history.getImages();
        const count = images.length;

        this.ui.historyCount.textContent = String(count);
        this.ui.historyPanel.classList.toggle("hidden", count === 0);

        this.ui.historyList.innerHTML = "";
        for (const [i, entry] of images.entries()) {
            const btn = document.createElement("button");
            btn.className = "history-thumb";
            btn.title = entry.prompt;
            btn.setAttribute("aria-label", entry.prompt);

            const img = document.createElement("img");
            img.src = entry.src;
            img.alt = "";
            img.loading = "lazy";
            btn.appendChild(img);

            const caption = document.createElement("span");
            caption.className = "history-thumb-caption";
            caption.textContent = entry.prompt;
            btn.appendChild(caption);

            btn.addEventListener("click", () => this.restoreFromHistory(i));
            this.ui.historyList.appendChild(btn);
        }
    }

    private restoreFromHistory(index: number): void {
        if (this.isRunning) return;
        const entry = this.history.getImages()[index] as ImageEntry | undefined;
        if (!entry) return;
        this.resetMessages();
        this.ui.generatedImage.src = entry.src;
        this.ui.imageContainer.classList.remove("hidden");
        this.imageTitle = entry.title;
        this.ui.prompt.value = entry.prompt;
    }

    private toggleHistoryPanel(): void {
        const isOpen = this.ui.historyPanel.classList.toggle("open");
        this.ui.historyToggle.setAttribute("aria-expanded", String(isOpen));
        this.ui.historyList.setAttribute("aria-hidden", isOpen ? "false" : "true");
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    private async run(optimize: boolean): Promise<void> {
        const prompt = this.ui.prompt.value.trim();
        if (!prompt || this.isRunning) return;
        this.isRunning = true;
        this.history.resetNav();
        this.ui.prompt.classList.remove("history-nav");

        this.setExpanded(false);
        this.resetMessages();
        this.setLoading(true, optimize ? "Optimizing prompt…" : "Checking prompt…");
        this.setButtonsDisabled(true);

        try {
            const optimizeResult = await callOptimize(prompt, optimize);
            if (optimizeResult.blocked) {
                this.ui.blockedMsg.textContent = optimizeResult.message;
                this.ui.blockedMsg.classList.remove("hidden");
                return;
            }

            const finalPrompt = optimizeResult.optimized;
            if (optimize && finalPrompt !== prompt) {
                this.ui.optimizedPromptDisplay.textContent = `Optimized Prompt: ${finalPrompt}`;
                this.ui.optimizedPromptDisplay.classList.remove("hidden");
            }

            this.setLoading(true, "Generating image — this may take a while…");
            const { image, title } = await callGenerate(finalPrompt);
            this.imageTitle = title;

            const src = `data:${b64Mime(image)};base64,${image}`;
            this.ui.generatedImage.src = src;
            this.ui.imageContainer.classList.remove("hidden");

            this.history.addImage({ prompt: finalPrompt, src, title });
            this.renderHistory();
            await this.history.save(prompt);
        } catch (err) {
            this.ui.errorMsg.textContent = err instanceof Error
                ? err.message
                : "Something went wrong. Is Ollama running?";
            this.ui.errorMsg.classList.remove("hidden");
        } finally {
            this.isRunning = false;
            this.setLoading(false);
            this.setButtonsDisabled(false);
        }
    }

    download(): void {
        // TODO: prepend/append a user-defined prefix or suffix (stored in
        // localStorage, restored on load) to this.imageTitle before downloading.
        const a = document.createElement("a");
        a.href = this.ui.generatedImage.src;
        a.download = this.imageTitle;
        a.click();
    }

    // ── Bootstrap ─────────────────────────────────────────────────────────────

    bindEvents(): void {
        this.ui.themeToggle.addEventListener("click", () => {
            const next = settings.theme === "light" ? "dark" : "light";
            settings.theme = next;
            this.applyTheme(next);
        });
        this.ui.promptToggle.addEventListener("click", () => {
            this.setExpanded(true);
            this.ui.prompt.focus();
        });
        document.getElementById("prompt-close")?.addEventListener("click", () => this.setExpanded(false));
        this.ui.generateBtn.addEventListener("click", () => this.run(false));
        this.ui.optimizeBtn.addEventListener("click", () => this.run(true));
        this.ui.prompt.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.run(true); }

            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                const dir = e.key === "ArrowUp" ? "up" : "down";
                const value = this.ui.prompt.value;
                const pos = this.ui.prompt.selectionStart ?? 0;

                // Trigger history nav on ArrowUp from first line, or while already navigating
                const atFirstLine = !value.slice(0, pos).includes("\n");
                if (this.history.isNavigating() || (dir === "up" && atFirstLine)) {
                    const result = this.history.navigate(dir, value);
                    if (result !== null) {
                        e.preventDefault();
                        this.ui.prompt.value = result;
                        // Place cursor at end of restored prompt
                        this.ui.prompt.selectionStart = this.ui.prompt.selectionEnd = result.length;
                    }
                    this.ui.prompt.classList.toggle("history-nav", this.history.isNavigating());
                }
            }
        });
        this.ui.prompt.addEventListener("input", () => {
            if (this.history.isNavigating()) {
                this.history.resetNav();
                this.ui.prompt.classList.remove("history-nav");
            }
        });
        this.ui.downloadBtn.addEventListener("click", () => this.download());
        this.ui.historyToggle.addEventListener("click", () => this.toggleHistoryPanel());
    }

    init(): void {
        this.applyTheme(settings.theme);
        this.history.load().catch(() => undefined);
    }
}
