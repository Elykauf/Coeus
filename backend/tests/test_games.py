"""Tests for /api/db/games CRUD endpoints."""
import uuid
import pytest
from tests.conftest import make_game_json, SCHOLAR_MATE_PGN


def test_list_games_empty(client):
    resp = client.get("/api/db/games")
    assert resp.status_code == 200
    assert resp.json() == []


def test_save_and_list_game(client):
    game = make_game_json(title="My Game", white="Alice", black="Bob")
    resp = client.post("/api/db/games", json=game)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    game_id = data["id"]
    assert isinstance(game_id, int)

    games = client.get("/api/db/games").json()
    assert len(games) == 1
    assert games[0]["title"] == "My Game"


def test_get_game_by_id(client):
    game = make_game_json(title="GetById")
    post_resp = client.post("/api/db/games", json=game)
    game_id = post_resp.json()["id"]

    resp = client.get(f"/api/db/games/{game_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "GetById"


def test_get_game_not_found(client):
    resp = client.get("/api/db/games/99999")
    assert resp.status_code == 404


def test_delete_game(client):
    game = make_game_json(title="ToDelete")
    game_id = client.post("/api/db/games", json=game).json()["id"]

    resp = client.delete(f"/api/db/games/{game_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"

    assert client.get(f"/api/db/games/{game_id}").status_code == 404


def test_update_game_meta(client):
    game = make_game_json(title="MetaGame", result="*")
    game_id = client.post("/api/db/games", json=game).json()["id"]

    resp = client.patch(f"/api/db/games/{game_id}/meta", json={"result": "1-0", "white": "Fischer"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"

    updated = client.get(f"/api/db/games/{game_id}").json()
    assert updated["metadata"]["result"] == "1-0"
    assert updated["metadata"]["white"] == "Fischer"


def test_update_meta_not_found(client):
    resp = client.patch("/api/db/games/99999/meta", json={"result": "1-0"})
    assert resp.status_code == 404


def test_upsert_by_uuid(client):
    """Saving a game twice with the same UUID should update rather than duplicate."""
    game_uuid = str(uuid.uuid4())
    game = make_game_json(title="Original", uuid=game_uuid)
    id1 = client.post("/api/db/games", json=game).json()["id"]

    game["title"] = "Updated"
    game["uuid"] = game_uuid
    id2 = client.post("/api/db/games", json=game).json()["id"]

    assert id1 == id2  # same row updated

    games = client.get("/api/db/games").json()
    assert len(games) == 1
    assert games[0]["title"] == "Updated"


def test_list_games_filter_by_player(client):
    client.post("/api/db/games", json=make_game_json(title="Alice Game", white="Alice", black="Bob"))
    client.post("/api/db/games", json=make_game_json(title="Bob Game", white="Charlie", black="Dave"))

    resp = client.get("/api/db/games", params={"player": "Alice"})
    games = resp.json()
    assert len(games) == 1
    assert games[0]["title"] == "Alice Game"


def test_list_games_filter_by_date(client):
    import json as _json

    game1 = make_game_json(title="Old Game")
    game1["metadata"]["date"] = "2022-01-01"
    game2 = make_game_json(title="New Game")
    game2["metadata"]["date"] = "2024-06-01"

    client.post("/api/db/games", json=game1)
    client.post("/api/db/games", json=game2)

    resp = client.get("/api/db/games", params={"date_from": "2024-01-01"})
    games = resp.json()
    titles = [g["title"] for g in games]
    assert "New Game" in titles
    assert "Old Game" not in titles
