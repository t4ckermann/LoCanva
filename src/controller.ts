import { settings } from "./settings.js";
import { b64Mime, callGenerate, callOptimize } from "./api.js";

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
}

export class Controller {
    private ui: UI;
    private isRunning = false;
    private imageTitle = "generated-image";

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
    }

    private resetMessages(): void {
        this.ui.blockedMsg.classList.add("hidden");
        this.ui.errorMsg.classList.add("hidden");
        this.ui.optimizedPromptDisplay.classList.add("hidden");
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    private async run(optimize: boolean): Promise<void> {
        const prompt = this.ui.prompt.value.trim();
        if (!prompt || this.isRunning) return;
        this.isRunning = true;

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

            this.ui.generatedImage.src = `data:${b64Mime(image)};base64,${image}`;
            this.ui.imageContainer.classList.remove("hidden");
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
            const expanding = !this.ui.promptBar.classList.contains("expanded");
            this.setExpanded(expanding);
            if (expanding) this.ui.prompt.focus();
        });
        this.ui.generateBtn.addEventListener("click", () => this.run(false));
        this.ui.optimizeBtn.addEventListener("click", () => this.run(true));
        this.ui.prompt.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.run(true); }
        });
        this.ui.downloadBtn.addEventListener("click", () => this.download());
    }

    init(): void {
        this.applyTheme(settings.theme);
    }
}
