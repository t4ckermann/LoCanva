# LoCanva

A locally-hosted canvas app powered by [Ollama](https://ollama.com).

## Requirements

- Python 3.10+
- [Node.js](https://nodejs.org) (LTS) — managed via [nvm](https://github.com/nvm-sh/nvm)
- [Ollama](https://ollama.com) running locally

## Setup

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

## Running

```bash
npm run build   # compile TypeScript → static/js/
python app.py
```

The server starts at `http://127.0.0.1:1337` by default.

## Configuration

| Variable          | Default                   | Description                  |
|-------------------|---------------------------|------------------------------|
| `HOST`            | `127.0.0.1`               | Bind address                 |
| `PORT`            | `1337`                    | Listen port                  |
| `OLLAMA_BASE_URL` | `http://localhost:11434`  | Ollama API base URL          |

## Network access

By default the server binds to `127.0.0.1` (localhost only) and is **not reachable** from other devices.

To allow access from other devices on your local network:

```bash
HOST=0.0.0.0 python app.py
```

> **Important:** Only do this on a trusted local network. Make sure your router has **no port forwarding** rule for port 1337 — otherwise the app would be reachable from the internet with no authentication.

