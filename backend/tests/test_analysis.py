"""Tests for move validation and Stockfish analysis endpoints."""
import pytest
from tests.conftest import requires_stockfish

STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
AFTER_E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"


# ── Validate moves ─────────────────────────────────────────────────────────────

def test_validate_legal_moves(client):
    resp = client.post("/api/validate-moves", json={"moves": ["e4", "e5", "Nf3", "Nc6"]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["results"] == [True, True, True, True]


def test_validate_illegal_move_stops_early(client):
    resp = client.post("/api/validate-moves", json={"moves": ["e4", "e5", "Ke2", "INVALID"]})
    assert resp.status_code == 200
    results = resp.json()["results"]
    # "INVALID" is never reached because processing stops at first failure
    assert False not in results[:3]  # e4, e5, Ke2 are all legal
    # but INVALID causes a False to be appended and loop to break
    assert results[-1] is False


def test_validate_empty_moves(client):
    resp = client.post("/api/validate-moves", json={"moves": []})
    assert resp.status_code == 200
    assert resp.json()["results"] == []


def test_validate_single_illegal_move(client):
    resp = client.post("/api/validate-moves", json={"moves": ["Qxf7"]})  # illegal from start
    assert resp.status_code == 200
    assert resp.json()["results"] == [False]


def test_validate_scholar_mate(client):
    moves = ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7"]
    resp = client.post("/api/validate-moves", json={"moves": moves})
    assert resp.status_code == 200
    assert all(resp.json()["results"])


# ── Suggest moves (requires Stockfish) ────────────────────────────────────────

@requires_stockfish
def test_suggest_moves_returns_suggestions(client):
    resp = client.post("/api/suggest-moves", data={"fen": STARTING_FEN})
    assert resp.status_code == 200
    data = resp.json()
    assert "suggestions" in data
    assert len(data["suggestions"]) >= 1
    for s in data["suggestions"]:
        assert "san" in s
        assert "eval" in s


@requires_stockfish
def test_suggest_moves_after_e4(client):
    resp = client.post("/api/suggest-moves", data={"fen": AFTER_E4_FEN})
    assert resp.status_code == 200
    suggestions = resp.json()["suggestions"]
    assert len(suggestions) >= 1
    # All returned SANs should be non-empty strings
    for s in suggestions:
        assert isinstance(s["san"], str) and len(s["san"]) > 0


# ── Evaluate position (requires Stockfish) ────────────────────────────────────

@requires_stockfish
def test_evaluate_position(client):
    resp = client.post("/api/evaluate-position", data={"fen": STARTING_FEN, "time_limit": "0.5"})
    assert resp.status_code == 200
    data = resp.json()
    assert "score" in data or "best_move" in data


@requires_stockfish
def test_evaluate_checkmate_position(client):
    # Scholar's Mate final position — black is in checkmate
    mate_fen = "rnb1kbnr/pppp1Qpp/8/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4"
    resp = client.post("/api/evaluate-position", data={"fen": mate_fen, "time_limit": "0.3"})
    assert resp.status_code == 200
