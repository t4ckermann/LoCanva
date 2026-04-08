import { Controller } from "./controller.js";

const controller = new Controller({
    themeToggle:            document.getElementById("theme-toggle")             as HTMLButtonElement,
    prompt:                 document.getElementById("prompt")                   as HTMLTextAreaElement,
    generateBtn:            document.getElementById("generate-btn")             as HTMLButtonElement,
    optimizeBtn:            document.getElementById("optimize-btn")             as HTMLButtonElement,
    promptBar:              document.getElementById("prompt-bar")               as HTMLDivElement,
    promptToggle:           document.getElementById("prompt-toggle")            as HTMLButtonElement,
    promptClose:            document.getElementById("prompt-close")             as HTMLButtonElement,
    imageContainer:         document.getElementById("image-container")          as HTMLDivElement,
    generatedImage:         document.getElementById("generated-image")          as HTMLImageElement,
    loadingOverlay:         document.getElementById("loading-overlay")          as HTMLDivElement,
    loadingMsg:             document.getElementById("loading-msg")              as HTMLSpanElement,
    optimizedPromptDisplay: document.getElementById("optimized-prompt-display") as HTMLDivElement,
    blockedMsg:             document.getElementById("blocked-msg")              as HTMLDivElement,
    errorMsg:               document.getElementById("error-msg")                as HTMLDivElement,
    downloadBtn:            document.getElementById("download-btn")             as HTMLButtonElement,
});

controller.bindEvents();
controller.init();
