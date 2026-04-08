const DB_NAME = "locanva";
const DB_VERSION = 1;
const STORE_NAME = "data";
const PROMPTS_KEY = "prompts";
const MAX_PROMPTS = 200;

export interface ImageEntry {
    prompt: string;
    src: string;
    title: string;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE_NAME)) {
                req.result.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export class HistoryManager {
    private images: ImageEntry[] = [];
    private prompts: string[] = [];
    private navIndex = -1;  // -1 = not navigating
    private draft = "";     // textarea value before navigation started

    // ── Session image history ─────────────────────────────────────────────────

    addImage(entry: ImageEntry): void { this.images.unshift(entry); }
    getImages(): readonly ImageEntry[] { return this.images; }

    // ── Prompt history (IndexedDB) ────────────────────────────────────────────

    async load(): Promise<void> {
        try {
            const db = await openDB();
            await new Promise<void>((res, rej) => {
                const tx = db.transaction(STORE_NAME, "readonly");
                const req = tx.objectStore(STORE_NAME).get(PROMPTS_KEY);
                req.onsuccess = () => {
                    if (Array.isArray(req.result)) this.prompts = req.result as string[];
                    res();
                };
                req.onerror = () => rej(req.error);
            });
        } catch {
            // IndexedDB unavailable — proceed without persistent history
        }
    }

    async save(prompt: string): Promise<void> {
        const text = prompt.trim();
        if (!text) return;
        this.prompts = this.prompts.filter(p => p !== text);
        this.prompts.unshift(text);
        if (this.prompts.length > MAX_PROMPTS) this.prompts.length = MAX_PROMPTS;
        this.navIndex = -1;
        try {
            const db = await openDB();
            await new Promise<void>((res, rej) => {
                const tx = db.transaction(STORE_NAME, "readwrite");
                tx.objectStore(STORE_NAME).put(this.prompts, PROMPTS_KEY);
                tx.oncomplete = () => res();
                tx.onerror = () => rej(tx.error);
            });
        } catch {
            // Fail silently
        }
    }

    // ── Arrow-key navigation ──────────────────────────────────────────────────

    /** Navigate prompt history. Returns the prompt to show, or null if nothing changes. */
    navigate(dir: "up" | "down", current: string): string | null {
        if (this.prompts.length === 0) return null;
        return dir === "up" ? this.navigateUp(current) : this.navigateDown();
    }

    private navigateUp(current: string): string | null {
        if (this.navIndex === -1) { this.draft = current; this.navIndex = 0; }
        else if (this.navIndex < this.prompts.length - 1) { this.navIndex++; }
        else return null;
        return this.prompts[this.navIndex];
    }

    private navigateDown(): string | null {
        if (this.navIndex === -1) return null;
        if (this.navIndex > 0) { this.navIndex--; return this.prompts[this.navIndex]; }
        this.navIndex = -1;
        return this.draft;
    }

    isNavigating(): boolean { return this.navIndex !== -1; }
    resetNav(): void { this.navIndex = -1; this.draft = ""; }
}
