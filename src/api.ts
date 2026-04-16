export type OptimizeResult =
    | { blocked: false; optimized: string }
    | { blocked: true; message: string };

export async function callOptimize(prompt: string, optimize: boolean): Promise<OptimizeResult> {
    const resp = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, optimize }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    if (data.blocked) return { blocked: true, message: data.message ?? "Not happening." };
    return { blocked: false, optimized: data.optimized ?? prompt };
}

export async function callGenerate(
    prompt: string,
): Promise<{ image: string; title: string; fallback_model?: string }> {
    const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
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

export function b64Mime(b64: string): string {
    if (b64.startsWith("/9j/"))   return "image/jpeg";
    if (b64.startsWith("R0lGOD")) return "image/gif";
    if (b64.startsWith("UklGR"))  return "image/webp";
    return "image/png";
}
