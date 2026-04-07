import { beforeEach, describe, expect, it, vi } from "vitest";
import { b64Mime, callGenerate, callOptimize } from "./api.js";

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
            blocked: false,
            optimized: "a sleek cat",
        });
    });

    it("falls back to original when optimized is null", async () => {
        mockFetch.mockReturnValue(jsonResponse({ optimized: null }));
        await expect(callOptimize("a cat", false)).resolves.toEqual({
            blocked: false,
            optimized: "a cat",
        });
    });

    it("returns blocked result with message", async () => {
        mockFetch.mockReturnValue(jsonResponse({ blocked: true, message: "Not today." }));
        await expect(callOptimize("bad prompt", false)).resolves.toEqual({
            blocked: true,
            message: "Not today.",
        });
    });

    it("uses fallback message when server sends none", async () => {
        mockFetch.mockReturnValue(jsonResponse({ blocked: true }));
        const result = await callOptimize("bad prompt", false);
        expect(result).toEqual({ blocked: true, message: "Not happening." });
    });

    it("throws on server error", async () => {
        mockFetch.mockReturnValue(jsonResponse({ error: "Ollama is not running" }));
        await expect(callOptimize("a cat", false)).rejects.toThrow("Ollama is not running");
    });
});

// ── callGenerate ──────────────────────────────────────────────────────────────
describe("callGenerate", () => {
    beforeEach(() => mockFetch.mockReset());

    it("returns base64 image string", async () => {
        mockFetch.mockReturnValue(jsonResponse({ image: "abc123==" }));
        await expect(callGenerate("a cat")).resolves.toBe("abc123==");
    });

    it("throws on server error", async () => {
        mockFetch.mockReturnValue(jsonResponse({ error: "Model not found" }));
        await expect(callGenerate("a cat")).rejects.toThrow("Model not found");
    });

    it("sends prompt in request body", async () => {
        mockFetch.mockReturnValue(jsonResponse({ image: "x" }));
        await callGenerate("a red barn");
        expect(mockFetch).toHaveBeenCalledWith("/api/generate", expect.objectContaining({
            body: JSON.stringify({ prompt: "a red barn" }),
        }));
    });
});
