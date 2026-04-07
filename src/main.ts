const themeToggle = document.getElementById("theme-toggle") as HTMLButtonElement;
const promptEl = document.getElementById("prompt") as HTMLTextAreaElement;
const generateBtn = document.getElementById("generate-btn") as HTMLButtonElement;
const optimizeBtn = document.getElementById("optimize-btn") as HTMLButtonElement;
const promptBar = document.getElementById("prompt-bar") as HTMLDivElement;
const promptToggle = document.getElementById("prompt-toggle") as HTMLButtonElement;
const placeholder = document.getElementById("placeholder") as HTMLDivElement;
const generatedImage = document.getElementById("generated-image") as HTMLImageElement;
const loadingOverlay = document.getElementById("loading-overlay") as HTMLDivElement;
const loadingMsg = document.getElementById("loading-msg") as HTMLSpanElement;
const optimizedPromptDisplay = document.getElementById("optimized-prompt-display") as HTMLDivElement;
const blockedMsg = document.getElementById("blocked-msg") as HTMLDivElement;
const errorMsg = document.getElementById("error-msg") as HTMLDivElement;
const savedTheme = localStorage.getItem("theme") ?? "dark";

let isRunning = false;

function applyTheme(theme: string): void {
    document.documentElement.setAttribute("data-theme", theme);
    const isLight = theme === "light";
    themeToggle.textContent = isLight ? "🌙" : "☀️";
    themeToggle.setAttribute("aria-label", isLight ? "Switch to dark mode" : "Switch to light mode");
    themeToggle.title = isLight ? "Switch to dark mode" : "Switch to light mode";
}

function b64Mime(b64: string): string {
    if (b64.startsWith("/9j/"))   return "image/jpeg";
    if (b64.startsWith("R0lGOD")) return "image/gif";
    if (b64.startsWith("UklGR"))  return "image/webp";
    return "image/png";
}

function setExpanded(expanded: boolean): void {
    promptBar.classList.toggle("expanded", expanded);
    promptToggle.setAttribute("aria-expanded", String(expanded));
}

function setLoading(active: boolean, msg?: string): void {
    if (active) {
        loadingMsg.textContent = msg ?? "Loading…";
        loadingOverlay.classList.remove("hidden");
    } else {
        loadingOverlay.classList.add("hidden");
    }
}

function resetMessages(): void {
    blockedMsg.classList.add("hidden");
    errorMsg.classList.add("hidden");
    optimizedPromptDisplay.classList.add("hidden");
}

async function callOptimize(prompt: string, optimize: boolean): Promise<string | null> {
    const resp = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, optimize }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    if (data.blocked) {
        blockedMsg.textContent = data.message ?? "Not happening.";
        blockedMsg.classList.remove("hidden");
        return null;
    }
    return data.optimized ?? prompt;
}

async function callGenerate(prompt: string): Promise<string> {
    const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    return data.image as string;
}

async function run(optimize: boolean): Promise<void> {
    const prompt = promptEl.value.trim();
    if (!prompt || isRunning) return;
    isRunning = true;

    resetMessages();
    setLoading(true, optimize ? "Optimizing prompt…" : "Checking prompt…");
    generateBtn.disabled = true;
    optimizeBtn.disabled = true;

    try {
        const finalPrompt = await callOptimize(prompt, optimize);
        if (finalPrompt === null) return;

        if (optimize && finalPrompt !== prompt) {
            optimizedPromptDisplay.textContent = `Optimized Prompt: ${finalPrompt}`;
            optimizedPromptDisplay.classList.remove("hidden");
        }

        setLoading(true, "Generating image — this may take a while…");
        const image = await callGenerate(finalPrompt);

        placeholder.classList.add("hidden");
        generatedImage.src = `data:${b64Mime(image)};base64,${image}`;
        generatedImage.classList.remove("hidden");
        setExpanded(false);
    } catch (err) {
        errorMsg.textContent = err instanceof Error
            ? err.message
            : "Something went wrong. Is Ollama running?";
        errorMsg.classList.remove("hidden");
    } finally {
        isRunning = false;
        setLoading(false);
        generateBtn.disabled = false;
        optimizeBtn.disabled = false;
    }
}

themeToggle.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    localStorage.setItem("theme", next);
    applyTheme(next);
});
promptToggle.addEventListener("click", () => {
    setExpanded(!promptBar.classList.contains("expanded"));
});
generateBtn.addEventListener("click", () => run(false));
optimizeBtn.addEventListener("click", () => run(true));
promptEl.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        run(false);
    }
});


applyTheme(savedTheme);



