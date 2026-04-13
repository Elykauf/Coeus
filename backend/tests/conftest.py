"""
Shared fixtures for all backend tests.

Tests must be run from the backend/ directory:
    cd backend && python -m pytest tests/ -v
"""
import json
import os
import shutil
import pytest
from pathlib import Path

# ── Ensure CWD is backend/ ────────────────────────────────────────────────────
# This matters for relative paths used in main.py (config.json, uploads/, etc.)
_backend_dir = Path(__file__).parent.parent
os.chdir(_backend_dir)

# ── Patch DB_PATH before importing main ───────────────────────────────────────
# database.DB_PATH must be replaced BEFORE main.py is imported, because main.py
# calls init_db() at module level.
import database

TEST_DB = _backend_dir / "test_chess.db"
database.DB_PATH = TEST_DB

from fastapi.testclient import TestClient
from main import app  # noqa: E402 — intentionally imported after patching


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def clean_db():
    """Wipe and recreate the test database before each test."""
    if TEST_DB.exists():
        TEST_DB.unlink()
    database.init_db()
    yield
    if TEST_DB.exists():
        TEST_DB.unlink()


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def saved_config():
    """Save config.json and restore it after tests that modify it."""
    config_path = _backend_dir / "config.json"
    original = config_path.read_text() if config_path.exists() else None
    yield config_path
    if original is not None:
        config_path.write_text(original)
    elif config_path.exists():
        config_path.unlink()


# ── Stockfish availability ────────────────────────────────────────────────────

def _stockfish_path() -> str:
    config_path = _backend_dir / "config.json"
    if config_path.exists():
        cfg = json.loads(config_path.read_text())
        return cfg.get("stockfish_path", "")
    return shutil.which("stockfish") or ""


def _stockfish_available() -> bool:
    path = _stockfish_path()
    return bool(path and Path(path).exists())


requires_stockfish = pytest.mark.skipif(
    not _stockfish_available(),
    reason="Stockfish binary not found — set stockfish_path in config.json",
)

# ── Shared test data ──────────────────────────────────────────────────────────

SCHOLAR_MATE_PGN = """\
[Event "Test"]
[Site "?"]
[Date "2024.01.01"]
[White "White"]
[Black "Black"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0
"""

RUY_LOPEZ_PGN = """\
[Event "Test"]
[Site "?"]
[Date "2024.01.01"]
[White "Player"]
[Black "Opponent"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *
"""

def make_game_json(title="Test Game", pgn=None, white="White", black="Black", result="1-0", uuid=None):
    """Minimal game JSON as stored in the database."""
    if pgn is None:
        pgn = SCHOLAR_MATE_PGN
    data = {
        "title": title,
        "pgn": pgn,
        "metadata": {
            "white": white,
            "black": black,
            "result": result,
            "date": "2024-01-01",
            "event": "Test",
        },
        "moves": [
            {"ply": 1, "san": "e4", "fenAfter": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"},
            {"ply": 2, "san": "e5", "fenAfter": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2"},
        ],
        "analysis": [],
    }
    if uuid:
        data["uuid"] = uuid
    return data
