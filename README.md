# LoCanva

A locally-hosted canvas app powered by [Ollama](https://ollama.com).

## Requirements

- Python 3.10+
- [Node.js](https://nodejs.org) (LTS) — managed via [nvm](https://github.com/nvm-sh/nvm)
- [Ollama](https://ollama.com) running locally

### Hardware

> **macOS (Apple Silicon) only** — Ollama's image generation support is currently macOS-only. Linux and Windows are not yet supported.

The image models (`x/z-image-turbo` at ~12–16 GB, `x/flux2-klein` at ~13 GB) are loaded into unified memory alongside the OS and other processes, so the effective floor is higher than the model size alone:

| Unified memory | Outcome |
|----------------|---------|
| 16 GB          | Likely too little — reported to fall short by a few hundred MB in practice |
| 20 GB or more  | Confirmed working |

Intel Macs and non-Apple hardware are not supported for image generation at this time.

## Setup

**Environment**

```bash
cp .env.example .env  # then edit .env as needed
```

**Ollama models**

```bash
ollama pull x/z-image-turbo  # image generation (IMAGE_MODEL)
ollama pull x/flux2-klein    # fallback image model (IMAGE_MODEL_FALLBACK)
ollama pull llama3.2         # prompt optimization (PROMPT_MODEL)
```

**Node.js (frontend tooling)**

```bash
nvm install   # installs the version specified in .nvmrc
nvm use       # switches to it
npm install
```

**Python (backend)**

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Pre-commit hook

Tests run automatically before every commit. The Claude Code hook (`.hooks/settings.json`) covers AI commits. For human commits, run once after cloning:

```bash
git config core.hooksPath .hooks
chmod +x .hooks/pre-commit
```

> The hook requires nvm to be installed.

## Running

```bash
nvm use
source venv/bin/activate      # activate Python venv
npm run build                 # compile TypeScript → static/js/
python3 app.py
```

The server starts at `http://127.0.0.1:1337` by default.

## Configuration

| Variable          | Default                   | Description                              |
|-------------------|---------------------------|------------------------------------------|
| `HOST`            | `127.0.0.1`               | Bind address                             |
| `PORT`            | `1337`                    | Listen port                              |
| `OLLAMA_BASE_URL` | `http://localhost:11434`  | Ollama API base URL                      |
| `IMAGE_MODEL`          | `x/z-image-turbo`        | Ollama model used for image generation   |
| `IMAGE_MODEL_FALLBACK` | `""` (disabled)          | Fallback image model tried automatically if `IMAGE_MODEL` fails |
| `PROMPT_MODEL`         | `llama3.2`               | Ollama model used for prompt optimization and safety filtering |

## Network access

By default the server binds to `127.0.0.1` (localhost only) and is **not reachable** from other devices.

To allow access from other devices on your local network:

```bash
HOST=0.0.0.0 python app.py
```

> **Important:** Only do this on a trusted local network. Make sure your router has **no port forwarding** rule for port 1337 — otherwise the app would be reachable from the internet with no authentication.

