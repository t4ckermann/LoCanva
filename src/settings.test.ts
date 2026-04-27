import { afterEach, describe, expect, it } from "vitest";
import { settings } from "./settings.js";

describe("settings", () => {
    afterEach(() => localStorage.clear());

    it("returns dark by default", () => {
        expect(settings.theme).toBe("dark");
    });

    it("returns stored theme", () => {
        localStorage.setItem("theme", "light");
        expect(settings.theme).toBe("light");
    });

    it("persists theme when set", () => {
        settings.theme = "light";
        expect(localStorage.getItem("theme")).toBe("light");
        expect(settings.theme).toBe("light");
    });

    it("overwrites existing theme", () => {
        settings.theme = "light";
        settings.theme = "dark";
        expect(settings.theme).toBe("dark");
    });

    it("returns square by default for aspect", () => {
        expect(settings.aspect).toBe("square");
    });

    it("returns stored aspect", () => {
        localStorage.setItem("aspect", "landscape");
        expect(settings.aspect).toBe("landscape");
    });

    it("persists aspect when set", () => {
        settings.aspect = "portrait";
        expect(localStorage.getItem("aspect")).toBe("portrait");
        expect(settings.aspect).toBe("portrait");
    });

    it("treats invalid aspect as square", () => {
        localStorage.setItem("aspect", "wide");
        expect(settings.aspect).toBe("square");
    });
});
