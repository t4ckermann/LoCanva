import os
import tempfile
from unittest.mock import MagicMock, patch

import pytest

import app as application


@pytest.fixture
def client():
    application.app.config["TESTING"] = True
    with application.app.test_client() as c:
        yield c


def mock_chat(content):
    m = MagicMock()
    m.json.return_value = {"message": {"content": content}}
    return m


def mock_generate(images=None, response=""):
    m = MagicMock()
    body = {}
    if images is not None:
        body["images"] = images
    else:
        body["response"] = response
    m.json.return_value = body
    return m


def side_effects(*mocks):
    """Return mocks in sequence as a side_effect list."""
    return list(mocks)


# --- /api/optimize ---

class TestOptimize:
    def test_missing_prompt_returns_400(self, client):
        resp = client.post("/api/optimize", json={})
        assert resp.status_code == 400
        assert "error" in resp.get_json()

    def test_safety_only_safe(self, client):
        with patch("app.requests.post", return_value=mock_chat("SAFE")):
            resp = client.post(
                "/api/optimize", json={"prompt": "a cat", "optimize": False}
            )
        assert resp.status_code == 200
        assert resp.get_json() == {"optimized": None}

    def test_safety_only_blocked(self, client):
        with patch("app.requests.post", return_value=mock_chat("BLOCKED")):
            resp = client.post(
                "/api/optimize",
                json={"prompt": "explicit content", "optimize": False},
            )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["blocked"] is True
        assert isinstance(data["message"], str) and data["message"]

    def test_natural_language_refusal_is_blocked(self, client):
        refusal = "I cannot create explicit content. Can I help you?"
        with patch("app.requests.post", return_value=mock_chat(refusal)):
            resp = client.post(
                "/api/optimize",
                json={"prompt": "explicit content", "optimize": True},
            )
        data = resp.get_json()
        assert data["blocked"] is True
        assert isinstance(data["message"], str) and data["message"]

    def test_blocked_response_has_no_optimized_field(self, client):
        # Frontend uses `data.blocked` to stop generation — verify the
        # response never includes an `optimized` field when blocked, so
        # there is no ambiguous value the frontend could accidentally use
        # as a generation prompt.
        with patch("app.requests.post", return_value=mock_chat("BLOCKED")):
            resp = client.post(
                "/api/optimize",
                json={"prompt": "explicit content", "optimize": True},
            )
        data = resp.get_json()
        assert data["blocked"] is True
        assert "optimized" not in data

    def test_optimize_returns_improved_prompt(self, client):
        improved = "A majestic cat sitting on a golden throne"
        with patch("app.requests.post", return_value=mock_chat(improved)):
            resp = client.post(
                "/api/optimize", json={"prompt": "a cat", "optimize": True}
            )
        assert resp.status_code == 200
        assert resp.get_json() == {"optimized": improved}

    def test_optimize_blocked(self, client):
        with patch("app.requests.post", return_value=mock_chat("BLOCKED")):
            resp = client.post(
                "/api/optimize",
                json={"prompt": "explicit content", "optimize": True},
            )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["blocked"] is True
        assert isinstance(data["message"], str) and data["message"]

    def test_ollama_connection_error_returns_502(self, client):
        import requests as req
        err = req.exceptions.ConnectionError()
        with patch("app.requests.post", side_effect=err):
            resp = client.post(
                "/api/optimize", json={"prompt": "a cat", "optimize": False}
            )
        assert resp.status_code == 502
        assert "Ollama" in resp.get_json()["error"]

    def test_ollama_404_returns_502_with_hint(self, client):
        mock = MagicMock(status_code=404, ok=False)
        with patch("app.requests.post", return_value=mock):
            resp = client.post(
                "/api/optimize", json={"prompt": "a cat", "optimize": False}
            )
        assert resp.status_code == 502
        assert "pulled" in resp.get_json()["error"].lower()


# --- /api/generate ---

class TestGenerate:
    def test_missing_prompt_returns_400(self, client):
        resp = client.post("/api/generate", json={})
        assert resp.status_code == 400

    def test_missing_model_returns_500_with_readme_hint(self, client):
        with patch.object(application, "IMAGE_MODEL", ""):
            resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 500
        assert "README" in resp.get_json()["error"]

    def test_returns_image_from_images_field(self, client):
        with patch("app.requests.post", side_effect=side_effects(
            mock_chat("fluffy-cat"), mock_generate(images=["base64data"])
        )):
            resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["image"] == "base64data"
        assert data["title"] == "fluffy-cat"

    def test_returns_image_from_response_field(self, client):
        with patch("app.requests.post", side_effect=side_effects(
            mock_chat("fluffy-cat"), mock_generate(response="base64data")
        )):
            resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["image"] == "base64data"

    def test_title_is_slugified(self, client):
        with patch("app.requests.post", side_effect=side_effects(
            mock_chat("A Cat In Sunlight!"), mock_generate(images=["x"])
        )):
            resp = client.post("/api/generate", json={"prompt": "a cat in sunlight"})
        assert resp.get_json()["title"] == "a-cat-in-sunlight"

    def test_title_falls_back_when_title_call_fails(self, client):
        import requests as req
        with patch("app.requests.post", side_effect=[
            req.exceptions.ConnectionError(),
            mock_generate(images=["x"]),
        ]):
            resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 200
        assert resp.get_json()["title"] == "generated-image"

    def test_ollama_connection_error_returns_502(self, client):
        import requests as req
        err = req.exceptions.ConnectionError()
        with patch("app.requests.post", side_effect=err):
            resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 502
        assert "Ollama" in resp.get_json()["error"]

    def test_ollama_404_returns_502_with_hint(self, client):
        mock = MagicMock(status_code=404, ok=False)
        with patch("app.requests.post", return_value=mock):
            resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 502
        assert "pulled" in resp.get_json()["error"].lower()

    def test_image_not_written_to_disk(self, client):
        static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
        tmp_dir = tempfile.gettempdir()

        before_static = set(os.listdir(static_dir))
        before_tmp = set(os.listdir(tmp_dir))

        with patch("app.requests.post", side_effect=side_effects(
            mock_chat("a-cat"), mock_generate(images=["base64imagedata"])
        )):
            resp = client.post("/api/generate", json={"prompt": "a cat"})

        assert resp.status_code == 200
        assert resp.get_json()["image"] == "base64imagedata"
        assert set(os.listdir(static_dir)) == before_static
        assert set(os.listdir(tmp_dir)) == before_tmp
