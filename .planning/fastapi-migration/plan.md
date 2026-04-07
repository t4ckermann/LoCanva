# FastAPI + Uvicorn Migration Plan

**Project:** LoCanva  
**Date:** 2026-04-07  
**Scope:** Replace Flask + requests with FastAPI + httpx + Uvicorn. No feature changes — structural and async improvements only.

---

## Why

- Flask is synchronous (WSGI); FastAPI is async (ASGI) — better fit for I/O-bound proxy work
- `/api/generate` makes two sequential Ollama calls (title + image); with `asyncio.gather` they run concurrently, cutting latency ~50%
- `httpx` is the async-native HTTP client; `requests` is synchronous

---

## 1. Dependency Changes

### `requirements.txt` — final state

```
fastapi>=0.111.0
uvicorn[standard]>=0.29.0
httpx>=0.27.0
python-dotenv>=1.0.0
jinja2>=3.1.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
anyio[trio]>=4.0.0
```

**Removed:** `flask`, `requests`  
**Added:** `fastapi`, `uvicorn[standard]`, `httpx`, `jinja2` (FastAPI does not bundle it), `pytest-asyncio`

```bash
pip install -r requirements.txt
```

---

## 2. `app.py` Changes

### Imports and app setup

```python
# Remove
import requests
from flask import Flask, jsonify, render_template, request
app = Flask(__name__)

# Add
import asyncio
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")
```

All prompt constants, `_slugify`, `_is_refusal`, `_BLOCK_MESSAGES`, `_REFUSAL_PREFIXES`, `ollama_url`, and config env vars are **unchanged**.

### `ollama_post` → async

```python
async def ollama_post(url: str, **kwargs):
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, **kwargs)
    except httpx.RequestError:
        return None, {"error": "Cannot reach Ollama. Is it running?"}
    if resp.status_code == 404:
        return None, {"error": "Model not found in Ollama. Is it pulled?"}
    if not resp.is_success:
        return None, {"error": f"Ollama error: HTTP {resp.status_code}"}
    return resp, None
```

Key differences: `requests.exceptions.RequestException` → `httpx.RequestError`, `resp.ok` → `resp.is_success`.

### `GET /`

```python
@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})
```

### `POST /api/optimize`

```python
@app.post("/api/optimize")
async def optimize(request: Request):
    data = await request.json()
    # rest of body unchanged except:
    # - jsonify(...) → JSONResponse(...)
    # - return ..., 400 → return JSONResponse(..., status_code=400)
    # - ollama_post(...) → await ollama_post(...)
```

### `POST /api/generate` — concurrent Ollama calls

The main logic change: title and image calls fire simultaneously.

```python
@app.post("/api/generate")
async def generate(request: Request):
    ...
    (title_resp, title_err), (img_resp, img_err) = await asyncio.gather(
        ollama_post(ollama_url("/api/chat"), json=title_payload),
        ollama_post(ollama_url("/api/generate"), json=image_payload),
    )
    # fallback and response logic unchanged
```

### Entry point

```python
if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "1337"))
    uvicorn.run("app:app", host=host, port=port, reload=False)
```

---

## 3. `server.sh` Changes

Update the `nohup` line in `start()`:

```bash
# Before
nohup "$PYTHON" "$DIR/app.py" >> "$LOG_FILE" 2>&1 &

# After
nohup "$DIR/venv/bin/uvicorn" app:app \
    --host "${HOST:-127.0.0.1}" \
    --port "${PORT:-1337}" \
    --no-access-log \
    >> "$LOG_FILE" 2>&1 &
```

---

## 4. `tests/test_app.py` Changes

### Client fixture

```python
from fastapi.testclient import TestClient
import app as application

@pytest.fixture
def client():
    with TestClient(application.app) as c:
        yield c
```

### Mock helpers — update to httpx interface

```python
def mock_chat(content):
    m = MagicMock()
    m.json.return_value = {"message": {"content": content}}
    m.is_success = True   # was: m.ok = True
    m.status_code = 200
    return m
```

### Patch target — patch `ollama_post` directly

```python
from unittest.mock import AsyncMock

# Before
with patch("app.requests.post", return_value=mock_chat("SAFE")):
    ...

# After
with patch("app.ollama_post", AsyncMock(return_value=(mock_chat("SAFE"), None))):
    ...
```

For generate tests with two calls (side effects):

```python
mock_fn = AsyncMock(side_effect=[
    (mock_chat("fluffy-cat"), None),
    (mock_generate(images=["base64data"]), None),
])
with patch("app.ollama_post", mock_fn):
    ...
```

### Error tests — return the error tuple directly

```python
# Before: raise requests.exceptions.ConnectionError
# After:
with patch("app.ollama_post", AsyncMock(return_value=(None, {"error": "Cannot reach Ollama. Is it running?"}))):
    ...
```

---

## 5. Execution Order

1. Edit `requirements.txt`
2. `pip install -r requirements.txt`
3. Rewrite `app.py`
4. Update `server.sh`
5. Rewrite `tests/test_app.py`
6. Run `pytest tests/` — all tests should pass
7. Smoke test: `./server.sh start`, open `http://127.0.0.1:1337/`

---

## 6. What Does Not Change

- `templates/index.html`
- `static/` assets
- `.env` / all env var names (`OLLAMA_BASE_URL`, `IMAGE_MODEL`, `PROMPT_MODEL`, `HOST`, `PORT`)
- All prompt constants, `_slugify`, `_is_refusal`, `_BLOCK_MESSAGES`, `_REFUSAL_PREFIXES`
- `conftest.py`
