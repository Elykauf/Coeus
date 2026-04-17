import sqlite3
import json
import time
import uuid as uuid_lib
from datetime import date as dt_date
from pathlib import Path
from typing import Optional, List, Dict

import os as _os

DB_PATH = Path(_os.environ.get("CHESS_DB", "chess_games.db"))


def normalize_fen(fen: str) -> str:
    """Strip half-move clock and full-move number — position matching only."""
    return " ".join(fen.split()[:4])


def _get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = _get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS position_cache (
            hash        INTEGER PRIMARY KEY,
            eval_cp     INTEGER,
            cpl         INTEGER,
            pv          TEXT,
            engine_depth INTEGER,
            updated_at  REAL
        );
        
        CREATE TABLE IF NOT EXISTS games (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid        TEXT,
            title       TEXT    NOT NULL DEFAULT '',
            event       TEXT    NOT NULL DEFAULT '',
            site        TEXT    NOT NULL DEFAULT '',
            date        TEXT    NOT NULL DEFAULT '',
            white       TEXT    NOT NULL DEFAULT '',
            black       TEXT    NOT NULL DEFAULT '',
            result      TEXT    NOT NULL DEFAULT '*',
            eco         TEXT    NOT NULL DEFAULT '',
            time_control TEXT   NOT NULL DEFAULT '',
            data        TEXT    NOT NULL,
            created_at  REAL    NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_games_date  ON games(date);
        CREATE INDEX IF NOT EXISTS idx_games_white ON games(white COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_games_black ON games(black COLLATE NOCASE);

        CREATE TABLE IF NOT EXISTS game_moves (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id     INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
            ply         INTEGER NOT NULL,
            san         TEXT    NOT NULL,
            uci         TEXT,
            fen_before  TEXT    NOT NULL,
            fen_after   TEXT    NOT NULL,
            zobrist_before INTEGER,
            zobrist_after  INTEGER,
            eval_cp     INTEGER,
            cpl         INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_moves_fen_before ON game_moves(fen_before);
        CREATE INDEX IF NOT EXISTS idx_moves_game_id   ON game_moves(game_id);
    """)
    conn.commit()

    # Migration: add uuid column to existing databases
    try:
        conn.execute("ALTER TABLE games ADD COLUMN uuid TEXT")
        conn.commit()
    except Exception:
        pass  # Column already exists

    try:
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_games_uuid ON games(uuid) WHERE uuid IS NOT NULL"
        )
        conn.commit()
    except Exception:
        pass

    # Backfill UUIDs for existing rows
    rows = conn.execute("SELECT id FROM games WHERE uuid IS NULL").fetchall()
    for row in rows:
        conn.execute(
            "UPDATE games SET uuid=? WHERE id=?", (str(uuid_lib.uuid4()), row[0])
        )
    if rows:
        conn.commit()

    # Migration: add updated_at column
    try:
        conn.execute("ALTER TABLE games ADD COLUMN updated_at REAL")
        conn.commit()
    except Exception:
        pass  # Column already exists

    # Backfill updated_at from created_at for existing rows
    conn.execute("UPDATE games SET updated_at = created_at WHERE updated_at IS NULL")
    conn.commit()

    # Migration: add zobrist columns to game_moves
    try:
        conn.execute("ALTER TABLE game_moves ADD COLUMN zobrist_before INTEGER")
        conn.commit()
    except Exception:
        pass  # Column already exists
    try:
        conn.execute("ALTER TABLE game_moves ADD COLUMN zobrist_after INTEGER")
        conn.commit()
    except Exception:
        pass  # Column already exists

    # Migration: add analysis_depth column to games
    try:
        conn.execute("ALTER TABLE games ADD COLUMN analysis_depth TEXT")
        conn.commit()
    except Exception:
        pass  # Column already exists

    # Migration: add raw_pgn, opening, last_fen columns to games (avoid loading data blob for list)
    try:
        conn.execute("ALTER TABLE games ADD COLUMN raw_pgn TEXT NOT NULL DEFAULT ''")
        conn.commit()
    except Exception:
        pass  # Column already exists
    try:
        conn.execute("ALTER TABLE games ADD COLUMN opening TEXT NOT NULL DEFAULT ''")
        conn.commit()
    except Exception:
        pass  # Column already exists
    try:
        conn.execute("ALTER TABLE games ADD COLUMN last_fen TEXT NOT NULL DEFAULT ''")
        conn.commit()
    except Exception:
        pass  # Column already exists

    # Backfill: populate new columns for any existing rows that have a data blob but empty new columns
    # This runs once on startup for any pre-existing games.
    try:
        rows = conn.execute(
            "SELECT id, data FROM games WHERE (raw_pgn = '' OR opening = '' OR last_fen = '') AND data != ''"
        ).fetchall()
        for row in rows:
            try:
                d = json.loads(row["data"])
                raw_pgn = d.get("raw_pgn", "") or ""
                opening = d.get("metadata", {}).get("opening", "") or ""
                moves = d.get("moves", [])
                last_fen = moves[-1].get("fenAfter", "") if moves else ""
                conn.execute(
                    "UPDATE games SET raw_pgn=?, opening=?, last_fen=? WHERE id=?",
                    (raw_pgn, opening, last_fen, row["id"]),
                )
            except Exception:
                pass
        if rows:
            conn.commit()
    except Exception:
        pass

    # Migration: add annotation columns to game_moves
    try:
        conn.execute("ALTER TABLE game_moves ADD COLUMN comments TEXT")
        conn.commit()
    except Exception:
        pass  # Column already exists

    try:
        conn.execute("ALTER TABLE game_moves ADD COLUMN key_moment INTEGER")
        conn.commit()
    except Exception:
        pass  # Column already exists

    try:
        conn.execute("ALTER TABLE game_moves ADD COLUMN key_moment_label TEXT")
        conn.commit()
    except Exception:
        pass  # Column already exists
    try:
        conn.execute("ALTER TABLE games ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0")
        conn.commit()
    except Exception:
        pass  # Column already exists

    # Create variations table
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS move_variations (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id     INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                ply         INTEGER NOT NULL,
                variation_index INTEGER NOT NULL DEFAULT 0,
                moves       TEXT NOT NULL,
                eval_cp     INTEGER,
                name        TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_variations_game ON move_variations(game_id, ply);
        """)
        conn.commit()
    except Exception:
        pass  # Table already exists

    # Create cheat_reports table
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS cheat_reports (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id      INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                side         TEXT    NOT NULL,
                player_rating INTEGER,
                fairness_score REAL  NOT NULL,
                confidence   TEXT    NOT NULL,
                report_json  TEXT    NOT NULL,
                created_at   REAL    NOT NULL,
                UNIQUE(game_id, side)
            );
            CREATE INDEX IF NOT EXISTS idx_cheat_reports_confidence ON cheat_reports(confidence);
            CREATE INDEX IF NOT EXISTS idx_cheat_reports_game ON cheat_reports(game_id);
        """)
        conn.commit()
    except Exception:
        pass

    conn.close()


def _insert_moves(conn, game_id: int, game_json: dict):
    from utils.zobrist import calculate_hash
    import chess

    start_fen = game_json.get(
        "startFen",
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    )
    b = chess.Board(start_fen)
    prev_zobrist = calculate_hash(b)
    prev_fen = normalize_fen(start_fen)

    for move in game_json.get("moves", []):
        ev = move.get("evaluation") or {}
        ann = move.get("annotations") or {}
        eval_cp = ev.get("value")
        cpl = ann.get("cpl")

        try:
            m = b.parse_san(move["san"])
            b.push(m)
            curr_zobrist = calculate_hash(b)
        except Exception:
            curr_zobrist = None

        fen_after_n = normalize_fen(move["fenAfter"])
        conn.execute(
            """INSERT INTO game_moves
                   (game_id, ply, san, uci, fen_before, fen_after, zobrist_before, zobrist_after, eval_cp, cpl)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                game_id,
                move["ply"],
                move["san"],
                move.get("uci"),
                prev_fen,
                fen_after_n,
                prev_zobrist,
                curr_zobrist,
                eval_cp,
                cpl,
            ),
        )
        prev_fen = fen_after_n
        prev_zobrist = curr_zobrist


def save_game(game_json: dict, analysis_depth: str = None, hidden: bool = False) -> int:
    game_uuid = game_json.get("uuid")
    conn = _get_db()
    meta = game_json.get("metadata", {})
    game_date = meta.get("date") or str(dt_date.today())

    # Ensure UUID is set in the blob we persist
    if not game_uuid:
        game_uuid = str(uuid_lib.uuid4())
        game_json["uuid"] = game_uuid

    # Extract denormalized fields for list_games — avoids loading data blob on every query
    raw_pgn = game_json.get("raw_pgn", "")
    opening = meta.get("opening", "")
    moves = game_json.get("moves", [])
    last_fen = moves[-1].get("fenAfter", "") if moves else ""

    depth = analysis_depth or game_json.get("analysis_depth", "")

    row_cols = (
        game_json.get("title", ""),
        meta.get("event", ""),
        meta.get("site", ""),
        game_date,
        meta.get("white", ""),
        meta.get("black", ""),
        meta.get("result", "*"),
        meta.get("eco", ""),
        meta.get("timeControl", ""),
        json.dumps(game_json),
        depth,
        raw_pgn,
        opening,
        last_fen,
    )

    title = game_json.get("title", "")

    # Match by UUID first, then fall back to title (case-insensitive, catches re-imports)
    existing = conn.execute(
        "SELECT id FROM games WHERE uuid=?", (game_uuid,)
    ).fetchone()
    if not existing and title:
        existing = conn.execute(
            "SELECT id FROM games WHERE title=? COLLATE NOCASE", (title,)
        ).fetchone()

    now = time.time()

    if existing:
        game_id = existing[0]
        # Also update uuid column in case this row was matched by title with a different uuid
        conn.execute(
            """UPDATE games
               SET uuid=?, title=?, event=?, site=?, date=?, white=?, black=?,
                   result=?, eco=?, time_control=?, data=?, analysis_depth=?,
                   raw_pgn=?, opening=?, last_fen=?, updated_at=?, hidden=?
               WHERE id=?""",
            (game_uuid,) + row_cols + (now, int(hidden), game_id),
        )
        # Only replace moves if new analysis data is actually provided;
        # otherwise preserve the existing engine evaluation (eval_cp, cpl).
        if game_json.get("moves"):
            conn.execute("DELETE FROM game_moves WHERE game_id=?", (game_id,))
    else:
        cursor = conn.execute(
            """INSERT INTO games
                   (uuid, title, event, site, date, white, black, result, eco, time_control,
                    data, analysis_depth, raw_pgn, opening, last_fen, created_at, updated_at, hidden)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (game_uuid,) + row_cols + (now, now, int(hidden)),
        )
        game_id = cursor.lastrowid

    _insert_moves(conn, game_id, game_json)
    conn.commit()
    conn.close()
    return game_id


def list_games(
    date_from: str = None,
    date_to: str = None,
    player: str = None,
    source: str = None,  # "online" | "local"
    analyzed: bool = None,  # True = only games with analysis_depth set
    limit: int = 25,
) -> List[Dict]:
    conn = _get_db()
    conditions, params = [], []
    if date_from:
        conditions.append("date >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("date <= ?")
        params.append(date_to)
    if player:
        conditions.append("(white LIKE ? OR black LIKE ?)")
        params.extend([f"%{player}%", f"%{player}%"])
    if source == "online":
        conditions.append("(site LIKE ? OR site LIKE ?)")
        params.extend(["%chess.com%", "%lichess%"])
    elif source == "local":
        conditions.append("(site = '' OR site IS NULL)")
    if analyzed is True:
        conditions.append("analysis_depth IS NOT NULL AND analysis_depth != ''")
    conditions.append("(hidden = 0 OR hidden IS NULL)")
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = conn.execute(
        f"""SELECT id, uuid, title, event, site, date, white, black, result, eco,
                   time_control, raw_pgn, opening, last_fen, analysis_depth,
                   created_at, updated_at
            FROM games {where}
            ORDER BY date DESC, created_at DESC
            LIMIT ?""",
        params + [limit],
    ).fetchall()
    conn.close()

    return [dict(r) for r in rows]


def get_game(game_id: int) -> Optional[Dict]:
    conn = _get_db()
    row = conn.execute(
        "SELECT uuid, raw_pgn, analysis_depth, data FROM games WHERE id = ?", (game_id,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    data = json.loads(row["data"])
    # Always surface the authoritative uuid column so the frontend can use it for upserts
    data["uuid"] = row["uuid"]
    # Surface raw_pgn and analysis_depth for reanalysis
    data["raw_pgn"] = row["raw_pgn"] or data.get("raw_pgn", "")
    data["analysis_depth"] = row["analysis_depth"] or data.get("analysis_depth", "")
    return data


def update_game_meta(game_id: int, fields: dict):
    """Update metadata columns and the embedded JSON blob for a game."""
    conn = _get_db()
    row = conn.execute("SELECT data FROM games WHERE id = ?", (game_id,)).fetchone()
    if not row:
        conn.close()
        return False
    data = json.loads(row["data"])
    meta = data.setdefault("metadata", {})

    if "title" in fields:
        data["title"] = fields["title"]
    if "white" in fields:
        meta["white"] = fields["white"]
    if "black" in fields:
        meta["black"] = fields["black"]
    if "whiteElo" in fields:
        meta["whiteElo"] = fields["whiteElo"]
    if "blackElo" in fields:
        meta["blackElo"] = fields["blackElo"]
    if "timeControl" in fields:
        meta["timeControl"] = fields["timeControl"]
    for key in ("result", "event", "site", "date", "round", "eco"):
        if key in fields:
            meta[key] = fields[key]
    if "result" in fields:
        data["result"] = fields["result"]

    conn.execute(
        """UPDATE games
           SET title=?, event=?, site=?, date=?, white=?, black=?,
               result=?, eco=?, time_control=?, data=?, updated_at=?
           WHERE id=?""",
        (
            data.get("title", ""),
            meta.get("event", ""),
            meta.get("site", ""),
            meta.get("date", ""),
            meta.get("white", ""),
            meta.get("black", ""),
            meta.get("result", "*"),
            meta.get("eco", ""),
            meta.get("timeControl", ""),
            json.dumps(data),
            time.time(),
            game_id,
        ),
    )
    conn.commit()
    conn.close()
    return True


def delete_game(game_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM games WHERE id = ?", (game_id,))
    conn.commit()
    conn.close()


def get_opening_tree(fen: str, player_name: str = "") -> List[Dict]:
    norm = normalize_fen(fen)
    conn = _get_db()
    rows = conn.execute(
        """
        SELECT
            gm.san, gm.uci, gm.fen_after,
            COUNT(*)                                                          AS games,
            SUM(CASE WHEN g.result = '1-0'     THEN 1 ELSE 0 END)           AS white_wins,
            SUM(CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END)           AS draws,
            SUM(CASE WHEN g.result = '0-1'     THEN 1 ELSE 0 END)           AS black_wins,
            CAST(AVG(CASE WHEN gm.eval_cp IS NOT NULL THEN gm.eval_cp END)
                 AS INTEGER)                                                  AS avg_eval,
            SUM(CASE WHEN (g.white = ? OR g.black = ?) THEN 1 ELSE 0 END) AS player_games,
            SUM(CASE WHEN (g.white = ? AND g.result = '1-0') OR (g.black = ? AND g.result = '0-1') THEN 1 ELSE 0 END) AS player_wins,
            SUM(CASE WHEN (g.white = ? AND g.result = '0-1') OR (g.black = ? AND g.result = '1-0') THEN 1 ELSE 0 END) AS player_losses,
            SUM(CASE WHEN (g.white = ? AND g.result = '1/2-1/2') OR (g.black = ? AND g.result = '1/2-1/2') THEN 1 ELSE 0 END) AS player_draws
        FROM game_moves gm
        JOIN games g ON g.id = gm.game_id
        WHERE gm.fen_before = ?
        GROUP BY gm.san
        ORDER BY games DESC
    """,
        (
            player_name,
            player_name,
            player_name,
            player_name,
            player_name,
            player_name,
            player_name,
            player_name,
            norm,
        ),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_games_for_move(fen: str, san: str) -> List[Dict]:
    norm = normalize_fen(fen)
    conn = _get_db()
    rows = conn.execute(
        """
        SELECT DISTINCT g.id, g.title, g.date, g.white, g.black, g.result, gm.ply, g.eco, g.time_control
        FROM game_moves gm
        JOIN games g ON g.id = gm.game_id
        WHERE gm.fen_before = ? AND gm.san = ?
        ORDER BY g.date DESC
        LIMIT 50
    """,
        (norm, san),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# Annotation CRUD functions


def update_move_comment(game_id: int, ply: int, comment: str):
    """Set or update a comment for a specific move."""
    conn = _get_db()
    conn.execute(
        "UPDATE game_moves SET comments=? WHERE game_id=? AND ply=?",
        (comment, game_id, ply),
    )
    conn.commit()
    conn.close()


def update_move_key_moment(
    game_id: int, ply: int, is_key_moment: bool, label: str = None
):
    """Mark or unmark a move as a key moment."""
    conn = _get_db()
    conn.execute(
        "UPDATE game_moves SET key_moment=?, key_moment_label=? WHERE game_id=? AND ply=?",
        (1 if is_key_moment else 0, label, game_id, ply),
    )
    conn.commit()
    conn.close()


def get_move_annotations(game_id: int) -> List[Dict]:
    """Get all annotations for a game."""
    conn = _get_db()
    rows = conn.execute(
        """SELECT ply, san, comments, key_moment, key_moment_label FROM game_moves 
           WHERE game_id=? ORDER BY ply""",
        (game_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_variation(
    game_id: int, ply: int, moves: str, eval_cp: int = None, name: str = None
):
    """Add a variation line for a specific ply."""
    conn = _get_db()
    # Get next variation index for this ply
    existing = (
        conn.execute(
            "SELECT MAX(variation_index) FROM move_variations WHERE game_id=? AND ply=?",
            (game_id, ply),
        ).fetchone()[0]
        or -1
    )
    var_index = existing + 1

    conn.execute(
        """INSERT INTO move_variations (game_id, ply, variation_index, moves, eval_cp, name)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (game_id, ply, var_index, moves, eval_cp, name),
    )
    conn.commit()
    conn.close()
    return var_index


def get_variations(game_id: int) -> List[Dict]:
    """Get all variations for a game."""
    conn = _get_db()
    rows = conn.execute(
        """SELECT id, ply, san, variation_index, moves, eval_cp, name 
           FROM move_variations mv
           JOIN game_moves gm ON mv.game_id = gm.game_id AND mv.ply = gm.ply
           WHERE mv.game_id=? ORDER BY mv.ply, mv.variation_index""",
        (game_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_variation(variation_id: int):
    """Delete a specific variation."""
    conn = _get_db()
    conn.execute("DELETE FROM move_variations WHERE id=?", (variation_id,))
    conn.commit()
    conn.close()


def upsert_cheat_report(
    game_id: int, side: str, report_dict: dict, player_rating: Optional[int] = None
):
    conn = _get_db()
    conn.execute(
        """
        INSERT INTO cheat_reports (game_id, side, player_rating, fairness_score, confidence, report_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(game_id, side) DO UPDATE SET
            player_rating  = excluded.player_rating,
            fairness_score = excluded.fairness_score,
            confidence     = excluded.confidence,
            report_json    = excluded.report_json,
            created_at     = excluded.created_at
        """,
        (
            game_id,
            side,
            player_rating,
            report_dict.get("fairness_score", 0.0),
            report_dict.get("confidence", "low"),
            json.dumps(report_dict),
            time.time(),
        ),
    )
    conn.commit()
    conn.close()


def get_cheat_report(game_id: int, side: str) -> Optional[Dict]:
    conn = _get_db()
    row = conn.execute(
        "SELECT report_json, created_at FROM cheat_reports WHERE game_id=? AND side=?",
        (game_id, side),
    ).fetchone()
    conn.close()
    if not row:
        return None
    data = json.loads(row["report_json"])
    data["_cached_at"] = row["created_at"]
    return data


def list_cheat_reports_for_games(game_ids: List[int], side: str) -> List[Dict]:
    if not game_ids:
        return []
    conn = _get_db()
    placeholders = ",".join("?" * len(game_ids))
    rows = conn.execute(
        f"SELECT game_id, report_json, created_at FROM cheat_reports WHERE game_id IN ({placeholders}) AND side=?",
        (*game_ids, side),
    ).fetchall()
    conn.close()
    result = []
    for row in rows:
        data = json.loads(row["report_json"])
        data["game_id"] = row["game_id"]
        data["_cached_at"] = row["created_at"]
        result.append(data)
    return result


# ── Jobs table for persistent queue ────────────────────────────────────────────


def init_jobs_db():
    conn = _get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS jobs (
            job_id          TEXT PRIMARY KEY,
            job_type        TEXT NOT NULL DEFAULT 'analysis',
            title           TEXT NOT NULL DEFAULT '',
            game_uuid       TEXT,
            game_id         INTEGER,
            pgn             TEXT NOT NULL DEFAULT '',
            depth           TEXT NOT NULL DEFAULT 'Standard',
            status          TEXT NOT NULL DEFAULT 'queued',
            progress_json   TEXT NOT NULL DEFAULT '{}',
            error           TEXT,
            result_game_id  INTEGER,
            created_at      REAL NOT NULL,
            updated_at      REAL NOT NULL,
            extra_json      TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_jobs_status   ON jobs(status);
        CREATE INDEX IF NOT EXISTS idx_jobs_game_uuid ON jobs(game_uuid);
    """)
    conn.commit()
    conn.close()


def _job_from_row(row: dict) -> dict:
    """Convert a DB row dict into the job dict format used by the queue."""
    import json as _json

    job = {
        "job_id": row["job_id"],
        "job_type": row["job_type"],
        "title": row["title"],
        "game_uuid": row["game_uuid"],
        "game_id": row["game_id"],
        "pgn": row["pgn"],
        "depth": row["depth"],
        "status": row["status"],
        "progress": _json.loads(row["progress_json"]) if row["progress_json"] else {},
        "error": row["error"],
        "result_game_id": row["result_game_id"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }
    extra = _json.loads(row["extra_json"]) if row["extra_json"] else {}
    job.update(extra)
    return job


def save_job(job: dict) -> None:
    """Insert or replace a job. Call after any field change."""
    import json as _json
    import time as _time

    conn = _get_db()

    extra = {
        k: v
        for k, v in job.items()
        if k
        in (
            "platform",
            "username",
            "side",
            "games_fetched",
            "games_total",
            "games_analyzed",
            "cheat_aggregate",
        )
    }

    conn.execute(
        """
        INSERT OR REPLACE INTO jobs
        (job_id, job_type, title, game_uuid, game_id, pgn, depth, status,
         progress_json, error, result_game_id, created_at, updated_at, extra_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
        (
            job.get("job_id"),
            job.get("job_type", "analysis"),
            job.get("title", ""),
            job.get("game_uuid"),
            job.get("game_id"),
            job.get("pgn", ""),
            job.get("depth", "Standard"),
            job.get("status", "queued"),
            _json.dumps(job.get("progress", {})),
            job.get("error"),
            job.get("result_game_id"),
            job.get("created_at", _time.time()),
            _time.time(),
            _json.dumps(extra),
        ),
    )
    conn.commit()
    conn.close()


def load_jobs() -> List[dict]:
    """Load all jobs from DB, sorted by created_at ascending."""
    conn = _get_db()
    rows = conn.execute("SELECT * FROM jobs ORDER BY created_at ASC").fetchall()
    conn.close()
    return [_job_from_row(dict(r)) for r in rows]


def delete_job(job_id: str) -> bool:
    conn = _get_db()
    cur = conn.execute("DELETE FROM jobs WHERE job_id=?", (job_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0
