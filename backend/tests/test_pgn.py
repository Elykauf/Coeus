"""Tests for PGN file endpoints and save-pgn."""
import uuid
import pytest
from tests.conftest import SCHOLAR_MATE_PGN, RUY_LOPEZ_PGN


def test_list_pgn_files_returns_list(client):
    resp = client.get("/api/games")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_save_pgn_creates_file(client):
    payload = {
        "title": "E2E Save Test",
        "pgn": SCHOLAR_MATE_PGN,
        "game_uuid": str(uuid.uuid4()),
    }
    resp = client.post("/api/save-pgn", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert "filename" in data
    assert data["filename"].endswith(".pgn")


def test_save_pgn_file_retrievable(client):
    game_uuid = str(uuid.uuid4())
    payload = {
        "title": "Retrieve Test",
        "pgn": RUY_LOPEZ_PGN,
        "game_uuid": game_uuid,
    }
    filename = client.post("/api/save-pgn", json=payload).json()["filename"]

    resp = client.get(f"/api/games/{filename}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["filename"] == filename
    assert "pgn" in data


def test_get_pgn_not_found(client):
    resp = client.get("/api/games/nonexistent_file.pgn")
    assert resp.status_code == 404


def test_save_pgn_also_persists_to_db(client):
    """save-pgn with game_uuid should also upsert into the DB."""
    game_uuid = str(uuid.uuid4())
    payload = {
        "title": "DB Persist Test",
        "pgn": SCHOLAR_MATE_PGN,
        "game_uuid": game_uuid,
    }
    client.post("/api/save-pgn", json=payload)

    games = client.get("/api/db/games").json()
    titles = [g["title"] for g in games]
    assert "DB Persist Test" in titles


def test_save_pgn_with_analysis_embeds_annotations(client):
    """When analysis is provided, [%eval] comments are embedded in PGN."""
    game_uuid = str(uuid.uuid4())
    payload = {
        "title": "Annotated Game",
        "pgn": SCHOLAR_MATE_PGN,
        "game_uuid": game_uuid,
        "analysis": [
            {"cpl": 0, "evaluation": 20},
            {"cpl": 5, "evaluation": 30},
        ],
    }
    filename = client.post("/api/save-pgn", json=payload).json()["filename"]
    pgn_content = client.get(f"/api/games/{filename}").json()["pgn"]
    assert "[%eval" in pgn_content


def test_save_pgn_no_uuid_still_creates_file(client):
    """save-pgn without game_uuid still saves the PGN file."""
    payload = {"title": "No UUID Game", "pgn": SCHOLAR_MATE_PGN}
    resp = client.post("/api/save-pgn", json=payload)
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"
