import base64
import os
import re
import secrets
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

load_dotenv()

from google_drive import (  # noqa: E402
    app_base,
    build_authorize_url,
    exchange_code_for_tokens,
    get_access_token,
    has_refresh_token,
    oauth_configured,
    save_oauth_tokens,
    upload_image_b64,
)

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
IMAGE_MODEL = os.environ.get("IMAGE_MODEL", "x/z-image-turbo")
IMAGE_MODEL_FALLBACK = os.environ.get("IMAGE_MODEL_FALLBACK", "")
PROMPT_MODEL = os.environ.get("PROMPT_MODEL", "llama3.2")
VISION_MODEL = os.environ.get("VISION_MODEL", "llama3.2-vision")
if not IMAGE_MODEL:
    print(
        "WARNING: IMAGE_MODEL is not set. "
        "Add it to your .env file as described in the README."
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

DESCRIBE_PROMPT = (
    "Describe this image in detail. Focus on the visual content: "
    "subjects, colors, composition, mood, and any notable elements. "
    "Write in plain English. Do not start with 'This image shows' or similar preambles."
)

OPTIMIZE_PROMPT = (
    "You are a prompt optimizer for an AI image generation tool. "
    "Respond with only the improved image generation prompt — no explanations, no 'I', "
    "no meta-commentary, no preamble, no refusals.\n\n"
    "Examples:\n"
    "User: cat → A fluffy tabby cat in warm afternoon sunlight, "
    "detailed fur, shallow depth of field\n"
    "User: test → A technical test pattern with geometric shapes "
    "and vibrant primary colors on a white background"
)


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-')[:60] or "generated-image"


def ollama_url(path):
    return f"{OLLAMA_BASE_URL.rstrip('/')}{path}"


# Ollama image /api/generate: width & height (model-dependent; common diffusion sizes)
ASPECT_SIZE: dict[str, tuple[int, int]] = {
    "square": (1024, 1024),
    "landscape": (1344, 768),
    "portrait": (768, 1344),
}


def _ollama_image_error_hint(err: dict) -> dict:
    """Clarify that refusal strings come from the user's Ollama model, not LoCanva."""
    msg = err.get("error")
    if not isinstance(msg, str):
        return err
    low = msg.lower()
    needles = (
        "fulfill", "can't", "cannot", "unable to", "refus", "not allowed",
        "inappropriate", "safety", "policy",
    )
    if any(n in low for n in needles):
        return {
            "error": (
                f"{msg} — This message is from your Ollama image model, not from LoCanva. "
                "Try rephrasing the prompt, set IMAGE_MODEL to another model in .env, "
                "or update Ollama / the model."
            ),
        }
    return err


async def _try_generate_image(
    model: str, prompt: str, width: int, height: int,
):
    """Attempt image generation with a single model; returns (body, err)."""
    resp, err = await ollama_post(
        ollama_url("/api/generate"),
        json={
            "model": model,
            "prompt": prompt,
            "stream": False,
            "width": width,
            "height": height,
        },
    )
    if err:
        return None, err
    body = resp.json()
    if body.get("error"):
        return None, _ollama_image_error_hint({"error": body["error"]})
    return body, None


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
    aspect: Literal["square", "landscape", "portrait"] = "square"


class DescribeRequest(BaseModel):
    image: str = ""


class DriveUploadRequest(BaseModel):
    image: str = ""
    title: str = "generated-image"


def _b64_from_payload(s: str) -> str:
    t = s.strip()
    if "," in t and t.lower().startswith("data:"):
        t = t.split(",", 1)[1]
    try:
        base64.b64decode(t, validate=True)
    except (ValueError, TypeError):
        return ""
    return t


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(
        request,
        "index.html",
        {"google_drive": oauth_configured()},
    )


@app.get("/api/drive/status")
async def drive_status():
    if not oauth_configured():
        return JSONResponse({"configured": False, "connected": False})
    return JSONResponse({"configured": True, "connected": has_refresh_token()})


@app.get("/api/auth/google")
async def google_oauth_start():
    if not oauth_configured():
        return JSONResponse(
            {"error": "Google Drive is not configured"},
            status_code=400,
        )
    state = secrets.token_urlsafe(32)
    r = RedirectResponse(build_authorize_url(state))
    r.set_cookie("oauth_state", state, max_age=600, httponly=True, samesite="lax")
    return r


async def _oauth_callback_handler(
    request: Request, state: str, code: str | None, error: str | None,
) -> RedirectResponse:
    loc = f"{app_base()}/"
    if error or not oauth_configured():
        return RedirectResponse(f"{loc}?drive=error")
    cookie = request.cookies.get("oauth_state")
    if not cookie or cookie != state or not code:
        return RedirectResponse(f"{loc}?drive=error")
    try:
        tokens = await exchange_code_for_tokens(code)
        save_oauth_tokens(tokens)
    except (httpx.HTTPError, ValueError, OSError, KeyError):
        return RedirectResponse(f"{loc}?drive=error")
    r = RedirectResponse(f"{loc}?drive=1")
    r.delete_cookie("oauth_state")
    return r


@app.get("/api/auth/google/callback")
async def google_oauth_callback(
    request: Request,
    state: str = "",
    code: str | None = None,
    error: str | None = None,
):
    return await _oauth_callback_handler(request, state, code, error)


async def _drive_upload_handler(body: DriveUploadRequest) -> JSONResponse:
    if not oauth_configured():
        return JSONResponse(
            {"error": "Google Drive is not configured"},
            status_code=400,
        )
    if not has_refresh_token():
        return JSONResponse({"error": "Connect Google Drive first"}, status_code=401)
    b64 = _b64_from_payload(body.image)
    if not b64:
        return JSONResponse({"error": "Invalid or empty image"}, status_code=400)
    title = body.title.strip() or "generated-image"
    try:
        access = await get_access_token()
        file_id = await upload_image_b64(access, title, b64)
    except (httpx.HTTPError, ValueError, OSError, RuntimeError) as ex:
        return JSONResponse({"error": str(ex)}, status_code=502)
    return JSONResponse({"id": file_id})


@app.post("/api/drive/upload")
async def drive_upload(body: DriveUploadRequest):
    return await _drive_upload_handler(body)


@app.post("/api/optimize")
async def optimize(body: OptimizeRequest):
    prompt = body.prompt.strip()
    do_optimize = body.optimize
    if not prompt:
        return JSONResponse({"error": "No prompt provided"}, status_code=400)
    if not do_optimize:
        return JSONResponse({"optimized": None})
    resp, err = await ollama_post(
        ollama_url("/api/chat"),
        json={
            "model": PROMPT_MODEL,
            "stream": False,
            "messages": [
                {"role": "system", "content": OPTIMIZE_PROMPT},
                {"role": "user", "content": prompt},
            ],
        },
    )
    if err:
        return JSONResponse(err, status_code=502)
    content = resp.json()["message"]["content"].strip()
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

    w, h = ASPECT_SIZE[body.aspect]
    body_data, err = await _try_generate_image(IMAGE_MODEL, prompt, w, h)
    fallback_model = None
    if err and IMAGE_MODEL_FALLBACK:
        fallback_model = IMAGE_MODEL_FALLBACK
        body_data, err = await _try_generate_image(
            IMAGE_MODEL_FALLBACK, prompt, w, h,
        )
    if err:
        return JSONResponse(err, status_code=502)

    images = body_data.get("images")
    image_data = (
        images[0] if images
        else body_data.get("image", body_data.get("response", ""))
    )
    if not image_data:
        return JSONResponse(
            {"error": "Ollama returned no image. "
                      "Does the model support image generation?"},
            status_code=502,
        )
    result = {"image": image_data, "title": title}
    if fallback_model:
        result["fallback_model"] = fallback_model
    return JSONResponse(result)


@app.post("/api/describe")
async def describe(body: DescribeRequest):
    if not body.image:
        return JSONResponse({"error": "No image provided"}, status_code=400)

    resp, err = await ollama_post(
        ollama_url("/api/chat"),
        json={
            "model": VISION_MODEL,
            "stream": False,
            "messages": [
                {
                    "role": "user",
                    "content": DESCRIBE_PROMPT,
                    "images": [body.image],
                }
            ],
        },
    )
    if err:
        return JSONResponse(err, status_code=502)

    description = resp.json()["message"]["content"].strip()
    if not description:
        return JSONResponse(
            {"error": "Model returned no description"}, status_code=502
        )
    return JSONResponse({"description": description})


if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "1337"))
    uvicorn.run(app, host=host, port=port)
