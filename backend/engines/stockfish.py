import re
import chess
import chess.engine
from typing import List, Dict, Optional
import logging
from pathlib import Path as FilePath

class RemoteUciEngine:
    """Wraps a remote UCI engine accessible via HTTP/WebSocket.
    
    Most cloud Stockfish servers expose a REST API. This adapter translates
    the python-chess UCI calls into HTTP POST requests and parses responses.
    
    Expected remote API contract ( Lichance/Lichess-style ):
        POST /api/analysis/evaluate
        Body: {"fen": "..."}
        Response: {"evaluation": {"value": 0.35}, "bestMove": "e2e4"}
    """

    def __init__(self, base_url: str, api_key: str = ""):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._analysis_limit = chess.engine.Limit(time=2.0)
        self._board = chess.Board()

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def configure(self, options: dict):
        # Remote engines don't support local config like Threads/Hash
        pass

    def analyse(self, board: chess.Board, limit: chess.engine.Limit, *, multipv: int = 1, info: bool = True, _=None):
        """Single-shot evaluation — yields one info dict then closes."""
        import httpx
        fen = board.fen()
        try:
            # Try common cloud Stockfish API shapes
            with httpx.Client(timeout=30.0) as client:
                # Shape 1: Lichance-style /api/analysis/evaluate
                try:
                    resp = client.post(
                        f"{self.base_url}/api/analysis/evaluate",
                        json={"fen": fen},
                        headers=self._headers(),
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        eval_val = data.get("evaluation", {}).get("value", 0)
                        best_move_uci = data.get("bestMove", "").get("uci", "")
                        # Convert to centipawns
                        cp = int(eval_val * 100) if isinstance(eval_val, (int, float)) else 0
                        # Find the Move object
                        best_move = None
                        if best_move_uci:
                            try:
                                best_move = chess.Move.from_uci(best_move_uci)
                            except Exception:
                                pass
                        if best_move is None and best_move_uci:
                            # Try parsing as UCI and find matching legal move
                            pass
                        # Construct a python-chess score object
                        class _Score:
                            def __init__(self, cp_val):
                                self._cp = cp_val
                            def white(self):
                                return self
                            def score(self, mate_score=30000):
                                return self._cp
                            def mate(self):
                                return None
                        yield {
                            "depth": 20,
                            "score": _Score(cp),
                            "pv": [best_move] if best_move else [],
                            "nodes": 0,
                            "nps": 0,
                        }
                        return
                except Exception:
                    pass

                # Shape 2: generic {evaluation: "...", best_move: "..."}
                resp = client.post(
                    f"{self.base_url}/evaluate",
                    json={"fen": fen},
                    headers=self._headers(),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    eval_str = data.get("evaluation", "0")
                    bm_str = data.get("best_move", "") or data.get("bestMove", "")
                    # Parse eval: could be "+0.35" or "0.35" or "M3"
                    cp = 0
                    if eval_str.startswith("M") or eval_str.startswith("-"):
                        pass  # mate — not easily representable
                    else:
                        try:
                            cp = int(float(eval_str) * 100)
                        except Exception:
                            cp = 0
                    class _Score:
                        def __init__(self, cp_val):
                            self._cp = cp_val
                        def white(self):
                            return self
                        def score(self, mate_score=30000):
                            return self._cp
                        def mate(self):
                            return None
                    best_move = None
                    if bm_str:
                        try:
                            best_move = chess.Move.from_uci(bm_str)
                        except Exception:
                            pass
                    yield {
                        "depth": 20,
                        "score": _Score(cp),
                        "pv": [best_move] if best_move else [],
                        "nodes": 0,
                        "nps": 0,
                    }
                    return

                # Shape 3: raw UCI over WebSocket (lichess style)
                # Fallback — raise so caller knows nothing worked
                raise RuntimeError(f"Remote engine at {self.base_url} did not match any known API shape (status {resp.status_code})")
        except Exception as e:
            logging.error(f"RemoteUciEngine analyse failed: {e}")
            yield {"depth": 0, "score": None, "pv": [], "nodes": 0, "nps": 0}

    def analysis(self, board: chess.Board, limit: chess.engine.Limit, *, multipv: int = 1, info: bool = True):
        """Streaming analysis — returns a context manager yielding info dicts."""
        return _RemoteAnalysisCtx(self, board, limit, multipv)

    def quit(self):
        pass


class _RemoteAnalysisCtx:
    """A minimal context-manager that mimics chess.engine.Analysis for RemoteUciEngine."""
    def __init__(self, engine: RemoteUciEngine, board: chess.Board, limit: chess.engine.Limit, multipv: int):
        self.engine = engine
        self.board = board
        self.limit = limit
        self.multipv = multipv

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def __iter__(self):
        # For streaming we just yield the single-shot result
        for info in self.engine.analyse(self.board, self.limit, multipv=self.multipv):
            yield info


class StockfishAnalyzer:
    def __init__(
        self,
        path_or_url: str = "/opt/homebrew/opt/stockfish/bin/stockfish",
        threads: int = 1,
        hash_size: int = 4096,
        *,
        engine_mode: str = "local",  # "local" | "remote"
        remote_api_key: str = "",
    ):
        self.engine_mode = engine_mode
        self._threads = threads
        self._hash_size = hash_size
        self._path_or_url = path_or_url
        self._remote_api_key = remote_api_key

        if engine_mode == "remote":
            self.engine: chess.engine.Protocol = RemoteUciEngine(path_or_url, api_key=remote_api_key)
        else:
            self.engine = chess.engine.SimpleEngine.popen_uci(path_or_url)
            options = {"Hash": hash_size}
            if threads > 1:
                options["Threads"] = threads
            self.engine.configure(options)

    def analyze_position(self, board: chess.Board) -> Dict:
        try:
            info = self.engine.analyse(board, chess.engine.Limit(depth=12))
            return {"score": info.get("score"), "depth": info.get("depth")}
        except Exception as e:
            logging.error(f"Engine analysis failed: {e}")
            return {"score": None, "depth": 0}

    def get_analysis_stream(self, board: chess.Board, time_limit: float = 2.0):
        """Yields analysis info dicts as Stockfish iterates through depths (streaming)."""
        try:
            with self.engine.analysis(board, chess.engine.Limit(time=time_limit)) as analysis:
                prev_depth = 0
                for info in analysis:
                    if not isinstance(info, dict):
                        continue
                    depth = info.get("depth") or 0
                    score = info.get("score")
                    pv = info.get("pv")
                    if score is not None and pv and depth > prev_depth:
                        prev_depth = depth
                        yield {
                            "score": score,
                            "pv": list(pv),
                            "depth": depth,
                            "nps": info.get("nps"),
                            "nodes": info.get("nodes"),
                        }
        except Exception as e:
            yield {"error": str(e)}

    def get_multipv_stream(self, board: chess.Board, time_limit: float = 2.0,
                           num_lines: int = 2, min_pv_depth: int = 4):
        """Yields multipv results grouped by depth. Each yield is a list of line dicts."""
        try:
            with self.engine.analysis(
                board,
                chess.engine.Limit(time=time_limit),
                multipv=num_lines,
            ) as analysis:
                # Collect lines keyed by (depth, multipv_index)
                current_depth = 0
                lines_at_depth = {}

                for info in analysis:
                    if not isinstance(info, dict):
                        continue
                    depth = info.get("depth") or 0
                    multipv_idx = info.get("multipv", 1)  # 1-based
                    score = info.get("score")
                    pv = info.get("pv")

                    if not score or not pv or depth < min_pv_depth:
                        continue

                    if depth != current_depth:
                        # New depth — emit previous if we had all lines
                        if lines_at_depth and current_depth >= min_pv_depth:
                            yield {"lines": list(lines_at_depth.values()), "depth": current_depth}
                        current_depth = depth
                        lines_at_depth = {}

                    lines_at_depth[multipv_idx] = {
                        "score": score,
                        "pv": list(pv),
                        "depth": depth,
                        "multipv": multipv_idx,
                        "nps": info.get("nps"),
                    }

                # Emit final depth
                if lines_at_depth and current_depth >= min_pv_depth:
                    yield {"lines": list(lines_at_depth.values()), "depth": current_depth}

        except Exception as e:
            yield {"error": str(e)}
    
    def get_cpl_for_move(self, move: chess.Move, board: chess.Board, time_limit: float = 2.0) -> float:
        try:
            info_before = self.engine.analyse(board, chess.engine.Limit(time=time_limit))
            if not isinstance(info_before, dict):
                info_before = None
            score_before = info_before.get("score") if info_before else None

            # Use relative score (pov) to make calculation turn-independent
            before_val = score_before.white().score() if score_before and score_before.white().score() is not None else 0

            board.push(move)
            info_after = self.engine.analyse(board, chess.engine.Limit(time=time_limit))
            if not isinstance(info_after, dict):
                info_after = None
            score_after = info_after.get("score") if info_after else None
            after_val = score_after.white().score() if score_after and score_after.white().score() is not None else 0

            board.pop()
            
            # If it was white's turn, high before_val is good. 
            # If it was black's turn, low before_val is good.
            if board.turn == chess.WHITE:
                return max(0.0, float(before_val - after_val))
            else:
                return max(0.0, float(after_val - before_val))
        except Exception as e:
            logging.error(f"CPL calculation failed: {e}")
            return 0.0
    
    def _calculate_cpl(self, before, after) -> float:
        if before is None or after is None: return 0.0
        before_val = before.white().score() if before.white().score() is not None else 0
        after_val = after.white().score() if after.white().score() is not None else 0
        return max(0.0, float(before_val - after_val))
    
    def _get_phase(self, board: chess.Board, move_number: int) -> str:
        if move_number <= 15:
            return "opening"
        non_pawn = (
            len(board.pieces(chess.KNIGHT, chess.WHITE)) +
            len(board.pieces(chess.BISHOP, chess.WHITE)) +
            len(board.pieces(chess.ROOK,   chess.WHITE)) +
            len(board.pieces(chess.QUEEN,  chess.WHITE)) +
            len(board.pieces(chess.KNIGHT, chess.BLACK)) +
            len(board.pieces(chess.BISHOP, chess.BLACK)) +
            len(board.pieces(chess.ROOK,   chess.BLACK)) +
            len(board.pieces(chess.QUEEN,  chess.BLACK))
        )
        has_white_queen = bool(board.pieces(chess.QUEEN, chess.WHITE))
        has_black_queen = bool(board.pieces(chess.QUEEN, chess.BLACK))
        if (not has_white_queen and not has_black_queen) or non_pawn <= 6:
            return "endgame"
        return "middlegame"

    def _parse_clock(self, clk_str: str) -> float:
        """Parses H:MM:SS.f or MM:SS or SSS into total seconds."""
        if not clk_str:
            return 0.0
        parts = clk_str.strip().split(':')
        try:
            if len(parts) == 3:  # H:MM:SS.f
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
            elif len(parts) == 2:  # MM:SS or MM:SS.f
                return int(parts[0]) * 60 + float(parts[1])
            elif len(parts) == 1:  # Seconds or HMM
                val = parts[0]
                if "." in val:
                    return float(val)
                if len(val) >= 3 and val.isdigit(): # HMM format like 200 for 2:00
                    return int(val[0]) * 3600 + int(val[1:]) * 60
                return float(val)
        except (ValueError, IndexError):
            return 0.0
        return 0.0

    def analyze_full_game(self, pgn: str, time_limit: float = 2.0) -> List[Dict]:
        from utils.zobrist import calculate_hash
        import _sqlite3
        import sqlite3
        from database import DB_PATH
        
        import chess.pgn
        import io
        pgn_io = io.StringIO(pgn)
        game = chess.pgn.read_game(pgn_io)
        results = []
        if not game: return []

        board = game.board()
        
        # Track clock times for each side to calculate deltas
        # Use TimeControl header if available
        tc = game.headers.get("TimeControl", "")
        start_time, increment = self._parse_time_control(tc)
        
        last_times = {
            "white": start_time if start_time > 0 else None, 
            "black": start_time if start_time > 0 else None
        }
        
        # We'll use the DB to cache positions using the zobrist hash
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        
        for ply, move in enumerate(game.mainline_moves(), 1):
            # Extract clock from PGN comment if available
            node = game.root()
            for _ in range(ply):
                node = node.variation(0)
            
            # Since _analyze_move_node calls get_cpl_for_move
            # which might be slow if un-cached, we'll try to use DB check inside _analyze_move_node
            # Let's pass conn down
            move_data = self._analyze_move_node(node, board, ply, last_times, increment, time_limit, conn)
            results.append(move_data)
            board.push(move)
            
        conn.close()
        return results

    def _parse_time_control(self, tc: str):
        start_time = 0.0
        increment = 0.0
        if tc:
            if "+" in tc:
                parts = tc.split("+")
                try:
                    start_time = float(parts[0])
                    increment = float(parts[1])
                except: pass
            elif tc.isdigit():
                start_time = float(tc)
        return start_time, increment

    def _analyze_move_node(self, node, board, ply, last_times, increment, time_limit, conn=None, pre_eval=None):
        from utils.zobrist import calculate_hash
        import time
        import json as _json
        move = node.move
        move_num = (ply + 1) // 2
        is_white = ply % 2 != 0
        side = "white" if is_white else "black"
        label = f"{move_num}{'w' if is_white else 'b'}"

        comment = node.comment
        time_spent = 0.0
        current_clock_seconds = None

        ts_match = re.search(r"\[%timestamp\s+(\d+)\]", comment)
        clk_match = re.search(r"\[%clk\s+([^\]]+)\]", comment)

        if clk_match:
            clk_val = clk_match.group(1).split(',')[0].strip()
            current_clock_seconds = self._parse_clock(clk_val)

            if last_times[side] is not None:
                time_spent = max(0.0, last_times[side] - current_clock_seconds)
                last_times[side] = current_clock_seconds + increment
            else:
                last_times[side] = current_clock_seconds + increment
                time_spent = 0.0

        if ts_match:
            chess_com_spent = float(ts_match.group(1)) / 10.0
            if abs(time_spent - chess_com_spent) > 1.0 or not clk_match:
                time_spent = chess_com_spent

        phase = self._get_phase(board, move_num)
        hash_before = calculate_hash(board)

        eval_cp = None
        cpl = None
        best_move_san = ""
        pv_san = []

        # Full cache hit: eval_cp + cpl + pv all stored
        if conn:
            row = conn.execute("SELECT eval_cp, cpl, pv FROM position_cache WHERE hash=?", (hash_before,)).fetchone()
            if row and row['cpl'] is not None and row['eval_cp'] is not None:
                cpl = row['cpl']
                eval_cp = row['eval_cp']
                if row['pv']:
                    try:
                        pv_san = _json.loads(row['pv'])
                        best_move_san = pv_san[0] if pv_san else ""
                    except Exception:
                        pass

        if cpl is None:
            # Eval before: use pre_eval from streaming analysis if available
            if pre_eval is not None and pre_eval.get("score") is not None:
                score_before = pre_eval["score"]
                pv_before = list(pre_eval.get("pv", []))
            else:
                info_before = self.engine.analyse(board, chess.engine.Limit(time=time_limit), multipv=1)
                if not isinstance(info_before, dict):
                    info_before = None
                score_before = info_before.get("score") if info_before else None
                pv_before = list(info_before.get("pv", [])) if info_before else []

            # White-relative centipawn score of the position before this move
            if score_before is not None:
                raw_cp = score_before.white().score()
                if raw_cp is not None:
                    eval_cp = raw_cp
                else:
                    mate = score_before.white().mate()
                    eval_cp = (30000 if mate and mate > 0 else -30000) if mate else 0
            else:
                eval_cp = 0

            # Best move / PV in SAN
            if pv_before:
                try:
                    temp = board.copy()
                    for m in pv_before[:6]:
                        pv_san.append(temp.san(m))
                        temp.push(m)
                    best_move_san = pv_san[0] if pv_san else ""
                except Exception:
                    pv_san = []
                    best_move_san = ""

            # Eval after move to compute CPL
            board_after = board.copy()
            board_after.push(move)
            try:
                info_after = self.engine.analyse(board_after, chess.engine.Limit(time=time_limit))
                if not isinstance(info_after, dict):
                    info_after = None
                score_after = info_after.get("score") if info_after else None
                if score_after is not None:
                    after_raw = score_after.white().score()
                    after_cp = after_raw if after_raw is not None else (
                        30000 if score_after.white().mate() and score_after.white().mate() > 0 else -30000
                    )
                else:
                    after_cp = eval_cp
            except Exception:
                after_cp = eval_cp

            # CPL = how much the side to move lost vs best play
            if board.turn == chess.WHITE:
                cpl = max(0.0, float(eval_cp - after_cp))
            else:
                cpl = max(0.0, float(after_cp - eval_cp))

            # Write full cache entry
            if conn:
                try:
                    conn.execute(
                        "INSERT OR REPLACE INTO position_cache (hash, eval_cp, cpl, pv, updated_at) VALUES (?, ?, ?, ?, ?)",
                        (hash_before, eval_cp, cpl, _json.dumps(pv_san), time.time())
                    )
                    conn.commit()
                except Exception as e:
                    logging.error(f"Cache write failed: {e}")

        return {
            "move_number": ply,
            "label": label,
            "san": board.san(move),
            "eval_cp": eval_cp,        # centipawn score of position BEFORE move (white-relative)
            "evaluation": eval_cp,     # alias for backward compat
            "cpl": cpl,
            "is_blunder": cpl >= 200,
            "phase": phase,
            "time_spent": round(time_spent, 1),
            "clock": comment if "[%clk" in comment else "",
            "best_move_san": best_move_san,
            "pv_san": pv_san,
        }

    def close(self):
        try: self.engine.quit()
        except: pass
