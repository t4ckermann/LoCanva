import { beforeEach, describe, expect, it, vi } from "vitest";
import { Controller, type UI } from "./controller.js";

vi.mock("./api.js", () => ({
    b64Mime:      vi.fn(() => "image/png"),
    callOptimize: vi.fn(),
    callGenerate: vi.fn(),
}));

import { callOptimize, callGenerate } from "./api.js";

// ── DOM fixture ───────────────────────────────────────────────────────────────

function makeUI(): UI {
    document.body.innerHTML = `
        <button id="theme-toggle"></button>
        <textarea id="prompt"></textarea>
        <button id="generate-btn"></button>
        <button id="optimize-btn"></button>
        <div id="prompt-bar" class="expanded"></div>
        <button id="prompt-toggle"></button>
        <button id="prompt-close"></button>

        <div id="image-container" class="hidden">
            <img id="generated-image" />
            <button id="download-btn"></button>
        </div>
        <div id="loading-overlay" class="hidden"></div>
        <span id="loading-msg"></span>
        <div id="optimized-prompt-display" class="hidden"></div>
        <div id="blocked-msg" class="hidden"></div>
        <div id="error-msg" class="hidden"></div>
        <div id="history-panel" class="hidden"></div>
        <button id="history-toggle"></button>
        <span id="history-count"></span>
        <div id="history-list"></div>
    `;
    return {
        themeToggle:            document.getElementById("theme-toggle")             as HTMLButtonElement,
        prompt:                 document.getElementById("prompt")                   as HTMLTextAreaElement,
        generateBtn:            document.getElementById("generate-btn")             as HTMLButtonElement,
        optimizeBtn:            document.getElementById("optimize-btn")             as HTMLButtonElement,
        promptBar:              document.getElementById("prompt-bar")               as HTMLDivElement,
        promptToggle:           document.getElementById("prompt-toggle")            as HTMLButtonElement,
        imageContainer:         document.getElementById("image-container")          as HTMLDivElement,
        generatedImage:         document.getElementById("generated-image")          as HTMLImageElement,
        loadingOverlay:         document.getElementById("loading-overlay")          as HTMLDivElement,
        loadingMsg:             document.getElementById("loading-msg")              as HTMLSpanElement,
        optimizedPromptDisplay: document.getElementById("optimized-prompt-display") as HTMLDivElement,
        blockedMsg:             document.getElementById("blocked-msg")              as HTMLDivElement,
        errorMsg:               document.getElementById("error-msg")                as HTMLDivElement,
        downloadBtn:            document.getElementById("download-btn")             as HTMLButtonElement,
        historyPanel:           document.getElementById("history-panel")            as HTMLDivElement,
        historyToggle:          document.getElementById("history-toggle")           as HTMLButtonElement,
        historyCount:           document.getElementById("history-count")            as HTMLSpanElement,
        historyList:            document.getElementById("history-list")             as HTMLDivElement,
    };
}

// ── prompt toggle ─────────────────────────────────────────────────────────────

describe("prompt toggle", () => {
    let ui: UI;

    beforeEach(() => {
        ui = makeUI();
        const controller = new Controller(ui);
        controller.bindEvents();
        controller.init();
    });

    it("close button collapses the prompt bar", () => {
        document.getElementById("prompt-close")!.click();
        expect(ui.promptBar.classList.contains("expanded")).toBe(false);
        expect(ui.promptToggle.getAttribute("aria-expanded")).toBe("false");
    });

    it("open button expands the prompt bar", () => {
        document.getElementById("prompt-close")!.click();
        ui.promptToggle.click();
        expect(ui.promptBar.classList.contains("expanded")).toBe(true);
        expect(ui.promptToggle.getAttribute("aria-expanded")).toBe("true");
    });
});

// ── download button visibility ────────────────────────────────────────────────

describe("download button visibility", () => {
    let ui: UI;

    beforeEach(() => {
        ui = makeUI();
        vi.mocked(callOptimize).mockResolvedValue({ blocked: false, optimized: "a cat" });
        vi.mocked(callGenerate).mockResolvedValue({ image: "iVBORabc", title: "fluffy-cat-sunlight" });
    });

    it("is hidden before any generation", () => {
        expect(ui.imageContainer.classList.contains("hidden")).toBe(true);
    });

    it("becomes visible after a successful generation", async () => {
        const controller = new Controller(ui);
        controller.bindEvents();
        ui.prompt.value = "a cat";

        ui.generateBtn.click();
        await vi.waitFor(() => expect(ui.imageContainer.classList.contains("hidden")).toBe(false));
    });

    it("uses the ollama-generated title as the download filename", async () => {
        const controller = new Controller(ui);
        controller.bindEvents();
        ui.prompt.value = "a cat";

        ui.generateBtn.click();
        await vi.waitFor(() => expect(ui.imageContainer.classList.contains("hidden")).toBe(false));

        const anchor = { href: "", download: "", click: vi.fn() };
        vi.spyOn(document, "createElement").mockReturnValueOnce(anchor as unknown as HTMLAnchorElement);
        controller.download();

        expect(anchor.download).toBe("fluffy-cat-sunlight");
    });
});

// ── download() ────────────────────────────────────────────────────────────────

describe("Controller.download", () => {
    let ui: UI;

    beforeEach(() => { ui = makeUI(); });

    it("creates an anchor with the image src and triggers click", () => {
        ui.generatedImage.src = "data:image/png;base64,abc123";
        const controller = new Controller(ui);

        const anchor = { href: "", download: "", click: vi.fn() };
        vi.spyOn(document, "createElement").mockReturnValueOnce(anchor as unknown as HTMLAnchorElement);

        controller.download();

        expect(anchor.href).toBe("data:image/png;base64,abc123");
        expect(anchor.download).toBe("generated-image");
        expect(anchor.click).toHaveBeenCalledOnce();
    });

    it("download button click triggers download()", () => {
        const controller = new Controller(ui);
        const spy = vi.spyOn(controller, "download");
        controller.bindEvents();

        ui.downloadBtn.click();

        expect(spy).toHaveBeenCalledOnce();
    });
});
