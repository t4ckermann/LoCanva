import { settings } from "./settings.js";
import { b64Mime, callGenerate, callOptimize } from "./api.js";

// ── DOM references ────────────────────────────────────────────────────────────
const ui = {
    themeToggle:            document.getElementById("theme-toggle")             as HTMLButtonElement,
    prompt:                 document.getElementById("prompt")                   as HTMLTextAreaElement,
    generateBtn:            document.getElementById("generate-btn")             as HTMLButtonElement,
    optimizeBtn:            document.getElementById("optimize-btn")             as HTMLButtonElement,
    promptBar:              document.getElementById("prompt-bar")               as HTMLDivElement,
    promptToggle:           document.getElementById("prompt-toggle")            as HTMLButtonElement,
    placeholder:            document.getElementById("placeholder")              as HTMLDivElement,
    generatedImage:         document.getElementById("generated-image")          as HTMLImageElement,
    loadingOverlay:         document.getElementById("loading-overlay")          as HTMLDivElement,
    loadingMsg:             document.getElementById("loading-msg")              as HTMLSpanElement,
    optimizedPromptDisplay: document.getElementById("optimized-prompt-display") as HTMLDivElement,
    blockedMsg:             document.getElementById("blocked-msg")              as HTMLDivElement,
    errorMsg:               document.getElementById("error-msg")                as HTMLDivElement,
};

// ── State ─────────────────────────────────────────────────────────────────────
let isRunning = false;

// ── UI helpers ────────────────────────────────────────────────────────────────
function applyTheme(theme: string): void {
    const isLight = theme === "light";
    document.documentElement.setAttribute("data-theme", theme);
    ui.themeToggle.innerHTML = `<span class="material-icon">${isLight ? "dark_mode" : "light_mode"}</span>`;
    const label = isLight ? "Switch to dark mode" : "Switch to light mode";
    ui.themeToggle.setAttribute("aria-label", label);
    ui.themeToggle.title = label;
}

function setExpanded(expanded: boolean): void {
    ui.promptBar.classList.toggle("expanded", expanded);
    ui.promptToggle.setAttribute("aria-expanded", String(expanded));
}

function setLoading(active: boolean, msg?: string): void {
    ui.loadingMsg.textContent = active ? (msg ?? "Loading…") : "";
    ui.loadingOverlay.classList.toggle("hidden", !active);
}

function setButtonsDisabled(disabled: boolean): void {
    ui.generateBtn.disabled = disabled;
    ui.optimizeBtn.disabled = disabled;
}

function resetMessages(): void {
    ui.blockedMsg.classList.add("hidden");
    ui.errorMsg.classList.add("hidden");
    ui.optimizedPromptDisplay.classList.add("hidden");
}

// ── Main action ───────────────────────────────────────────────────────────────
async function run(optimize: boolean): Promise<void> {
    const prompt = ui.prompt.value.trim();
    if (!prompt || isRunning) return;
    isRunning = true;

    resetMessages();
    setLoading(true, optimize ? "Optimizing prompt…" : "Checking prompt…");
    setButtonsDisabled(true);

    try {
        const optimizeResult = await callOptimize(prompt, optimize);
        if (optimizeResult.blocked) {
            ui.blockedMsg.textContent = optimizeResult.message;
            ui.blockedMsg.classList.remove("hidden");
            return;
        }

        const finalPrompt = optimizeResult.optimized;
        if (optimize && finalPrompt !== prompt) {
            ui.optimizedPromptDisplay.textContent = `Optimized Prompt: ${finalPrompt}`;
            ui.optimizedPromptDisplay.classList.remove("hidden");
        }

        setLoading(true, "Generating image — this may take a while…");
        const image = await callGenerate(finalPrompt);

        ui.placeholder.classList.add("hidden");
        ui.generatedImage.src = `data:${b64Mime(image)};base64,${image}`;
        ui.generatedImage.classList.remove("hidden");
        setExpanded(false);
    } catch (err) {
        ui.errorMsg.textContent = err instanceof Error
            ? err.message
            : "Something went wrong. Is Ollama running?";
        ui.errorMsg.classList.remove("hidden");
    } finally {
        isRunning = false;
        setLoading(false);
        setButtonsDisabled(false);
    }
}

// ── Event listeners ───────────────────────────────────────────────────────────
ui.themeToggle.addEventListener("click", () => {
    const next = settings.theme === "light" ? "dark" : "light";
    settings.theme = next;
    applyTheme(next);
});
<<<<<<< HEAD
ui.promptToggle.addEventListener("click", () => {
    const expanding = !ui.promptBar.classList.contains("expanded");
    setExpanded(expanding);
    if (expanding) ui.prompt.focus();
});
ui.generateBtn.addEventListener("click", () => run(false));
ui.optimizeBtn.addEventListener("click", () => run(true));
ui.prompt.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(false);
});

// ── Init ──────────────────────────────────────────────────────────────────────
applyTheme(settings.theme);
