import os
import random

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

load_dotenv()

app = Flask(__name__)

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


def ollama_post(url, **kwargs):
    """Wrapper around requests.post with structured error handling."""
    try:
        resp = requests.post(url, **kwargs)
    except requests.exceptions.RequestException:
        return None, {"error": "Cannot reach Ollama. Is it running?"}
    if resp.status_code == 404:
        return None, {"error": "Model not found in Ollama. Is it pulled?"}
    if not resp.ok:
        return None, {"error": f"Ollama error: HTTP {resp.status_code}"}
    return resp, None


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/optimize", methods=["POST"])
def optimize():
    data = request.get_json()
    prompt = (data or {}).get("prompt", "").strip()
    do_optimize = (data or {}).get("optimize", False)
    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400

    system = OPTIMIZE_PROMPT if do_optimize else SAFETY_ONLY_PROMPT
    resp, err = ollama_post(
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
        return jsonify(err), 502

    content = resp.json()["message"]["content"].strip()

    if _is_refusal(content):
        return jsonify({
            "blocked": True,
            "message": random.choice(_BLOCK_MESSAGES),
        })
    if not do_optimize:
        return jsonify({"optimized": None})
    return jsonify({"optimized": content})


@app.route("/api/generate", methods=["POST"])
def generate():
    # Images are never written to disk. The base64 payload travels
    # through memory only and is returned directly to the browser.
    if not IMAGE_MODEL:
        return jsonify({"error": (
            "IMAGE_MODEL is not set. "
            "Add it to your .env file as described in the README."
        )}), 500

    data = request.get_json()
    prompt = (data or {}).get("prompt", "").strip()
    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400

    resp, err = ollama_post(
        ollama_url("/api/generate"),
        json={"model": IMAGE_MODEL, "prompt": prompt, "stream": False},
    )
    if err:
        return jsonify(err), 502

    body = resp.json()
    images = body.get("images")
    image_data = (
        images[0] if images
        else body.get("image", body.get("response", ""))
    )
    return jsonify({"image": image_data})


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "1337"))
    app.run(host=host, port=port, debug=False)
