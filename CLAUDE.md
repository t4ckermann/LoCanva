# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Philosophy

Always keep the codebase minimal, clean, and simple. Prefer fewer files, fewer abstractions, and less code. When in doubt, do less.

## Overview

See [README.md](README.md) for setup, running, and configuration.

LoCanva is a locally-hosted canvas app powered by Ollama. Flask backend (`app.py`) serves a single HTML page and proxies to Ollama. TypeScript frontend (`src/`) compiles to `static/js/`.

## Commands

| Task | Command |
|------|---------|
| Build TypeScript | `npm run build` |
| Watch TypeScript | `npm run watch` |
| Lint TypeScript | `npm run lint` |
| Run server | `python app.py` |

## Linting (mandatory)

After creating or modifying **any** code file, always run the appropriate linter and fix all reported issues before considering the task done:

| File type | Command |
|-----------|---------|
| TypeScript (`src/**/*.ts`) | `npm run lint` |
| CSS (`static/css/**/*.css`) | `npx stylelint "static/css/**/*.css"` |
| Python (`*.py`) | `flake8 app.py` |

Do not skip linting. If a linter is not yet installed, install it first.

## Architecture

- **`app.py`** — Flask entrypoint. Serves `templates/index.html` at `/`. Talks to Ollama via `OLLAMA_BASE_URL`. Config via env vars (supports `.env`).
- **`src/`** — TypeScript source. Strict mode, `noUnusedLocals`/`noUnusedParameters` enforced. Compiles to `static/js/` (ESNext modules — do not edit compiled output).
- **`templates/index.html`** — Single page. Loads `static/css/style.css` and `static/js/main.js`.
