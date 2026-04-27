import type { AspectFormat } from "./settings.js";

export type OptimizeResult = { optimized: string | null };

export async function callOptimize(prompt: string, optimize: boolean): Promise<OptimizeResult> {
    const resp = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, optimize }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    const o = data.optimized;
    return { optimized: o === null || o === undefined ? null : String(o) };
}

export async function callGenerate(
    prompt: string,
    aspect: AspectFormat,
): Promise<{ image: string; title: string; fallback_model?: string }> {
    const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, aspect }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    return {
        image: data.image as string,
        title: (data.title as string) || "generated-image",
        fallback_model: data.fallback_model as string | undefined,
    };
}

export async function callDescribe(imageB64: string): Promise<string> {
    const resp = await fetch("/api/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageB64 }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    return data.description as string;
}

export async function callDriveStatus(): Promise<{
    configured: boolean;
    connected: boolean;
}> {
    const resp = await fetch("/api/drive/status");
    return (await resp.json()) as { configured: boolean; connected: boolean };
}

export async function callDriveUpload(image: string, title: string): Promise<string> {
    const resp = await fetch("/api/drive/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, title }),
    });
    const data = await (await resp.json()) as { error?: string; id?: string };
    if (data.error) throw new Error(data.error);
    if (!data.id) throw new Error("Drive upload returned no file id");
    return data.id;
}

export function b64Mime(b64: string): string {
    if (b64.startsWith("/9j/"))   return "image/jpeg";
    if (b64.startsWith("R0lGOD")) return "image/gif";
    if (b64.startsWith("UklGR"))  return "image/webp";
    return "image/png";
}
