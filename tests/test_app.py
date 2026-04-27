import os
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import app as application
from app import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def mock_chat_resp(content):
    m = MagicMock()
    m.json.return_value = {"message": {"content": content}}
    return (m, None)


def mock_generate_resp(images=None, response="", error=None):
    m = MagicMock()
    body = {}
    if error is not None:
        body["error"] = error
    elif images is not None:
        body["images"] = images
    else:
        body["response"] = response
    m.json.return_value = body
    return (m, None)


def err_resp(message):
    return (None, {"error": message})


# --- / (index) & Drive ---

class TestIndex:
    def test_no_drive_footer_when_unconfigured(self, client):
        with patch.object(application, "oauth_configured", return_value=False):
            resp = client.get("/")
        assert resp.status_code == 200
        assert "google-connect" not in resp.text

    def test_includes_connect_link_when_configured(self, client):
        with patch.object(application, "oauth_configured", return_value=True):
            resp = client.get("/")
        assert resp.status_code == 200
        assert "google-connect" in resp.text
        assert "/api/auth/google" in resp.text


class TestDriveStatus:
    def test_unconfigured(self, client):
        with patch.object(application, "oauth_configured", return_value=False):
            r = client.get("/api/drive/status")
        assert r.json() == {"configured": False, "connected": False}

    def test_configured_not_connected(self, client):
        with patch.object(application, "oauth_configured", return_value=True), patch.object(
            application, "has_refresh_token", return_value=False,
        ):
            r = client.get("/api/drive/status")
        assert r.json() == {"configured": True, "connected": False}


class TestGoogleOAuth:
    def test_start_redirects_to_google(self, client):
        with patch.object(application, "oauth_configured", return_value=True), patch(
            "app.build_authorize_url", return_value="https://accounts.google.com/o?x=1",
        ):
            r = client.get("/api/auth/google", follow_redirects=False)
        assert r.status_code in (302, 303, 307)
        assert r.headers["location"].startswith("https://accounts.google.com/")

    def test_start_returns_400_when_not_configured(self, client):
        with patch.object(application, "oauth_configured", return_value=False):
            r = client.get("/api/auth/google")
        assert r.status_code == 400

    def test_callback_saves_and_redirects_home(self, client):
        tokens = {
            "refresh_token": "rt", "access_token": "at", "expires_in": 3600,
        }
        client.cookies.set("oauth_state", "s1")
        with patch.object(application, "oauth_configured", return_value=True), patch(
            "app.exchange_code_for_tokens", new=AsyncMock(return_value=tokens),
        ) as ex, patch(
            "app.save_oauth_tokens",
        ) as save:
            r = client.get(
                "/api/auth/google/callback?state=s1&code=c1",
                follow_redirects=False,
            )
        assert r.status_code in (302, 303, 307)
        assert "drive=1" in (r.headers.get("location") or "")
        ex.assert_called_once_with("c1")
        save.assert_called_once()
        assert save.call_args[0][0] == tokens

    def test_callback_rejects_state_mismatch(self, client):
        client.cookies.set("oauth_state", "s1")
        with patch.object(application, "oauth_configured", return_value=True):
            r = client.get(
                "/api/auth/google/callback?state=bad&code=c1",
                follow_redirects=False,
            )
        assert r.status_code in (302, 303, 307)
        assert "drive=error" in (r.headers.get("location") or "")


class TestDriveUpload:
    def test_401_without_refresh_token(self, client):
        with patch.object(application, "oauth_configured", return_value=True), patch.object(
            application, "has_refresh_token", return_value=False,
        ):
            r = client.post(
                "/api/drive/upload",
                json={"image": "aGVsbG8=", "title": "t"},
            )
        assert r.status_code == 401

    def test_upload_ok(self, client):
        b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        with patch.object(application, "oauth_configured", return_value=True), patch.object(
            application, "has_refresh_token", return_value=True,
        ), patch("app.get_access_token", new=AsyncMock(return_value="tok")), patch(
            "app.upload_image_b64", new=AsyncMock(return_value="id123"),
        ):
            r = client.post(
                "/api/drive/upload",
                json={"image": b64, "title": "a-cat"},
            )
        assert r.status_code == 200
        assert r.json() == {"id": "id123"}


# --- /api/optimize ---

class TestOptimize:
    def test_missing_prompt_returns_400(self, client):
        resp = client.post("/api/optimize", json={})
        assert resp.status_code == 400
        assert "error" in resp.json()

    def test_optimize_false_skips_ollama(self, client):
        with patch("app.ollama_post", new=AsyncMock()) as m:
            resp = client.post(
                "/api/optimize", json={"prompt": "a cat", "optimize": False},
            )
        assert resp.status_code == 200
        assert resp.json() == {"optimized": None}
        m.assert_not_called()

    def test_optimize_returns_arbitrary_llm_text(self, client):
        text = "I cannot create explicit content. Can I help you?"
        with patch("app.ollama_post", new=AsyncMock(return_value=mock_chat_resp(text))):
            resp = client.post(
                "/api/optimize",
                json={"prompt": "explicit content", "optimize": True},
            )
        assert resp.json() == {"optimized": text}

    def test_optimize_returns_improved_prompt(self, client):
        improved = "A majestic cat sitting on a golden throne"
        with patch("app.ollama_post", new=AsyncMock(return_value=mock_chat_resp(improved))):
            resp = client.post(
                "/api/optimize", json={"prompt": "a cat", "optimize": True}
            )
        assert resp.status_code == 200
        assert resp.json() == {"optimized": improved}

    def test_ollama_connection_error_returns_502(self, client):
        with patch("app.ollama_post", new=AsyncMock(
            return_value=err_resp("Cannot reach Ollama. Is it running?")
        )):
            resp = client.post(
                "/api/optimize", json={"prompt": "a cat", "optimize": True}
            )
        assert resp.status_code == 502
        assert "Ollama" in resp.json()["error"]

    def test_ollama_404_returns_502_with_hint(self, client):
        with patch("app.ollama_post", new=AsyncMock(
            return_value=err_resp("Model not found in Ollama. Is it pulled?")
        )):
            resp = client.post(
                "/api/optimize", json={"prompt": "a cat", "optimize": True}
            )
        assert resp.status_code == 502
        assert "pulled" in resp.json()["error"].lower()


# --- /api/generate ---

class TestGenerate:
    def test_missing_prompt_returns_400(self, client):
        resp = client.post("/api/generate", json={})
        assert resp.status_code == 400

    def test_missing_model_returns_500_with_readme_hint(self, client):
        with patch.object(application, "IMAGE_MODEL", ""):
            resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 500
        assert "README" in resp.json()["error"]

    def test_returns_image_from_images_field(self, client):
        with patch("app.ollama_post", new=AsyncMock(side_effect=[
            mock_chat_resp("fluffy-cat"),
            mock_generate_resp(images=["base64data"]),
        ])):
            resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["image"] == "base64data"
        assert data["title"] == "fluffy-cat"

    def test_ollama_generate_includes_size_for_landscape(self, client):
        mock = AsyncMock(side_effect=[
            mock_chat_resp("t"),
            mock_generate_resp(images=["x"]),
        ])
        with patch("app.ollama_post", new=mock):
            resp = client.post(
                "/api/generate",
                json={"prompt": "a", "aspect": "landscape"},
            )
        assert resp.status_code == 200
        gen_json = mock.call_args_list[1].kwargs["json"]
        assert gen_json["width"] == 1344
        assert gen_json["height"] == 768

    def test_ollama_generate_defaults_to_square_size(self, client):
        mock = AsyncMock(side_effect=[
            mock_chat_resp("t"),
            mock_generate_resp(images=["x"]),
        ])
        with patch("app.ollama_post", new=mock):
            resp = client.post("/api/generate", json={"prompt": "a"})
        assert resp.status_code == 200
        gen_json = mock.call_args_list[1].kwargs["json"]
        assert gen_json["width"] == 1024
        assert gen_json["height"] == 1024

    def test_returns_image_from_response_field(self, client):
        with patch("app.ollama_post", new=AsyncMock(side_effect=[
            mock_chat_resp("fluffy-cat"),
            mock_generate_resp(response="base64data"),
        ])):
            resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["image"] == "base64data"

    def test_title_is_slugified(self, client):
        with patch("app.ollama_post", new=AsyncMock(side_effect=[
            mock_chat_resp("A Cat In Sunlight!"),
            mock_generate_resp(images=["x"]),
        ])):
            resp = client.post("/api/generate", json={"prompt": "a cat in sunlight"})
        assert resp.json()["title"] == "a-cat-in-sunlight"

    def test_title_falls_back_when_title_call_fails(self, client):
        with patch("app.ollama_post", new=AsyncMock(side_effect=[
            err_resp("Cannot reach Ollama. Is it running?"),
            mock_generate_resp(images=["x"]),
        ])):
            resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 200
        assert resp.json()["title"] == "generated-image"

    def test_ollama_connection_error_returns_502(self, client):
        with patch.object(application, "IMAGE_MODEL_FALLBACK", ""):
            with patch("app.ollama_post", new=AsyncMock(side_effect=[
                err_resp("Cannot reach Ollama. Is it running?"),
                err_resp("Cannot reach Ollama. Is it running?"),
            ])):
                resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 502
        assert "Ollama" in resp.json()["error"]
        assert "image model" not in resp.json()["error"].lower()

    def test_model_refusal_appends_explanation(self, client):
        with patch.object(application, "IMAGE_MODEL_FALLBACK", ""):
            with patch("app.ollama_post", new=AsyncMock(side_effect=[
                mock_chat_resp("a"),
                mock_generate_resp(error="I can't fulfill that request."),
            ])):
                resp = client.post("/api/generate", json={"prompt": "x"})
        assert resp.status_code == 502
        err = resp.json()["error"]
        assert "Ollama image model" in err
        assert "LoCanva" in err

    def test_ollama_404_returns_502_with_hint(self, client):
        with patch.object(application, "IMAGE_MODEL_FALLBACK", ""):
            with patch("app.ollama_post", new=AsyncMock(side_effect=[
                err_resp("Model not found in Ollama. Is it pulled?"),
                err_resp("Model not found in Ollama. Is it pulled?"),
            ])):
                resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 502
        assert "pulled" in resp.json()["error"].lower()

    def test_falls_back_to_fallback_model_on_error(self, client):
        with patch.object(application, "IMAGE_MODEL_FALLBACK", "x/flux2-klein"):
            with patch("app.ollama_post", new=AsyncMock(side_effect=[
                mock_chat_resp("a-cat"),
                err_resp("mlx runner failed"),
                mock_generate_resp(images=["fallbackdata"]),
            ])):
                resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["image"] == "fallbackdata"
        assert data["fallback_model"] == "x/flux2-klein"

    def test_no_fallback_when_fallback_model_not_set(self, client):
        with patch.object(application, "IMAGE_MODEL_FALLBACK", ""):
            with patch("app.ollama_post", new=AsyncMock(side_effect=[
                mock_chat_resp("a-cat"),
                err_resp("mlx runner failed"),
            ])):
                resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 502

    def test_fallback_model_not_in_response_on_success(self, client):
        with patch.object(application, "IMAGE_MODEL_FALLBACK", "x/flux2-klein"):
            with patch("app.ollama_post", new=AsyncMock(side_effect=[
                mock_chat_resp("a-cat"),
                mock_generate_resp(images=["data"]),
            ])):
                resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 200
        assert "fallback_model" not in resp.json()

    def test_ollama_body_error_returns_502(self, client):
        with patch.object(application, "IMAGE_MODEL_FALLBACK", ""):
            with patch("app.ollama_post", new=AsyncMock(side_effect=[
                mock_chat_resp("a-cat"),
                mock_generate_resp(error="model does not support image generation"),
            ])):
                resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 502
        assert "model does not support image generation" in resp.json()["error"]

    def test_empty_image_returns_502(self, client):
        with patch("app.ollama_post", new=AsyncMock(side_effect=[
            mock_chat_resp("a-cat"),
            mock_generate_resp(response=""),
        ])):
            resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 502
        assert "no image" in resp.json()["error"].lower()

    def test_image_not_written_to_disk(self, client):
        static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
        tmp_dir = tempfile.gettempdir()

        before_static = set(os.listdir(static_dir))
        before_tmp = set(os.listdir(tmp_dir))

        with patch("app.ollama_post", new=AsyncMock(side_effect=[
            mock_chat_resp("a-cat"),
            mock_generate_resp(images=["base64imagedata"]),
        ])):
            resp = client.post("/api/generate", json={"prompt": "a cat"})

        assert resp.status_code == 200
        assert resp.json()["image"] == "base64imagedata"
        assert set(os.listdir(static_dir)) == before_static
        assert set(os.listdir(tmp_dir)) == before_tmp


# --- /api/describe ---

class TestDescribe:
    def test_missing_image_returns_400(self, client):
        resp = client.post("/api/describe", json={})
        assert resp.status_code == 400
        assert "error" in resp.json()

    def test_returns_description(self, client):
        with patch("app.ollama_post", new=AsyncMock(
            return_value=mock_chat_resp("A golden retriever running on a beach.")
        )):
            resp = client.post("/api/describe", json={"image": "abc123=="})
        assert resp.status_code == 200
        assert resp.json() == {"description": "A golden retriever running on a beach."}

    def test_ollama_connection_error_returns_502(self, client):
        with patch("app.ollama_post", new=AsyncMock(
            return_value=err_resp("Cannot reach Ollama. Is it running?")
        )):
            resp = client.post("/api/describe", json={"image": "abc123=="})
        assert resp.status_code == 502
        assert "Ollama" in resp.json()["error"]

    def test_empty_description_returns_502(self, client):
        with patch("app.ollama_post", new=AsyncMock(return_value=mock_chat_resp(""))):
            resp = client.post("/api/describe", json={"image": "abc123=="})
        assert resp.status_code == 502
        assert "description" in resp.json()["error"].lower()

    def test_sends_image_to_vision_model(self, client):
        captured = {}

        async def capture_post(url, **kwargs):
            captured["json"] = kwargs.get("json", {})
            return mock_chat_resp("A cat.")

        with patch("app.ollama_post", new=capture_post):
            client.post("/api/describe", json={"image": "base64data=="})

        msgs = captured["json"]["messages"]
        assert msgs[0]["images"] == ["base64data=="]
