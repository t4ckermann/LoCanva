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
| `PROMPT_MODEL`         | `llama3.2`               | Ollama model used for prompt optimization |
| `GOOGLE_OAUTH_CLIENT_ID` | `""` (disabled)      | [OAuth 2.0 “Web” client](https://console.cloud.google.com/apis/credentials) (Client ID) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | `""` (disabled)  | Same client’s **Client secret** (server-side; never commit `.env`) |
| `GOOGLE_TOKEN_PATH`    | (see text)            | File path for the stored refresh token (default: `<project>/.google_token.json`, gitignored) |
| `PUBLIC_BASE_URL`      | `http://127.0.0.1:1337` | **Authorized redirect URI** in Google Cloud must be `{PUBLIC_BASE_URL}/api/auth/google/callback` |
| `GOOGLE_DRIVE_FOLDER_PATH` | `""` (My Drive root) | Target folder as path under “My Drive”, e.g. `bal/new` (creates `bal` → `new` if missing). Ignored if `GOOGLE_DRIVE_FOLDER_ID` is set. |
| `GOOGLE_DRIVE_FOLDER_ID`   | `""` (disabled)      | Optional. Paste a folder’s ID from its Drive URL (`.../folders/THIS_ID`) to upload there instead of using `GOOGLE_DRIVE_FOLDER_PATH`. |

**Google Drive (optional):** Enable the **Google Drive API** in the same project. In the OAuth client, add the redirect URI from the table. Use **Connect Google Drive** in the footer once; after that, uploads go through the server without another Google sign-in in the app (the refresh token is stored in `GOOGLE_TOKEN_PATH`).

## Network access

By default the server binds to `127.0.0.1` (localhost only) and is **not reachable** from other devices.

To allow access from other devices on your local network:

```bash
HOST=0.0.0.0 python app.py
```

> **Important:** Only do this on a trusted local network. Make sure your router has **no port forwarding** rule for port 1337 — otherwise the app would be reachable from the internet with no authentication.

