import { beforeEach, describe, expect, it, vi } from "vitest";
import { Controller, type UI } from "./controller.js";

vi.mock("./api.js", () => ({
    b64Mime:      vi.fn(() => "image/png"),
    callOptimize: vi.fn(),
    callGenerate: vi.fn(),
}));

import { callOptimize, callGenerate } from "./api.js";

beforeEach(() => { vi.clearAllMocks(); });

// ── DOM fixture ───────────────────────────────────────────────────────────────

function makeUI(): UI {
    document.body.innerHTML = `
        <button id="theme-toggle"></button>
        <textarea id="prompt"></textarea>
        <button id="generate-btn"></button>
        <button id="optimize-only-btn"></button>
        <div id="prompt-bar" class="expanded"></div>
        <button id="prompt-toggle"></button>

        <div id="image-container" class="hidden">
            <img id="generated-image" />
            <button id="enhance-btn" class="hidden"></button>
            <button id="download-btn"></button>
        </div>
        <div id="loading-overlay" class="hidden"></div>
        <span id="loading-msg"></span>
        <div id="blocked-msg" class="hidden"></div>
        <div id="error-msg" class="hidden"></div>
        <div id="fallback-msg" class="hidden"></div>
        <div id="history-panel" class="hidden"></div>
        <button id="history-toggle"></button>
        <span id="history-count"></span>
        <div id="history-list"></div>
    `;
    return {
        themeToggle:     document.getElementById("theme-toggle")      as HTMLButtonElement,
        prompt:          document.getElementById("prompt")            as HTMLTextAreaElement,
        generateBtn:     document.getElementById("generate-btn")      as HTMLButtonElement,
        optimizeOnlyBtn: document.getElementById("optimize-only-btn") as HTMLButtonElement,
        promptBar:       document.getElementById("prompt-bar")        as HTMLDivElement,
        promptToggle:    document.getElementById("prompt-toggle")     as HTMLButtonElement,
        imageContainer:  document.getElementById("image-container")   as HTMLDivElement,
        generatedImage:  document.getElementById("generated-image")   as HTMLImageElement,
        loadingOverlay:  document.getElementById("loading-overlay")   as HTMLDivElement,
        loadingMsg:      document.getElementById("loading-msg")       as HTMLSpanElement,
        blockedMsg:      document.getElementById("blocked-msg")       as HTMLDivElement,
        errorMsg:        document.getElementById("error-msg")         as HTMLDivElement,
        fallbackMsg:     document.getElementById("fallback-msg")      as HTMLDivElement,
        enhanceBtn:      document.getElementById("enhance-btn")       as HTMLButtonElement,
        downloadBtn:     document.getElementById("download-btn")      as HTMLButtonElement,
        historyPanel:    document.getElementById("history-panel")     as HTMLDivElement,
        historyToggle:   document.getElementById("history-toggle")    as HTMLButtonElement,
        historyCount:    document.getElementById("history-count")     as HTMLSpanElement,
        historyList:     document.getElementById("history-list")      as HTMLDivElement,
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

    it("toggle button collapses the prompt bar when expanded", () => {
        ui.promptToggle.click();
        expect(ui.promptBar.classList.contains("expanded")).toBe(false);
        expect(ui.promptToggle.getAttribute("aria-expanded")).toBe("false");
    });

    it("toggle button expands the prompt bar when collapsed", () => {
        ui.promptToggle.click(); // collapse
        ui.promptToggle.click(); // expand
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

// ── enhance mode ──────────────────────────────────────────────────────────────

describe("enhance mode", () => {
    let ui: UI;

    beforeEach(() => {
        ui = makeUI();
        vi.mocked(callOptimize).mockResolvedValue({ blocked: false, optimized: "a cat" });
        vi.mocked(callGenerate).mockResolvedValue({ image: "iVBORabc", title: "a-cat" });
    });

    it("enhance button is hidden before any history is restored", () => {
        new Controller(ui).bindEvents();
        expect(ui.enhanceBtn.classList.contains("hidden")).toBe(true);
    });

    it("enhance button appears after restoring a history entry", async () => {
        const controller = new Controller(ui);
        controller.bindEvents();
        ui.prompt.value = "a cat";

        ui.generateBtn.click();
        await vi.waitFor(() => expect(ui.imageContainer.classList.contains("hidden")).toBe(false));

        const thumb = ui.historyList.querySelector("button") as HTMLButtonElement;
        thumb.click();

        expect(ui.enhanceBtn.classList.contains("hidden")).toBe(false);
    });

    it("starting a new generation hides the enhance button", async () => {
        const controller = new Controller(ui);
        controller.bindEvents();
        ui.prompt.value = "a cat";

        ui.generateBtn.click();
        await vi.waitFor(() => expect(ui.imageContainer.classList.contains("hidden")).toBe(false));

        const thumb = ui.historyList.querySelector("button") as HTMLButtonElement;
        thumb.click();
        ui.enhanceBtn.click();

        ui.prompt.value = "a dog";
        ui.generateBtn.click();
        await vi.waitFor(() => expect(ui.enhanceBtn.classList.contains("hidden")).toBe(true));
    });
});

// ── optimize only ─────────────────────────────────────────────────────────────

describe("optimize only", () => {
    let ui: UI;

    beforeEach(() => {
        ui = makeUI();
        vi.mocked(callOptimize).mockResolvedValue({ blocked: false, optimized: "a majestic cat" });
    });

    it("replaces prompt text with optimized result", async () => {
        const controller = new Controller(ui);
        controller.bindEvents();
        ui.prompt.value = "a cat";

        ui.optimizeOnlyBtn.click();
        await vi.waitFor(() => expect(ui.prompt.value).toBe("a majestic cat"));
    });

    it("does not replace prompt when optimized equals original", async () => {
        vi.mocked(callOptimize).mockResolvedValue({ blocked: false, optimized: "a cat" });
        const controller = new Controller(ui);
        controller.bindEvents();
        ui.prompt.value = "a cat";

        ui.optimizeOnlyBtn.click();
        await vi.waitFor(() => expect(ui.optimizeOnlyBtn.disabled).toBe(false));
        expect(ui.prompt.value).toBe("a cat");
    });

    it("does not generate an image", async () => {
        const controller = new Controller(ui);
        controller.bindEvents();
        ui.prompt.value = "a cat";

        ui.optimizeOnlyBtn.click();
        await vi.waitFor(() => expect(ui.optimizeOnlyBtn.disabled).toBe(false));
        expect(callGenerate).not.toHaveBeenCalled();
    });

    it("does not show blocked message even when API returns blocked", async () => {
        vi.mocked(callOptimize).mockResolvedValue({ blocked: true, message: "Not allowed" });
        const controller = new Controller(ui);
        controller.bindEvents();
        ui.prompt.value = "a cat";

        ui.optimizeOnlyBtn.click();
        await vi.waitFor(() => expect(ui.optimizeOnlyBtn.disabled).toBe(false));
        expect(ui.blockedMsg.classList.contains("hidden")).toBe(true);
    });
});

// ── Enter key ─────────────────────────────────────────────────────────────────

describe("Enter key", () => {
    let ui: UI;

    beforeEach(() => {
        ui = makeUI();
        vi.mocked(callOptimize).mockResolvedValue({ blocked: false, optimized: "a cat" });
        vi.mocked(callGenerate).mockResolvedValue({ image: "iVBORabc", title: "a-cat" });
    });

    it("generates an image without optimizing", async () => {
        const controller = new Controller(ui);
        controller.bindEvents();
        ui.prompt.value = "a cat";

        ui.prompt.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        await vi.waitFor(() => expect(ui.imageContainer.classList.contains("hidden")).toBe(false));

        expect(callOptimize).toHaveBeenCalledWith("a cat", false);
        expect(callGenerate).toHaveBeenCalled();
    });

    it("does not generate when Shift+Enter is pressed", () => {
        const controller = new Controller(ui);
        controller.bindEvents();
        ui.prompt.value = "a cat";

        ui.prompt.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
        expect(callOptimize).not.toHaveBeenCalled();
        expect(callGenerate).not.toHaveBeenCalled();
    });
});

// ── fallback model notification ───────────────────────────────────────────────

describe("fallback model notification", () => {
    let ui: UI;

    beforeEach(() => { ui = makeUI(); });

    it("shows fallback message when response includes fallback_model", async () => {
        vi.mocked(callOptimize).mockResolvedValue({ blocked: false, optimized: "a cat" });
        vi.mocked(callGenerate).mockResolvedValue({
            image: "iVBORabc", title: "a-cat", fallback_model: "x/flux2-klein",
        });
        const controller = new Controller(ui);
        controller.bindEvents();
        ui.prompt.value = "a cat";

        ui.generateBtn.click();
        await vi.waitFor(() => expect(ui.fallbackMsg.classList.contains("hidden")).toBe(false));
        expect(ui.fallbackMsg.textContent).toContain("x/flux2-klein");
    });

    it("does not show fallback message on normal success", async () => {
        vi.mocked(callOptimize).mockResolvedValue({ blocked: false, optimized: "a cat" });
        vi.mocked(callGenerate).mockResolvedValue({ image: "iVBORabc", title: "a-cat" });
        const controller = new Controller(ui);
        controller.bindEvents();
        ui.prompt.value = "a cat";

        ui.generateBtn.click();
        await vi.waitFor(() => expect(ui.imageContainer.classList.contains("hidden")).toBe(false));
        expect(ui.fallbackMsg.classList.contains("hidden")).toBe(true);
    });

    it("clears fallback message on next generation", async () => {
        vi.mocked(callOptimize).mockResolvedValue({ blocked: false, optimized: "a cat" });
        vi.mocked(callGenerate).mockResolvedValueOnce({
            image: "iVBORabc", title: "a-cat", fallback_model: "x/flux2-klein",
        }).mockResolvedValueOnce({ image: "iVBORxyz", title: "a-dog" });
        const controller = new Controller(ui);
        controller.bindEvents();
        ui.prompt.value = "a cat";

        ui.generateBtn.click();
        await vi.waitFor(() => expect(ui.fallbackMsg.classList.contains("hidden")).toBe(false));

        ui.prompt.value = "a dog";
        ui.generateBtn.click();
        await vi.waitFor(() => expect(ui.fallbackMsg.classList.contains("hidden")).toBe(true));
    });
});
