import { beforeEach, describe, expect, it, vi } from "vitest";
import { Controller, type UI } from "./controller.js";

vi.mock("./api.js", () => ({
    b64Mime:      vi.fn(() => "image/png"),
    callOptimize: vi.fn(),
    callGenerate: vi.fn(),
    callDescribe: vi.fn(),
}));

import { callOptimize, callGenerate, callDescribe } from "./api.js";

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

        <button id="tab-generate" class="tab active"></button>
        <button id="tab-describe" class="tab"></button>
        <div id="generate-panel"></div>
        <div id="describe-panel" class="hidden"></div>
        <input type="file" id="image-upload">
        <button id="upload-trigger-btn"></button>
        <img id="upload-preview" class="hidden">
        <button id="describe-btn" disabled></button>
        <button id="use-as-prompt-btn" class="hidden"></button>
        <div id="describe-result" class="hidden"></div>
    `;
    return {
        themeToggle:     document.getElementById("theme-toggle")       as HTMLButtonElement,
        prompt:          document.getElementById("prompt")             as HTMLTextAreaElement,
        generateBtn:     document.getElementById("generate-btn")       as HTMLButtonElement,
        optimizeOnlyBtn: document.getElementById("optimize-only-btn")  as HTMLButtonElement,
        promptBar:       document.getElementById("prompt-bar")         as HTMLDivElement,
        promptToggle:    document.getElementById("prompt-toggle")      as HTMLButtonElement,
        imageContainer:  document.getElementById("image-container")    as HTMLDivElement,
        generatedImage:  document.getElementById("generated-image")    as HTMLImageElement,
        loadingOverlay:  document.getElementById("loading-overlay")    as HTMLDivElement,
        loadingMsg:      document.getElementById("loading-msg")        as HTMLSpanElement,
        blockedMsg:      document.getElementById("blocked-msg")        as HTMLDivElement,
        errorMsg:        document.getElementById("error-msg")          as HTMLDivElement,
        fallbackMsg:     document.getElementById("fallback-msg")       as HTMLDivElement,
        enhanceBtn:      document.getElementById("enhance-btn")        as HTMLButtonElement,
        downloadBtn:     document.getElementById("download-btn")       as HTMLButtonElement,
        historyPanel:    document.getElementById("history-panel")      as HTMLDivElement,
        historyToggle:   document.getElementById("history-toggle")     as HTMLButtonElement,
        historyCount:    document.getElementById("history-count")      as HTMLSpanElement,
        historyList:     document.getElementById("history-list")       as HTMLDivElement,
        tabGenerate:     document.getElementById("tab-generate")       as HTMLButtonElement,
        tabDescribe:     document.getElementById("tab-describe")       as HTMLButtonElement,
        generatePanel:   document.getElementById("generate-panel")     as HTMLDivElement,
        describePanel:   document.getElementById("describe-panel")     as HTMLDivElement,
        imageUpload:     document.getElementById("image-upload")       as HTMLInputElement,
        uploadTriggerBtn: document.getElementById("upload-trigger-btn") as HTMLButtonElement,
        uploadPreview:   document.getElementById("upload-preview")     as HTMLImageElement,
        describeBtn:     document.getElementById("describe-btn")       as HTMLButtonElement,
        useAsPromptBtn:  document.getElementById("use-as-prompt-btn")  as HTMLButtonElement,
        describeResult:  document.getElementById("describe-result")    as HTMLDivElement,
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

// ── describe tab ──────────────────────────────────────────────────────────────

describe("describe tab", () => {
    let ui: UI;

    beforeEach(() => {
        ui = makeUI();
        vi.mocked(callDescribe).mockResolvedValue("A fluffy cat on a mat.");
        new Controller(ui).bindEvents();
    });

    it("clicking describe tab shows describe panel and hides generate panel", () => {
        ui.tabDescribe.click();
        expect(ui.describePanel.classList.contains("hidden")).toBe(false);
        expect(ui.generatePanel.classList.contains("hidden")).toBe(true);
        expect(ui.tabDescribe.classList.contains("active")).toBe(true);
        expect(ui.tabGenerate.classList.contains("active")).toBe(false);
    });

    it("clicking generate tab restores generate panel", () => {
        ui.tabDescribe.click();
        ui.tabGenerate.click();
        expect(ui.generatePanel.classList.contains("hidden")).toBe(false);
        expect(ui.describePanel.classList.contains("hidden")).toBe(true);
        expect(ui.tabGenerate.classList.contains("active")).toBe(true);
    });

    it("describe button is disabled initially", () => {
        expect(ui.describeBtn.disabled).toBe(true);
    });

    it("upload trigger button clicks the file input", () => {
        const clickSpy = vi.spyOn(ui.imageUpload, "click");
        ui.uploadTriggerBtn.click();
        expect(clickSpy).toHaveBeenCalledOnce();
    });

    it("successful describe shows result and use-as-prompt button", async () => {
        Object.defineProperty(ui.imageUpload, "files", {
            value: [new File(["data"], "test.png", { type: "image/png" })],
            configurable: true,
        });
        ui.imageUpload.dispatchEvent(new Event("change"));

        await vi.waitFor(() => expect(ui.describeBtn.disabled).toBe(false));

        ui.describeBtn.click();
        await vi.waitFor(() => expect(ui.describeResult.classList.contains("hidden")).toBe(false));

        expect(ui.describeResult.textContent).toBe("A fluffy cat on a mat.");
        expect(ui.useAsPromptBtn.classList.contains("hidden")).toBe(false);
    });

    it("use as prompt fills generate textarea and switches to generate tab", async () => {
        ui.describeResult.textContent = "A fluffy cat on a mat.";
        ui.describeResult.classList.remove("hidden");
        ui.tabDescribe.click();

        ui.useAsPromptBtn.click();

        expect(ui.prompt.value).toBe("A fluffy cat on a mat.");
        expect(ui.generatePanel.classList.contains("hidden")).toBe(false);
    });

    it("describe error shows error message", async () => {
        vi.mocked(callDescribe).mockRejectedValue(new Error("Vision model not found"));

        Object.defineProperty(ui.imageUpload, "files", {
            value: [new File(["data"], "test.png", { type: "image/png" })],
            configurable: true,
        });
        ui.imageUpload.dispatchEvent(new Event("change"));

        await vi.waitFor(() => expect(ui.describeBtn.disabled).toBe(false));

        ui.describeBtn.click();
        await vi.waitFor(() => expect(ui.errorMsg.classList.contains("hidden")).toBe(false));
        expect(ui.errorMsg.textContent).toContain("Vision model not found");
    });
});
