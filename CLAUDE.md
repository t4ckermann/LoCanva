# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Philosophy

Always keep the codebase minimal, clean, and simple. Prefer fewer files, fewer abstractions, and less code. When in doubt, do less.

Follow these principles in all code:

- **KISS** — Keep It Simple, Stupid. Prefer direct, obvious solutions. Avoid premature abstractions and clever tricks.
- **SOLID**:
  - **S**ingle Responsibility — each function and class does one thing only.
  - **O**pen/Closed — open for extension, closed for modification.
  - **L**iskov Substitution — subtypes must be substitutable for their base types.
  - **I**nterface Segregation — prefer narrow, focused interfaces over broad ones.
  - **D**ependency Inversion — depend on abstractions, not concretions.

## Overview

See [README.md](README.md) for setup, running, and configuration.

LoCanva is a locally-hosted canvas app powered by Ollama. FastAPI backend (`app.py`) serves a single HTML page and proxies to Ollama. TypeScript frontend (`src/`) compiles to `static/js/`.

## Commands

| Task | Command |
|------|---------|
| Build TypeScript | `npm run build` |
| Watch TypeScript | `npm run watch` |
| Lint TypeScript | `npm run lint` |
| Run server | `python app.py` |

## Linting (mandatory)

After creating or modifying **any** code file, always run the appropriate linter and fix all reported issues before considering the task done. Also remove any CSS rules that are no longer referenced by the HTML or JS — dead rules must not accumulate.

| File type | Command |
|-----------|---------|
| TypeScript (`src/**/*.ts`) | `npm run lint` |
| CSS (`static/css/**/*.css`) | `npx stylelint "static/css/**/*.css"` |
| Python (`*.py`) | `flake8 app.py` |

Do not skip linting. If a linter is not yet installed, install it first.

ESLint enforces a cyclomatic complexity limit of 8 and a maximum of 30 lines per function. When a violation is reported, split the function or extract helpers — do not raise the limit. If a file grows large, split it by responsibility into separate modules under `src/`.

After any edit, also remove dead code — unused variables, functions, imports, CSS rules, and HTML elements that are no longer referenced. Dead code must not accumulate.

## Testing (mandatory)

After any change to **any** code file, always run both test suites and fix all failures before considering the task done:

| Scope | Command |
|-------|---------|
| Frontend (`src/**/*.ts`) | `npm test` |
| Backend (`app.py`) | `pytest tests/` |

When adding or changing frontend behaviour, add or update tests in `src/controller.test.ts` (or the relevant `*.test.ts` file) to cover the new behaviour. Every new public method, UI state change, or event handler should have a corresponding test.

When adding or changing backend functionality, add or update tests in `tests/test_app.py` to cover the new behaviour. Every new route, branch, or error case should have a corresponding test.

## Versioning (mandatory)

This project follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`). The version is stored in `package.json`.

- **Bug fix** → increment `PATCH` (e.g. `0.8.1` → `0.8.2`). Do this automatically when fixing a bug.
- **New feature** → increment `MINOR` and reset `PATCH` to `0` (e.g. `0.8.1` → `0.9.0`). Do this automatically when implementing a new feature.
- **Breaking change** → increment `MAJOR` — **this is the user's decision only, never do it automatically**.

**This is mandatory and must not be skipped.** Update `package.json` as part of the same task, before marking it done. After bumping the version, remind the user to create a GitHub Release for the new version.

## Dependencies (mandatory)

When adding a new Python library, always add it to `requirements.txt` in the same task. FastAPI does not bundle optional dependencies (e.g. `jinja2`, `python-multipart`) — they must be listed explicitly.

## UI/UX Conventions

- **Panel layout**: the Generate and Describe panels both use `.prompt-panel` — a two-column grid (`1fr auto`) with a content area on the left and a `.buttons` column on the right. Any new panel-style section must use `.prompt-panel` to stay consistent.
- **Buttons column**: use `.buttons` for the right-hand action column. Secondary action first (top), primary action last (bottom). Contextual buttons (`Use as Prompt`, `Enhance`) start `hidden` and are revealed by the controller — never show them unconditionally.
- **Upload zones**: use `.upload-zone` for image input areas. They must match `textarea#prompt` dimensions (`min-height`), support click-to-open and drag-and-drop, and carry a `.upload-hint` child for the empty state. Hide the hint via CSS (`:has(#upload-preview:not(.hidden))`) — never toggle it from JS.
- **Loading**: call `setExpanded(false)` at the start of any async operation so the loading spinner in the image area is fully visible. Only call `setExpanded(true)` afterwards when the result appears inside the prompt bar (e.g. describe result). Generation results appear in the image area, so the bar stays collapsed.

## Architecture

- **`app.py`** — FastAPI entrypoint. Serves `templates/index.html` at `/`. Talks to Ollama via `OLLAMA_BASE_URL`. Config via env vars (supports `.env`).
- **`src/`** — TypeScript source. Strict mode, `noUnusedLocals`/`noUnusedParameters` enforced. Compiles to `static/js/` (ESNext modules — do not edit compiled output).
- **`templates/index.html`** — Single page. Loads CSS from `static/css/` and `static/js/main.js`.
- **`static/css/`** — Split into three files: `base.css` (reset, variables, typography), `layout.css` (structural layout), `components.css` (buttons, panels, reusable UI).
