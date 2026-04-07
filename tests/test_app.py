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
        assert resp.get_json() == {"blocked": True}

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
        assert resp.get_json() == {"blocked": True}

    def test_ollama_connection_error_returns_502(self, client):
        import requests as req
        err = req.exceptions.ConnectionError()
        with patch("app.requests.post", side_effect=err):
            resp = client.post(
                "/api/optimize", json={"prompt": "a cat", "optimize": False}
            )
        assert resp.status_code == 502
        assert "error" in resp.get_json()

    def test_ollama_404_returns_502_with_hint(self, client):
        import requests as req
        err = req.exceptions.HTTPError(response=MagicMock(status_code=404))
        with patch("app.requests.post", side_effect=err):
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
        mock = mock_generate(images=["base64data"])
        with patch("app.requests.post", return_value=mock):
            resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 200
        assert resp.get_json() == {"image": "base64data"}

    def test_returns_image_from_response_field(self, client):
        mock = mock_generate(response="base64data")
        with patch("app.requests.post", return_value=mock):
            resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 200
        assert resp.get_json() == {"image": "base64data"}

    def test_ollama_connection_error_returns_502(self, client):
        import requests as req
        err = req.exceptions.ConnectionError()
        with patch("app.requests.post", side_effect=err):
            resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 502
        assert "error" in resp.get_json()

    def test_ollama_404_returns_502_with_hint(self, client):
        import requests as req
        err = req.exceptions.HTTPError(response=MagicMock(status_code=404))
        with patch("app.requests.post", side_effect=err):
            resp = client.post("/api/generate", json={"prompt": "a cat"})
        assert resp.status_code == 502
        assert "pulled" in resp.get_json()["error"].lower()
