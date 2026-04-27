export type AspectFormat = "square" | "landscape" | "portrait";

const ASPECT_KEY = "aspect";

function isAspect(s: string): s is AspectFormat {
    return s === "square" || s === "landscape" || s === "portrait";
}

export const settings = {
    get theme(): string { return localStorage.getItem("theme") ?? "dark"; },
    set theme(value: string) { localStorage.setItem("theme", value); },
    get aspect(): AspectFormat {
        const v = localStorage.getItem(ASPECT_KEY) ?? "square";
        return isAspect(v) ? v : "square";
    },
    set aspect(value: AspectFormat) { localStorage.setItem(ASPECT_KEY, value); },
};
