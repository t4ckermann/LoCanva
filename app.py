import os
import random
import re

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

load_dotenv()

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
IMAGE_MODEL = os.environ.get("IMAGE_MODEL", "x/z-image-turbo")
PROMPT_MODEL = os.environ.get("PROMPT_MODEL", "llama3.2")

if not IMAGE_MODEL:
    print(
        "WARNING: IMAGE_MODEL is not set. "
        "Add it to your .env file as described in the README."
    )

SAFETY_ONLY_PROMPT = (
    "You are a safety checker for an AI image generation tool. "
    "Your only valid responses are the single word SAFE or the single "
    "word BLOCKED — nothing else, no punctuation, no explanation.\n\n"
    "Respond with BLOCKED only if the prompt explicitly requests "
    "pornographic or sexual content, nudity, or deepfakes. "
    "Respond with SAFE for everything else.\n\n"
    "Examples:\n"
    "User: a cat → SAFE\n"
    "User: naked people → BLOCKED\n"
    "User: test → SAFE"
)

TITLE_PROMPT = (
    "You are a filename generator for AI-generated images. "
    "Given an image description, respond with only a short filename: "
    "2–5 lowercase words joined by hyphens, no extension, no punctuation. "
    "Examples:\n"
    "User: a fluffy cat in warm sunlight → fluffy-cat-sunlight\n"
    "User: mountain landscape at dusk → mountain-landscape-dusk\n"
    "User: test → test-image"
)

OPTIMIZE_PROMPT = (
    "You are a prompt optimizer for an AI image generation tool. "
    "Your only valid responses are the single word BLOCKED or an "
    "improved image generation prompt — no explanations, no 'I', "
    "no meta-commentary, no preamble.\n\n"
    "Respond with BLOCKED only if the prompt explicitly requests "
    "pornographic or sexual content, nudity, or deepfakes. "
    "For ALL other prompts, respond with only the improved prompt.\n\n"
    "Examples:\n"
    "User: cat → A fluffy tabby cat in warm afternoon sunlight, "
    "detailed fur, shallow depth of field\n"
    "User: naked people → BLOCKED\n"
    "User: test → A technical test pattern with geometric shapes "
    "and vibrant primary colors on a white background"
)


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-')[:60] or "generated-image"


def ollama_url(path):
    return f"{OLLAMA_BASE_URL.rstrip('/')}{path}"


_BLOCK_MESSAGES = [
    "This is LoCanva, not PornCanva. Try a sunset instead.",
    "Absolutely not. Your GPU deserves better.",
    "Nice try. Go touch some grass.",
    "Not today. Not ever. Respect boundaries, even digital ones.",
    "The model said no. So did I.",
    "Bro. No. Just no.",
    "I was built for art, not objectification. Elevate your game.",
]

_REFUSAL_PREFIXES = (
    "blocked",
    "i cannot", "i can't", "i won't", "i will not",
    "i'm unable", "i am unable", "i'm sorry", "i am sorry",
    "sorry,", "sorry.", "apologies,",
)


def _is_refusal(text: str) -> bool:
    lower = text.lower()
    return any(lower.startswith(p) for p in _REFUSAL_PREFIXES)


async def ollama_post(url, **kwargs):
    """Async wrapper around httpx with structured error handling."""
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(url, **kwargs)
    except httpx.RequestError:
        return None, {"error": "Cannot reach Ollama. Is it running?"}
    if resp.status_code == 404:
        return None, {"error": "Model not found in Ollama. Is it pulled?"}
    if not resp.is_success:
        return None, {"error": f"Ollama error: HTTP {resp.status_code}"}
    return resp, None


class OptimizeRequest(BaseModel):
    prompt: str = ""
    optimize: bool = False


class GenerateRequest(BaseModel):
    prompt: str = ""


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


@app.post("/api/optimize")
async def optimize(body: OptimizeRequest):
    prompt = body.prompt.strip()
    do_optimize = body.optimize
    if not prompt:
        return JSONResponse({"error": "No prompt provided"}, status_code=400)

    system = OPTIMIZE_PROMPT if do_optimize else SAFETY_ONLY_PROMPT
    resp, err = await ollama_post(
        ollama_url("/api/chat"),
        json={
            "model": PROMPT_MODEL,
            "stream": False,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        },
    )
    if err:
        return JSONResponse(err, status_code=502)

    content = resp.json()["message"]["content"].strip()

    if _is_refusal(content):
        return JSONResponse({
            "blocked": True,
            "message": random.choice(_BLOCK_MESSAGES),
        })
    if not do_optimize:
        return JSONResponse({"optimized": None})
    return JSONResponse({"optimized": content})


@app.post("/api/generate")
async def generate(body: GenerateRequest):
    # Images are never written to disk. The base64 payload travels
    # through memory only and is returned directly to the browser.
    if not IMAGE_MODEL:
        return JSONResponse({"error": (
            "IMAGE_MODEL is not set. "
            "Add it to your .env file as described in the README."
        )}, status_code=500)

    prompt = body.prompt.strip()
    if not prompt:
        return JSONResponse({"error": "No prompt provided"}, status_code=400)

    title_resp, title_err = await ollama_post(
        ollama_url("/api/chat"),
        json={
            "model": PROMPT_MODEL,
            "stream": False,
            "messages": [
                {"role": "system", "content": TITLE_PROMPT},
                {"role": "user", "content": prompt},
            ],
        },
    )
    title = "generated-image"
    if not title_err:
        title = _slugify(title_resp.json()["message"]["content"])

    resp, err = await ollama_post(
        ollama_url("/api/generate"),
        json={"model": IMAGE_MODEL, "prompt": prompt, "stream": False},
    )
    if err:
        return JSONResponse(err, status_code=502)

    body_data = resp.json()
    images = body_data.get("images")
    image_data = (
        images[0] if images
        else body_data.get("image", body_data.get("response", ""))
    )
    return JSONResponse({"image": image_data, "title": title})


if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "1337"))
    uvicorn.run(app, host=host, port=port)
