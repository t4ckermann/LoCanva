export const settings = {
    get theme(): string { return localStorage.getItem("theme") ?? "dark"; },
    set theme(value: string) { localStorage.setItem("theme", value); },
};
