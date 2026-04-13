"""Tests for /api/config endpoints."""
import json
import pytest
from tests.conftest import requires_stockfish


def test_get_config_returns_expected_keys(client):
    resp = client.get("/api/config")
    assert resp.status_code == 200
    data = resp.json()
    assert "stockfish_path" in data
    assert "gemini_api_key" in data
    assert "player_name" in data
    assert "stockfish_threads" in data


def test_post_config_saves_values(client, saved_config):
    payload = {
        "stockfish_path": "/usr/bin/stockfish",
        "gemini_api_key": "",
        "player_name": "TestPlayer",
        "stockfish_threads": 2,
    }
    resp = client.post("/api/config", json=payload)
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"

    # Reload and verify persisted
    resp2 = client.get("/api/config")
    data = resp2.json()
    assert data["player_name"] == "TestPlayer"
    assert data["stockfish_threads"] == 2


def test_post_config_persists_to_file(client, saved_config):
    payload = {
        "stockfish_path": "/tmp/fake-sf",
        "gemini_api_key": "test-key",
        "player_name": "FileTest",
        "stockfish_threads": 1,
    }
    client.post("/api/config", json=payload)
    written = json.loads(saved_config.read_text())
    assert written["player_name"] == "FileTest"
    assert written["gemini_api_key"] == "test-key"


@requires_stockfish
def test_stockfish_test_endpoint_succeeds(client):
    from tests.conftest import _stockfish_path
    payload = {
        "stockfish_path": _stockfish_path(),
        "gemini_api_key": "",
        "player_name": "",
        "stockfish_threads": 1,
    }
    resp = client.post("/api/config/test-stockfish", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert "eval" in data or "message" in data


def test_stockfish_test_bad_path_returns_error(client):
    payload = {
        "stockfish_path": "/nonexistent/stockfish",
        "gemini_api_key": "",
        "player_name": "",
        "stockfish_threads": 1,
    }
    resp = client.post("/api/config/test-stockfish", json=payload)
    assert resp.status_code == 200
    assert resp.json()["status"] == "error"


def test_gemini_test_bad_key_returns_error(client):
    payload = {
        "stockfish_path": "/usr/bin/stockfish",
        "gemini_api_key": "invalid-key-12345",
        "player_name": "",
        "stockfish_threads": 1,
    }
    resp = client.post("/api/config/test-gemini", json=payload)
    assert resp.status_code == 200
    assert resp.json()["status"] == "error"
