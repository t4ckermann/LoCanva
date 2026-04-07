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

function setExpanded(expanded: boolean): void {
    promptBar.classList.toggle("expanded", expanded);
    promptToggle.setAttribute("aria-expanded", String(expanded));
}

promptToggle.addEventListener("click", () => {
    setExpanded(!promptBar.classList.contains("expanded"));
});

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

async function run(optimize: boolean): Promise<void> {
    const prompt = promptEl.value.trim();
    if (!prompt) return;

    resetMessages();
    setLoading(true, optimize ? "Optimizing prompt…" : "Checking prompt…");
    generateBtn.disabled = true;
    optimizeBtn.disabled = true;

    try {
        const optResp = await fetch("/api/optimize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, optimize }),
        });
        const optData = await optResp.json();

        if (optData.blocked) {
            setLoading(false);
            blockedMsg.classList.remove("hidden");
            return;
        }

        const finalPrompt: string = optData.optimized ?? prompt;

        if (optimize && optData.optimized) {
            optimizedPromptDisplay.textContent = `Optimized: ${optData.optimized}`;
            optimizedPromptDisplay.classList.remove("hidden");
        }

        setLoading(true, "Generating image — this may take a while…");

        const genResp = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: finalPrompt }),
        });
        const genData = await genResp.json();

        setLoading(false);

        if (genData.error) {
            errorMsg.textContent = genData.error;
            errorMsg.classList.remove("hidden");
            return;
        }

        placeholder.classList.add("hidden");
        generatedImage.src = `data:image/png;base64,${genData.image}`;
        generatedImage.classList.remove("hidden");
        setExpanded(false);
    } catch {
        setLoading(false);
        errorMsg.textContent = "Something went wrong. Is Ollama running?";
        errorMsg.classList.remove("hidden");
    } finally {
        generateBtn.disabled = false;
        optimizeBtn.disabled = false;
    }
}

generateBtn.addEventListener("click", () => run(false));
optimizeBtn.addEventListener("click", () => run(true));

promptEl.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        run(false);
    }
});
