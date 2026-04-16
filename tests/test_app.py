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


# --- /api/optimize ---

class TestOptimize:
    def test_missing_prompt_returns_400(self, client):
        resp = client.post("/api/optimize", json={})
        assert resp.status_code == 400
        assert "error" in resp.json()

    def test_safety_only_safe(self, client):
        with patch("app.ollama_post", new=AsyncMock(return_value=mock_chat_resp("SAFE"))):
            resp = client.post(
                "/api/optimize", json={"prompt": "a cat", "optimize": False}
            )
        assert resp.status_code == 200
        assert resp.json() == {"optimized": None}

    def test_safety_only_blocked(self, client):
        with patch("app.ollama_post", new=AsyncMock(return_value=mock_chat_resp("BLOCKED"))):
            resp = client.post(
                "/api/optimize",
                json={"prompt": "explicit content", "optimize": False},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["blocked"] is True
        assert isinstance(data["message"], str) and data["message"]

    def test_natural_language_refusal_is_not_blocked(self, client):
        # Only the literal "BLOCKED" token triggers a block; LLM prose is passed through.
        refusal = "I cannot create explicit content. Can I help you?"
        with patch("app.ollama_post", new=AsyncMock(return_value=mock_chat_resp(refusal))):
            resp = client.post(
                "/api/optimize",
                json={"prompt": "explicit content", "optimize": True},
            )
        data = resp.json()
        assert "blocked" not in data
        assert data["optimized"] == refusal

    def test_blocked_response_has_no_optimized_field(self, client):
        # Frontend uses `data.blocked` to stop generation — verify the
        # response never includes an `optimized` field when blocked, so
        # there is no ambiguous value the frontend could accidentally use
        # as a generation prompt.
        with patch("app.ollama_post", new=AsyncMock(return_value=mock_chat_resp("BLOCKED"))):
            resp = client.post(
                "/api/optimize",
                json={"prompt": "explicit content", "optimize": True},
            )
        data = resp.json()
        assert data["blocked"] is True
        assert "optimized" not in data

    def test_optimize_returns_improved_prompt(self, client):
        improved = "A majestic cat sitting on a golden throne"
        with patch("app.ollama_post", new=AsyncMock(return_value=mock_chat_resp(improved))):
            resp = client.post(
                "/api/optimize", json={"prompt": "a cat", "optimize": True}
            )
        assert resp.status_code == 200
        assert resp.json() == {"optimized": improved}

    def test_optimize_blocked(self, client):
        with patch("app.ollama_post", new=AsyncMock(return_value=mock_chat_resp("BLOCKED"))):
            resp = client.post(
                "/api/optimize",
                json={"prompt": "explicit content", "optimize": True},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["blocked"] is True
        assert isinstance(data["message"], str) and data["message"]

    def test_ollama_connection_error_returns_502(self, client):
        with patch("app.ollama_post", new=AsyncMock(
            return_value=err_resp("Cannot reach Ollama. Is it running?")
        )):
            resp = client.post(
                "/api/optimize", json={"prompt": "a cat", "optimize": False}
            )
        assert resp.status_code == 502
        assert "Ollama" in resp.json()["error"]

    def test_ollama_404_returns_502_with_hint(self, client):
        with patch("app.ollama_post", new=AsyncMock(
            return_value=err_resp("Model not found in Ollama. Is it pulled?")
        )):
            resp = client.post(
                "/api/optimize", json={"prompt": "a cat", "optimize": False}
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
