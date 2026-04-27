"""Google Drive OAuth2 (server-side refresh token) and upload."""
import base64
import json
import os
import re
import secrets
from typing import Any
from urllib.parse import urlencode

import httpx

DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"
TOKEN_URL = "https://oauth2.googleapis.com/token"
AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth"
DRIVE_FILES = "https://www.googleapis.com/drive/v3/files"
UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
FOLDER_MIME = "application/vnd.google-apps.folder"


def app_base() -> str:
    return os.environ.get("PUBLIC_BASE_URL", "http://127.0.0.1:1337").rstrip("/")


def redirect_uri() -> str:
    return f"{app_base()}/api/auth/google/callback"


def client_id() -> str:
    return os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()


def client_secret() -> str:
    return os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()


def token_path() -> str:
    default = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), ".google_token.json"
    )
    return os.path.expanduser(os.environ.get("GOOGLE_TOKEN_PATH", default))


def oauth_configured() -> bool:
    return bool(client_id() and client_secret())


def drive_folder_id() -> str:
    return os.environ.get("GOOGLE_DRIVE_FOLDER_ID", "").strip()


def drive_folder_path_segments() -> list[str]:
    """Segments under My Drive, e.g. 'bal/new' -> ['bal', 'new']."""
    raw = os.environ.get("GOOGLE_DRIVE_FOLDER_PATH", "").strip()
    if not raw or raw == "/":
        return []
    p = raw.strip("/")
    return [s for s in p.split("/") if s and s not in (".", "..")]


def _q_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def has_refresh_token() -> bool:
    data = read_token()
    return bool(data and data.get("refresh_token"))


def read_token() -> dict[str, Any] | None:
    path = token_path()
    if not os.path.isfile(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def write_token(data: dict) -> None:
    path = token_path()
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def save_oauth_tokens(body: dict) -> None:
    old = read_token() or {}
    if body.get("refresh_token"):
        old["refresh_token"] = body["refresh_token"]
    for k in ("access_token", "expires_in", "token_type", "scope"):
        if k in body:
            old[k] = body[k]
    if not old.get("refresh_token"):
        raise ValueError(
            "No refresh token stored. In Google Cloud, your OAuth app must be "
            "a Web client; complete the sign-in in this browser with this tab open."
        )
    write_token(old)


def build_authorize_url(state: str) -> str:
    q = {
        "client_id": client_id(),
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": DRIVE_SCOPE,
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    }
    return f"{AUTH_BASE}?{urlencode(q)}"


async def exchange_code_for_tokens(code: str) -> dict:
    form = {
        "client_id": client_id(),
        "client_secret": client_secret(),
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri(),
    }
    async with httpx.AsyncClient(timeout=60.0) as c:
        r = await c.post(TOKEN_URL, data=form)
    r.raise_for_status()
    return r.json()


async def get_access_token() -> str:
    data = read_token() or {}
    rt = data.get("refresh_token")
    if not rt:
        raise ValueError("Not connected to Google Drive")
    form = {
        "client_id": client_id(),
        "client_secret": client_secret(),
        "grant_type": "refresh_token",
        "refresh_token": rt,
    }
    async with httpx.AsyncClient(timeout=60.0) as c:
        r = await c.post(TOKEN_URL, data=form)
    if not r.is_success:
        raise RuntimeError(f"Token refresh failed: HTTP {r.status_code}")
    body = r.json()
    if not body.get("access_token"):
        raise RuntimeError("No access token in refresh response")
    return body["access_token"]


def _upload_meta_json_bytes(filename: str, parent_id: str | None) -> bytes:
    meta: dict[str, Any] = {"name": filename}
    if parent_id:
        meta["parents"] = [parent_id]
    return json.dumps(meta).encode("utf-8")


async def _list_subfolder_id(
    client: httpx.AsyncClient, token: str, parent: str, name: str,
) -> str | None:
    q = (
        f"name = '{_q_escape(name)}' and '{_q_escape(parent)}' in parents and "
        f"mimeType = '{FOLDER_MIME}' and trashed = false"
    )
    r = await client.get(
        DRIVE_FILES,
        params={"q": q, "fields": "files(id)", "pageSize": 5},
        headers={"Authorization": f"Bearer {token}"},
    )
    if not r.is_success:
        raise RuntimeError(f"Drive list failed: HTTP {r.status_code}")
    files = r.json().get("files") or []
    if not files:
        return None
    fid = files[0].get("id")
    return str(fid) if fid else None


async def _create_subfolder(
    client: httpx.AsyncClient, token: str, parent: str, name: str,
) -> str:
    payload = json.dumps({
        "name": name,
        "mimeType": FOLDER_MIME,
        "parents": [parent],
    })
    r = await client.post(
        DRIVE_FILES,
        content=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    if not r.is_success:
        raise RuntimeError(
            f"Create folder {name!r} failed: HTTP {r.status_code} {r.text[:120]}",
        )
    fid = r.json().get("id", "")
    if not fid:
        raise RuntimeError("Drive returned no folder id")
    return str(fid)


async def _find_or_create_subfolder(
    client: httpx.AsyncClient, token: str, parent: str, name: str,
) -> str:
    found = await _list_subfolder_id(client, token, parent, name)
    if found:
        return found
    return await _create_subfolder(client, token, parent, name)


async def resolve_upload_parent_id(access_token: str) -> str | None:
    by_id = drive_folder_id()
    if by_id:
        return by_id
    parts = drive_folder_path_segments()
    if not parts:
        return None
    parent: str = "root"
    async with httpx.AsyncClient(timeout=90.0) as client:
        for seg in parts:
            parent = await _find_or_create_subfolder(client, access_token, parent, seg)
    return parent


def mime_from_b64(b64: str) -> str:
    if b64.startswith("/9j/"):
        return "image/jpeg"
    if b64.startswith("R0lGOD"):
        return "image/gif"
    if b64.startswith("UklGR"):
        return "image/webp"
    return "image/png"


def ext_for_mime(mime: str) -> str:
    part = (mime.split("/")[-1] or "png").lower()
    if part == "jpeg":
        return "jpg"
    return part


def _build_filename(title_base: str, ext: str) -> str:
    base = title_base.strip() or "generated-image"
    if "." in base and re.match(r"^[\w.-]+$", base):
        return base[:120]
    safe = re.sub(r"[^a-z0-9._-]+", "-", base.lower()) or "generated-image"
    return f"{safe}.{ext}"[:120]


def _multipart_bytes(meta_json: bytes, raw: bytes, mime: str) -> tuple[bytes, str]:
    boundary = "locanva-" + secrets.token_hex(8)
    parts = (
        f"--{boundary}\r\nContent-Type: application/json\r\n\r\n".encode() + meta_json +
        f"\r\n--{boundary}\r\nContent-Type: {mime}\r\n\r\n".encode() + raw +
        f"\r\n--{boundary}--\r\n".encode()
    )
    return parts, boundary


async def upload_image_b64(access_token: str, title_base: str, b64: str) -> str:
    parent = await resolve_upload_parent_id(access_token)
    raw = base64.b64decode(b64, validate=False)
    mime = mime_from_b64(b64)
    ext = ext_for_mime(mime)
    name = _build_filename(title_base, ext)
    meta = _upload_meta_json_bytes(name, parent)
    body, boundary = _multipart_bytes(meta, raw, mime)
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": f"multipart/related; boundary={boundary}",
    }
    async with httpx.AsyncClient(timeout=120.0) as c:
        r = await c.post(UPLOAD_URL, content=body, headers=headers)
    if not r.is_success:
        raise RuntimeError(f"Drive upload failed: HTTP {r.status_code}")
    data = r.json()
    fid = data.get("id", "")
    if not fid:
        raise RuntimeError("Drive returned no file id")
    return fid
