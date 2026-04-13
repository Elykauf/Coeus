"""Tests for /api/db/opening-tree endpoints."""
import pytest
from tests.conftest import make_game_json, RUY_LOPEZ_PGN

STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
AFTER_E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"


_seed_counter = 0

def _seed_games(client, n=3, result="1-0"):
    """Seed n games that start with 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6."""
    global _seed_counter
    for i in range(n):
        game = make_game_json(title=f"Ruy Lopez {_seed_counter}", pgn=RUY_LOPEZ_PGN, result=result)
        _seed_counter += 1
        # Include proper moves array with FEN data for opening tree to work
        game["moves"] = [
            {"ply": 1, "san": "e4",  "uci": "e2e4", "fenAfter": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"},
            {"ply": 2, "san": "e5",  "uci": "e7e5", "fenAfter": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2"},
            {"ply": 3, "san": "Nf3", "uci": "g1f3", "fenAfter": "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2"},
            {"ply": 4, "san": "Nc6", "uci": "b8c6", "fenAfter": "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3"},
        ]
        client.post("/api/db/games", json=game)


def test_opening_tree_empty_db(client):
    resp = client.get("/api/db/opening-tree", params={"fen": STARTING_FEN})
    assert resp.status_code == 200
    data = resp.json()
    assert "moves" in data
    assert data["moves"] == []


def test_opening_tree_with_games(client):
    _seed_games(client, n=3, result="1-0")

    resp = client.get("/api/db/opening-tree", params={"fen": STARTING_FEN})
    assert resp.status_code == 200
    moves = resp.json()["moves"]
    assert len(moves) >= 1

    # e4 should appear as the first move
    sans = [m["san"] for m in moves]
    assert "e4" in sans


def test_opening_tree_win_loss_counts(client):
    _seed_games(client, n=2, result="1-0")
    _seed_games(client, n=1, result="0-1")

    resp = client.get("/api/db/opening-tree", params={"fen": STARTING_FEN})
    moves = resp.json()["moves"]
    e4_move = next((m for m in moves if m["san"] == "e4"), None)
    assert e4_move is not None
    assert e4_move["games"] == 3


def test_opening_tree_games_endpoint(client):
    _seed_games(client, n=2, result="1-0")

    resp = client.get(
        "/api/db/opening-tree/games",
        params={"fen": AFTER_E4_FEN, "san": "e5"},
    )
    assert resp.status_code == 200
    games = resp.json()
    assert isinstance(games, list)
    assert len(games) >= 1


def test_opening_tree_games_no_match(client):
    _seed_games(client, n=2)

    resp = client.get(
        "/api/db/opening-tree/games",
        params={"fen": AFTER_E4_FEN, "san": "d5"},  # no games with d5 response
    )
    assert resp.status_code == 200
    assert resp.json() == []
