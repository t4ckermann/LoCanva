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

LoCanva is a locally-hosted canvas app powered by Ollama. Flask backend (`app.py`) serves a single HTML page and proxies to Ollama. TypeScript frontend (`src/`) compiles to `static/js/`.

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

After any edit, also remove dead code — unused variables, functions, imports, CSS rules, and HTML elements that are no longer referenced. Dead code must not accumulate.

## Testing (mandatory)

After any change to `app.py` or `tests/`, always run the test suite and fix all failures before considering the task done:

```bash
pytest tests/
```

When adding or changing backend functionality, add or update tests in `tests/test_app.py` to cover the new behaviour. Every new route, branch, or error case should have a corresponding test.

## Versioning

This project follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`). The version is stored in `package.json`.

- **Bug fix** → increment `PATCH` (e.g. `0.8.1` → `0.8.2`). Do this automatically when fixing a bug.
- **New feature** → increment `MINOR` and reset `PATCH` to `0` (e.g. `0.8.1` → `0.9.0`). Do this automatically when implementing a new feature.
- **Breaking change** → increment `MAJOR` — **this is the user's decision only, never do it automatically**.

**This is mandatory and must not be skipped.** Update `package.json` as part of the same task, before marking it done. After bumping the version, remind the user to create a GitHub Release for the new version.

## Architecture

- **`app.py`** — Flask entrypoint. Serves `templates/index.html` at `/`. Talks to Ollama via `OLLAMA_BASE_URL`. Config via env vars (supports `.env`).
- **`src/`** — TypeScript source. Strict mode, `noUnusedLocals`/`noUnusedParameters` enforced. Compiles to `static/js/` (ESNext modules — do not edit compiled output).
- **`templates/index.html`** — Single page. Loads `static/css/style.css` and `static/js/main.js`.
