import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    b64Mime,
    callDescribe,
    callDriveStatus,
    callDriveUpload,
    callGenerate,
    callOptimize,
} from "./api.js";

// ── fetch mock ────────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: object): Promise<{ json: () => Promise<object> }> {
    return Promise.resolve({ json: () => Promise.resolve(body) });
}

// ── b64Mime ───────────────────────────────────────────────────────────────────
describe("b64Mime", () => {
    it("detects JPEG", () => expect(b64Mime("/9j/abc")).toBe("image/jpeg"));
    it("detects GIF",  () => expect(b64Mime("R0lGODabc")).toBe("image/gif"));
    it("detects WebP", () => expect(b64Mime("UklGRabc")).toBe("image/webp"));
    it("defaults to PNG for unknown data", () => expect(b64Mime("iVBOR")).toBe("image/png"));
});

// ── callOptimize ──────────────────────────────────────────────────────────────
describe("callOptimize", () => {
    beforeEach(() => mockFetch.mockReset());

    it("returns optimized prompt", async () => {
        mockFetch.mockReturnValue(jsonResponse({ optimized: "a sleek cat" }));
        await expect(callOptimize("a cat", true)).resolves.toEqual({
            optimized: "a sleek cat",
        });
    });

    it("returns null optimized when server sends null", async () => {
        mockFetch.mockReturnValue(jsonResponse({ optimized: null }));
        await expect(callOptimize("a cat", false)).resolves.toEqual({
            optimized: null,
        });
    });

    it("throws on server error", async () => {
        mockFetch.mockReturnValue(jsonResponse({ error: "Ollama is not running" }));
        await expect(callOptimize("a cat", false)).rejects.toThrow("Ollama is not running");
    });
});

// ── callGenerate ──────────────────────────────────────────────────────────────
describe("callGenerate", () => {
    beforeEach(() => mockFetch.mockReset());

    it("returns image and title", async () => {
        mockFetch.mockReturnValue(jsonResponse({ image: "abc123==", title: "fluffy-cat" }));
        await expect(callGenerate("a cat", "square")).resolves.toEqual({
            image: "abc123==", title: "fluffy-cat",
        });
    });

    it("falls back to generated-image when title is missing", async () => {
        mockFetch.mockReturnValue(jsonResponse({ image: "abc123==" }));
        const result = await callGenerate("a cat", "square");
        expect(result.title).toBe("generated-image");
    });

    it("throws on server error", async () => {
        mockFetch.mockReturnValue(jsonResponse({ error: "Model not found" }));
        await expect(callGenerate("a cat", "square")).rejects.toThrow("Model not found");
    });

    it("includes fallback_model when present", async () => {
        mockFetch.mockReturnValue(jsonResponse({ image: "x", title: "t", fallback_model: "other" }));
        const result = await callGenerate("a cat", "square");
        expect(result.fallback_model).toBe("other");
    });

    it("sends prompt and aspect in request body", async () => {
        mockFetch.mockReturnValue(jsonResponse({ image: "x", title: "t" }));
        await callGenerate("a red barn", "landscape");
        expect(mockFetch).toHaveBeenCalledWith("/api/generate", expect.objectContaining({
            body: JSON.stringify({ prompt: "a red barn", aspect: "landscape" }),
        }));
    });
});

// ── callDescribe ──────────────────────────────────────────────────────────────
describe("callDescribe", () => {
    beforeEach(() => mockFetch.mockReset());

    it("returns description string", async () => {
        mockFetch.mockReturnValue(jsonResponse({ description: "A fluffy cat on a mat." }));
        await expect(callDescribe("abc123==")).resolves.toBe("A fluffy cat on a mat.");
    });

    it("throws on server error", async () => {
        mockFetch.mockReturnValue(jsonResponse({ error: "Model not found" }));
        await expect(callDescribe("abc123==")).rejects.toThrow("Model not found");
    });

    it("sends image in request body", async () => {
        mockFetch.mockReturnValue(jsonResponse({ description: "A cat." }));
        await callDescribe("base64data==");
        expect(mockFetch).toHaveBeenCalledWith("/api/describe", expect.objectContaining({
            body: JSON.stringify({ image: "base64data==" }),
        }));
    });
});

// ── callDriveStatus / callDriveUpload ─────────────────────────────────────────

describe("callDriveStatus", () => {
    beforeEach(() => mockFetch.mockReset());

    it("returns configured and connected flags", async () => {
        mockFetch.mockReturnValue(jsonResponse({ configured: true, connected: false }));
        await expect(callDriveStatus()).resolves.toEqual({
            configured: true,
            connected: false,
        });
    });
});

describe("callDriveUpload", () => {
    beforeEach(() => mockFetch.mockReset());

    it("returns file id on success", async () => {
        mockFetch.mockReturnValue(jsonResponse({ id: "x1" }));
        await expect(
            callDriveUpload("data:image/png;base64,QQ==", "my-title"),
        ).resolves.toBe("x1");
        expect(mockFetch).toHaveBeenCalledWith("/api/drive/upload", expect.objectContaining({
            method: "POST",
        }));
    });

    it("throws on error body", async () => {
        mockFetch.mockReturnValue(jsonResponse({ error: "nope" }));
        await expect(callDriveUpload("x", "t")).rejects.toThrow("nope");
    });
});
