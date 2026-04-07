import os

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
    "You are a safety checker for an AI image generation tool.\n\n"
    "Respond with exactly BLOCKED only if the prompt explicitly requests "
    "pornographic or sexual content, nudity, or deepfakes. "
    "Do NOT block for any other reason.\n"
    "Otherwise, respond with exactly: SAFE"
)

OPTIMIZE_PROMPT = (
    "You are a prompt optimizer for an AI image generation tool meant "
    "for creative work.\n\n"
    "Your job:\n"
    "1. Respond with exactly BLOCKED only if the prompt explicitly requests "
    "pornographic or sexual content, nudity, or deepfakes. "
    "Do NOT block for any other reason, including vague or simple prompts.\n"
    "2. For ALL other prompts, rewrite them to be more descriptive and vivid "
    "for image generation. Respond with only the improved prompt — "
    "no explanation, no preamble."
)


def ollama_url(path):
    return f"{OLLAMA_BASE_URL.rstrip('/')}{path}"


def ollama_error(e):
    resp = getattr(e, "response", None)
    status = getattr(resp, "status_code", None) if resp else None
    if status == 404:
        return "Model not found in Ollama. Is it pulled?"
    if status is not None:
        return f"Ollama error: HTTP {status}"
    return "Cannot reach Ollama. Is it running?"


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
    try:
        resp = requests.post(
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
        resp.raise_for_status()
    except requests.exceptions.RequestException as e:
        return jsonify({"error": ollama_error(e)}), 502

    content = resp.json()["message"]["content"].strip()

    if content.upper().startswith("BLOCKED"):
        return jsonify({"blocked": True})
    if not do_optimize:
        return jsonify({"optimized": None})
    return jsonify({"optimized": content})


@app.route("/api/generate", methods=["POST"])
def generate():
    if not IMAGE_MODEL:
        return jsonify({"error": (
            "IMAGE_MODEL is not set. "
            "Add it to your .env file as described in the README."
        )}), 500

    data = request.get_json()
    prompt = (data or {}).get("prompt", "").strip()
    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400

    try:
        resp = requests.post(
            ollama_url("/api/generate"),
            json={"model": IMAGE_MODEL, "prompt": prompt, "stream": False},
        )
        resp.raise_for_status()
    except requests.exceptions.RequestException as e:
        return jsonify({"error": ollama_error(e)}), 502

    body = resp.json()
    images = body.get("images")
    image_data = images[0] if images else body.get("response", "")
    return jsonify({"image": image_data})


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "1337"))
    app.run(host=host, port=port, debug=False)
