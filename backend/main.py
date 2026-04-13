import json
import logging
import chess
import chess.pgn
import chess.engine
import io
import asyncio
import traceback
import concurrent.futures
import threading
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect
from starlette.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path
from PIL import Image
import httpx
import time as time_mod

# Internal imports
from engines.stockfish import StockfishAnalyzer
from engines.gemini_ocr import extract_pgn_from_image, extract_timestamps_from_image
from database import init_db, save_game, list_games, get_game as db_get_game, delete_game, update_game_meta, get_opening_tree, get_games_for_move, update_move_comment, update_move_key_moment, get_move_annotations, add_variation, get_variations, delete_variation, DB_PATH

app = FastAPI(title="Chess scoresheet Digitizer")

# Init DB on startup
init_db()

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for image preview
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/cropped", StaticFiles(directory="cropped"), name="cropped")

# Engine initialization
stockfish: Optional[StockfishAnalyzer] = None

# Shared HTTP client (reuses connection pools — lower memory than per-request clients)
_http_client: Optional[httpx.AsyncClient] = None


@app.on_event("startup")
async def startup():
    global _http_client
    _http_client = httpx.AsyncClient(timeout=30.0, follow_redirects=True, limits=httpx.Limits(max_keepalive_connections=10, max_connections=20))


@app.on_event("shutdown")
async def shutdown():
    if _http_client:
        await _http_client.aclose()

class ConfigBase(BaseModel):
    stockfish_path: str
    gemini_api_key: str = ""
    player_name: str = ""
    stockfish_threads: int = 1
    stockfish_hash: int = 4096

class ValidateRequest(BaseModel):
    moves: List[str]

class MoveCommentRequest(BaseModel):
    game_id: int
    ply: int
    comment: str

class KeyMomentRequest(BaseModel):
    game_id: int
    ply: int
    is_key_moment: bool
    label: Optional[str] = None

class VariationRequest(BaseModel):
    game_id: int
    ply: int
    moves: str
    eval_cp: Optional[int] = None
    name: Optional[str] = None

class VariationDeleteRequest(BaseModel):
    variation_id: int

def get_config():
    config_path = Path("config.json")
    default = {
        "stockfish_path": "/usr/local/bin/stockfish",
        "gemini_api_key": "",
        "player_name": "",
        "stockfish_threads": 1,
        "stockfish_hash": 4096,
    }
    if config_path.exists():
        with open(config_path, "r") as f:
            loaded = json.load(f)
            # Merge defaults with loaded config (loaded overrides defaults)
            for key in default:
                if key not in loaded:
                    loaded[key] = default[key]
            return loaded
    return default

def _pgn_to_game_json(pgn_text: str, analysis: list, title: str = "") -> dict:
    """Convert PGN + analysis array into the canonical game JSON format."""
    import re, sys
    pgn_io = io.StringIO(pgn_text)
    try:
        game = chess.pgn.read_game(pgn_io)
    except ValueError as e:
        import logging
        logging.warning(f"PGN parsing failed: {e}")
        return None
    if not game:
        return None
    headers = dict(game.headers)
    board = game.board()
    moves_data = []
    node = game

    for i, move in enumerate(game.mainline_moves()):
        ply = i + 1
        san = board.san(move)
        uci = move.uci()
        try:
            node = node.variation(0)
        except (IndexError, AttributeError):
            break
        board.push(move)
        fen_after = board.fen()

        comment = node.comment or ""
        clock_remaining = None
        clk_m = re.search(r'\[%clk\s+([^\]]+)\]', comment)
        if clk_m:
            try:
                parts = clk_m.group(1).split(',')[0].strip().split(':')
                if len(parts) == 3:
                    clock_remaining = int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
                elif len(parts) == 2:
                    clock_remaining = int(parts[0]) * 60 + float(parts[1])
                else:
                    clock_remaining = float(parts[0])
            except Exception:
                pass

        a = analysis[i] if i < len(analysis) else {}
        # eval_cp is the actual position score (white-relative cp); fall back to old "evaluation" field
        eval_val = a.get("eval_cp") if a.get("eval_cp") is not None else (a.get("evaluation") or 0)
        cpl = a.get("cpl") or 0
        best_move = a.get("best_move_san", "")
        pv = a.get("pv_san", [])

        moves_data.append({
            "ply": ply,
            "moveNumber": (ply + 1) // 2,
            "color": "w" if ply % 2 != 0 else "b",
            "san": san,
            "uci": uci,
            "fenAfter": fen_after,
            "time": {
                "clockRemainingSeconds": clock_remaining,
                "moveDurationSeconds": a.get("time_spent", 0.0),
            },
            "evaluation": {
                "engine": "Stockfish",
                "type": "cp",
                "value": eval_val,
            },
            "annotations": {
                "nag": None,
                "cpl": cpl,
                "isBlunder": cpl >= 200,
                "phase": a.get("phase", ""),
            },
            "engine": {
                "bestMove": best_move,
                "pv": pv,
            },
        })

    date_str = re.sub(r'-?\?', '', headers.get("Date", "").replace(".", "-")).strip("-")

    # Determine ECO manually if missing or explicitly provided as "?"
    eco_code = headers.get("ECO", "").split(" ")[0]
    opening_name = headers.get("Opening", "")
    
    if not eco_code or eco_code == "?":
        from utils.opening import classify_opening
        try:
            classification = classify_opening(game)
            if classification:
                eco_code = classification["eco"]
                opening_name = classification["name"]
        except Exception as e:
            import logging
            logging.error(f"Failed to cleanly classify ECO: {e}")

    game_json = {
        "version": "1.0",
        "title": title or headers.get("Event", "Game"),
        "raw_pgn": pgn_text,
        "metadata": {
            "event": headers.get("Event"),
            "site": headers.get("Site", ""),
            "date": date_str,
            "round": headers.get("Round", ""),
            "white": headers.get("White", ""),
            "black": headers.get("Black", ""),
            "result": headers.get("Result", "*"),
            "whiteElo": headers.get("WhiteElo", ""),
            "blackElo": headers.get("BlackElo", ""),
            "timeControl": headers.get("TimeControl", ""),
            "eco": eco_code,
            "opening": opening_name,
        },
        "startFen": headers.get("FEN", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
        "moves": moves_data,
        "result": headers.get("Result", "*"),
    }
    return game_json

# ── Game Database endpoints ──────────────────────────────────────────────────

@app.get("/api/db/games")
def db_list_games(
    date_from: str = None,
    date_to:   str = None,
    player:    str = None,
    source:    str = None,  # "online" | "local"
    analyzed:  bool = None,
):
    return list_games(date_from=date_from, date_to=date_to, player=player, source=source, analyzed=analyzed)


@app.get("/api/db/games/{game_id}")
def db_get_game_endpoint(game_id: int):
    game = db_get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return game


@app.post("/api/db/games")
def db_save_game(data: dict):
    game_id = save_game(data)  # data may include "uuid" — save_game handles upsert
    return {"status": "success", "id": game_id}


@app.patch("/api/db/games/{game_id}/meta")
def db_update_game_meta(game_id: int, data: dict):
    ok = update_game_meta(game_id, data)
    if not ok:
        raise HTTPException(status_code=404, detail="Game not found")
    return {"status": "success"}


@app.delete("/api/db/games/{game_id}")
def db_delete_game(game_id: int):
    delete_game(game_id)
    return {"status": "success"}


@app.get("/api/db/opening-tree")
def db_opening_tree(fen: str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"):
    config = get_config()
    player_name = config.get("player_name", "")
    return {"fen": fen, "moves": get_opening_tree(fen, player_name)}


@app.get("/api/db/opening-tree/games")
def db_opening_tree_games(fen: str, san: str):
    return get_games_for_move(fen, san)


# ── Annotations (Comments, Key Moments, Variations) ───────────────────────────

@app.get("/api/db/annotations/{game_id}")
def db_get_annotations(game_id: int):
    """Get all annotations (comments, key moments) for a game."""
    return {
        "comments": get_move_annotations(game_id),
        "variations": get_variations(game_id),
    }

@app.post("/api/db/move-comment")
def db_update_move_comment(req: MoveCommentRequest):
    """Set or update a comment for a specific move."""
    update_move_comment(req.game_id, req.ply, req.comment)
    return {"status": "success"}

@app.post("/api/db/key-moment")
def db_update_key_moment(req: KeyMomentRequest):
    """Mark or unmark a move as a key moment."""
    update_move_key_moment(req.game_id, req.ply, req.is_key_moment, req.label)
    return {"status": "success"}

@app.post("/api/db/variation")
def db_add_variation(req: VariationRequest):
    """Add a variation line for a specific ply."""
    var_index = add_variation(req.game_id, req.ply, req.moves, req.eval_cp, req.name)
    return {"status": "success", "variation_index": var_index}

@app.delete("/api/db/variation/{variation_id}")
def db_delete_variation(variation_id: int):
    """Delete a specific variation."""
    delete_variation(variation_id)
    return {"status": "success"}


# ── Config ───────────────────────────────────────────────────────────────────

@app.get("/api/config")
def get_app_config():
    return get_config()

@app.post("/api/config")
def update_config(config: ConfigBase):
    with open("config.json", "w") as f:
        json.dump(config.dict(), f)
    global stockfish
    if stockfish:
        try:
            stockfish.close()
        except Exception:
            pass
        stockfish = None
    try:
        stockfish = StockfishAnalyzer(path_or_url=config.stockfish_path, threads=config.stockfish_threads, hash_size=config.stockfish_hash)
    except Exception:
        stockfish = None  # Will be re-initialized on next use
    return {"status": "success"}

@app.post("/api/config/test-stockfish")
def test_stockfish(config: ConfigBase):
    try:
        temp_analyzer = StockfishAnalyzer(path_or_url=config.stockfish_path)
        board = chess.Board("8/8/8/4p1K1/2k1P3/8/8/8 b")
        eval_dict = temp_analyzer.analyze_position(board)
        temp_analyzer.close()
        
        if eval_dict.get("score") is not None:
             score_val = eval_dict["score"].relative.score()
             return {
                 "status": "success", 
                 "message": f"Stockfish operational. Eval for test FEN: {score_val/100:.1f}",
                 "eval": score_val
             }
        else:
             return {"status": "error", "message": "Stockfish running but returned no score."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/config/test-gemini")
def test_gemini(config: ConfigBase):
    try:
        from google import genai
        if not config.gemini_api_key:
            return {"status": "error", "message": "No API key provided."}
        client = genai.Client(api_key=config.gemini_api_key)
        response = client.models.generate_content(
            model="gemini-3.1-pro-preview",
            contents="Reply with only the word: ok",
        )
        if response.text.strip().lower().startswith("ok"):
            return {"status": "success", "message": "Gemini API key is valid."}
        return {"status": "success", "message": "Gemini responded successfully."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/ocr-crop")
def ocr_crop(
    filename: str = Form(...),
    x: float = Form(...),
    y: float = Form(...),
    width: float = Form(...),
    height: float = Form(...),
    skip_ocr: str = Form("false"),
):
    """Processes a specific cropped region of an image for OCR."""
    file_path = Path("uploads") / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File {filename} not found")
        
    try:
        img = Image.open(file_path)
        img = img.convert("RGB")
        img_w, img_h = img.size
        
        # Frontend sends percentages (0-100)
        left = int((x / 100.0) * img_w)
        top = int((y / 100.0) * img_h)
        right = int(((x + width) / 100.0) * img_w)
        bottom = int(((y + height) / 100.0) * img_h)
        
        # Boundary Clamping
        left = max(0, min(img_w - 2, left))
        top = max(0, min(img_h - 2, top))
        right = max(left + 1, min(img_w, right))
        bottom = max(top + 1, min(img_h, bottom))

        cropped_img = img.crop((left, top, right, bottom))

        cropped_dir = Path("cropped")
        cropped_dir.mkdir(exist_ok=True)
        crop_filename = f"crop_{filename}"
        crop_path = cropped_dir / crop_filename
        cropped_img.save(crop_path)
        
        if skip_ocr.lower() in ['true', '1', 'yes']:
            return {
                "pgn": None,
                "crop_url": f"/cropped/{crop_filename}"
            }
        
        # Use the Gemini OCR engine
        pgn_fragment = extract_pgn_from_image(str(crop_path))
        
        # Parse the JSON response
        try:
            pgn_json = json.loads(pgn_fragment)
        except json.JSONDecodeError:
            # Fallback if it's not valid JSON (though prompt requested valid JSON)
            pgn_json = {"raw": pgn_fragment}

        return {
            "pgn": pgn_json,
            "crop_url": f"/cropped/{crop_filename}"
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/extract-timestamps")
def extract_timestamps(
    filename: str = Form(...),
    pgn_context: str = Form(...)
):
    """Extracts timestamps from a specific image file using PGN context."""
    file_path = Path("uploads") / filename
    # If the filename starts with crop_, look in cropped/ directory
    if filename.startswith("crop_"):
        file_path = Path("cropped") / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File {filename} not found")
        
    try:
        ts_fragment = extract_timestamps_from_image(str(file_path), pgn_context)
        return json.loads(ts_fragment)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/validate-moves")
async def validate_moves(req: ValidateRequest):
    board = chess.Board()
    results = []
    for san_move in req.moves:
        if not san_move or san_move == "...":
            results.append(True)
            continue
        try:
            move = board.parse_san(san_move)
            board.push(move)
            results.append(True)
        except Exception:
            results.append(False)
            break
    return {"results": results}

def _embed_analysis_in_pgn(pgn_text: str, analysis: list) -> str:
    """Embeds [%eval] and [%cpl] annotations into PGN move comments."""
    import re
    pgn_io = io.StringIO(pgn_text)
    game = chess.pgn.read_game(pgn_io)
    if not game:
        return pgn_text
    node = game
    for move_data in analysis:
        try:
            node = node.variation(0)
        except (IndexError, AttributeError):
            break
        cpl = move_data.get("cpl", 0)
        evaluation = move_data.get("evaluation")
        eval_str = f"{evaluation / 100.0:.2f}" if evaluation is not None else "0.00"
        existing = node.comment or ""
        clk_part = ""
        clk_m = re.search(r'\[%clk\s+[^\]]+\]', existing)
        if clk_m:
            clk_part = clk_m.group(0) + " "
        node.comment = f"{clk_part}[%eval {eval_str}] [%cpl {int(cpl)}]".strip()
    exporter = chess.pgn.StringExporter(headers=True, variations=True, comments=True)
    return game.accept(exporter)


def _save_pgn_file(title: str, pgn_text: str) -> str:
    games_dir = Path("games")
    games_dir.mkdir(exist_ok=True)
    safe_title = "".join([c for c in title if c.isalnum() or c in (' ', '-', '_')]).rstrip() or "game"
    import time as time_mod
    filename = f"{safe_title}_{int(time_mod.time())}.pgn"
    with open(games_dir / filename, "w") as f:
        f.write(pgn_text)
    return filename


@app.get("/api/games")
def list_pgn_files():
    games_dir = Path("games")
    games_dir.mkdir(exist_ok=True)
    files = sorted(games_dir.glob("*.pgn"), key=lambda f: f.stat().st_mtime, reverse=True)
    return [
        {"filename": f.name, "title": "_".join(f.stem.split("_")[:-1]).replace("_", " "), "modified": f.stat().st_mtime}
        for f in files
    ]


@app.get("/api/games/{filename}")
def get_game(filename: str):
    file_path = Path("games") / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Game not found")
    with open(file_path) as f:
        content = f.read()
    return {"filename": filename, "pgn": content}


@app.post("/api/save-pgn")
def save_pgn(data: dict):
    title = data.get("title", "game").strip() or "game"
    pgn_text = data.get("pgn", "")
    analysis = data.get("analysis") or []
    game_uuid = data.get("game_uuid")
    if analysis:
        pgn_text = _embed_analysis_in_pgn(pgn_text, analysis)
    filename = _save_pgn_file(title, pgn_text)
    if game_uuid:
        try:
            game_json = _pgn_to_game_json(pgn_text, analysis, title)
            if game_json:
                game_json["uuid"] = game_uuid
                save_game(game_json, analysis_depth=data.get("depth", "Standard"))
        except Exception:
            pass
    return {"status": "success", "filename": filename}


@app.post("/api/suggest-moves")
def suggest_moves(fen: str = Form(...)):
    global stockfish
    config = get_config()
    if stockfish is None:
        stockfish = StockfishAnalyzer(path_or_url=config["stockfish_path"], threads=int(config.get("stockfish_threads", 1)), hash_size=int(config.get("stockfish_hash", 4096)))
    try:
        board = chess.Board(fen)
        infos = stockfish.engine.analyse(board, chess.engine.Limit(time=1.0), multipv=3)
        suggestions = []
        for info in infos:
            if not isinstance(info, dict):
                continue
            pv = info.get("pv", [])
            if not pv:
                continue
            score = info.get("score")
            eval_str = None
            if score is not None:
                white_score = score.white()
                mate = white_score.mate()
                cp = white_score.score()
                if mate is not None:
                    eval_str = f"M{mate}" if mate > 0 else f"-M{abs(mate)}"
                elif cp is not None:
                    eval_str = f"{'+' if cp > 0 else ''}{cp / 100:.2f}"
            suggestions.append({"san": board.san(pv[0]), "eval": eval_str})
        return {"suggestions": suggestions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/evaluate-position")
def evaluate_position(fen: str = Form(...), time_limit: float = Form(2.0)):
    global stockfish
    config = get_config()
    if stockfish is None:
        stockfish = StockfishAnalyzer(path_or_url=config["stockfish_path"], threads=int(config.get("stockfish_threads", 1)), hash_size=int(config.get("stockfish_hash", 4096)))
    try:
        board = chess.Board(fen)
        # Use time limit instead of depth
        info = stockfish.engine.analyse(board, chess.engine.Limit(time=time_limit))
        if not isinstance(info, dict):
            return {"score": "0.0", "best_move": "", "pv": [], "depth": 0}
        score = info.get("score")
        pv = info.get("pv", [])
        
        # Get score from white's perspective
        white_score = score.white().score()
        if white_score is None:
            # Check for mate
            mate = score.white().mate()
            score_text = f"M{mate}" if mate else "0.0"
        else:
            score_text = f"{white_score/100:.2f}"
            
        best_move_san = board.san(pv[0]) if pv else ""
        pv_san = []
        temp_board = board.copy()
        for move in pv[:5]: # Return top 5 moves of PV
            pv_san.append(temp_board.san(move))
            temp_board.push(move)

        return {
            "score": score_text,
            "best_move": best_move_san,
            "pv": pv_san,
            "depth": info.get("depth"),
            "nps": info.get("nps"),
            "nodes": info.get("nodes")
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

_eval_executor = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="stockfish_eval")

@app.websocket("/api/ws/evaluate")
async def websocket_evaluate(websocket: WebSocket):
    await websocket.accept()
    global stockfish
    loop = asyncio.get_event_loop()

    def _score_text(score):
        if not score:
            return "0.00"
        white_score = score.white().score()
        if white_score is None:
            mate = score.white().mate()
            return (f"M{mate}" if mate and mate > 0 else f"-M{abs(mate)}") if mate else "0.00"
        return f"{'+' if white_score > 0 else ''}{white_score / 100:.2f}"

    def _pv_san(board: chess.Board, pv_moves, max_moves: int = 8):
        san_list = []
        temp = board.copy()
        for move in pv_moves[:max_moves]:
            try:
                san_list.append(temp.san(move))
                temp.push(move)
            except Exception:
                break
        return san_list

    def _format_multipv(board: chess.Board, result: dict):
        lines = []
        for line in result.get("lines", []):
            pv = line.get("pv", [])
            score = line.get("score")
            san_moves = _pv_san(board, pv)
            lines.append({
                "score": _score_text(score),
                "best_move": san_moves[0] if san_moves else "",
                "pv": san_moves,
                "multipv": line.get("multipv", 1),
            })
        # Sort by multipv index so line 1 is always first
        lines.sort(key=lambda l: l["multipv"])
        top = lines[0] if lines else {}
        return {
            "status": "update",
            "score": top.get("score", "0.00"),
            "best_move": top.get("best_move", ""),
            "pv": top.get("pv", []),
            "lines": lines,
            "depth": result.get("depth"),
            "nps": result.get("lines", [{}])[0].get("nps") if result.get("lines") else None,
        }

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            fen = msg.get("fen")
            time_limit = float(msg.get("time_limit", 2.0))

            if not fen:
                continue

            config = get_config()
            if stockfish is None:
                stockfish = StockfishAnalyzer(path_or_url=config["stockfish_path"], threads=int(config.get("stockfish_threads", 1)), hash_size=int(config.get("stockfish_hash", 4096)))

            board = chess.Board(fen)
            queue: asyncio.Queue = asyncio.Queue()

            def _stream_to_queue(b, tl):
                try:
                    for result in stockfish.get_multipv_stream(b, tl, num_lines=3, min_pv_depth=4):
                        asyncio.run_coroutine_threadsafe(queue.put(result), loop)
                except Exception as exc:
                    asyncio.run_coroutine_threadsafe(queue.put({"error": str(exc)}), loop)
                finally:
                    asyncio.run_coroutine_threadsafe(queue.put(None), loop)

            loop.run_in_executor(_eval_executor, _stream_to_queue, board, time_limit)

            while True:
                result = await queue.get()
                if result is None:
                    break
                if "error" in result:
                    await websocket.send_json({"status": "error", "message": result["error"]})
                    break
                await websocket.send_json(_format_multipv(board, result))

            await websocket.send_json({"status": "complete"})

    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        traceback.print_exc()
        try:
            await websocket.send_json({"status": "error", "message": str(e)})
        except Exception:
            pass

@app.websocket("/api/ws/full-analysis")
async def websocket_full_analysis(websocket: WebSocket):
    await websocket.accept()
    global stockfish
    
    try:
        data = await websocket.receive_text()
        msg = json.loads(data)
        title = msg.get("title", "Imported Game")
        pgn_text = msg.get("pgn", "")
        depth = msg.get("depth", "Standard")
        game_uuid = msg.get("game_uuid")
        
        depth_map = {
            'Fast': 0.5,
            'Standard': 2.0,
            'Deep': 10.0
        }
        time_limit = depth_map.get(depth, 2.0)

        config = get_config()
        if stockfish is None:
            stockfish = StockfishAnalyzer(path_or_url=config["stockfish_path"], threads=int(config.get("stockfish_threads", 1)), hash_size=int(config.get("stockfish_hash", 4096)))
        
        # Save PGN
        games_dir = Path("games")
        games_dir.mkdir(exist_ok=True)
        safe_title = "".join([c for c in title if c.isalnum() or c in (' ', '-', '_')]).rstrip()
        import time as time_mod
        filename = f"{safe_title or 'game'}_{int(time_mod.time())}.pgn"
        # Parse PGN
        pgn_io = io.StringIO(pgn_text)
        game = chess.pgn.read_game(pgn_io)
        if not game:
            await websocket.send_json({"status": "error", "message": "Invalid PGN"})
            return

        moves = list(game.mainline_moves())
        total_moves = len(moves)
        analysis_results = []
        board = game.board()
        
        tc = game.headers.get("TimeControl", "")
        start_time, increment = stockfish._parse_time_control(tc)
        
        last_times = {
            "white": start_time if start_time > 0 else None, 
            "black": start_time if start_time > 0 else None
        }
        
        for ply, move in enumerate(moves, 1):
            # Debug: log the move being sent to Stockfish
            move_san = board.san(move)
            move_uci = move.uci()
            # Verify board state matches expected game position
            expected_board = game.board()
            for i, m in enumerate(moves[:ply-1]):
                expected_board.push(m)
            if board.fen() != expected_board.fen():
                print(f"[ANALYSIS-DRIFT] ply={ply} board drifted! expected={expected_board.fen()} actual={board.fen()}", flush=True)
                board = expected_board
            print(f"[ANALYSIS] ply={ply} san={move_san} uci={move_uci} fen_before={board.fen()}", flush=True)

            # Send progress update
            await websocket.send_json({
                "status": "progress",
                "current_move": board.san(move),
                "label": f"{(ply + 1) // 2}{'w' if ply % 2 != 0 else 'b'}",
                "ply": ply,
                "total": total_moves,
                "percent": int((ply / total_moves) * 100)
            })

            node = game.root()
            for _ in range(ply):
                node = node.variation(0)
            
            import _sqlite3
            import sqlite3
            from database import DB_PATH
            conn = sqlite3.connect(str(DB_PATH))
            conn.row_factory = sqlite3.Row
            # Try to pass a stream function down to _analyze_move_node to stream thoughts back to websocket
            # But await is tricky inside sync functions... so we'll just poll or we'll wrap a small stream call here
            
            # Since _analyze_move_node blocks waiting for get_cpl_for_move
            # Let's stream engine thoughts directly here right before we run _analyze_move_node
            # We skip this if it's already fast but streaming is cool.
            
            async def stream_callback(info):
                pv_moves = info.get("pv", [])
                pv_san = ""
                if pv_moves:
                    pv_board = board.copy()
                    pv_parts = []
                    for m in pv_moves[:6]:
                        try:
                            pv_parts.append(pv_board.san(m))
                            pv_board.push(m)
                        except Exception:
                            break
                    pv_san = " ".join(pv_parts)
                await websocket.send_json({
                    "status": "engine_thoughts",
                    "depth": info.get("depth", 0),
                    "score": f"{info.get('score').white().score()/100:.2f}" if (info.get("score") and info.get("score").white().score() is not None) else "",
                    "nps": info.get("nps", 0),
                    "pv": pv_san
                })
            
            # Since engine is sync right now and run via blocking generator, we'll run a quick stream
            # Wait, best to use stockfish.get_analysis_stream(board, time_limit)
            # Actually, `get_cpl_for_move` internally uses `engine.analyse` which blocks.
            # So let's run the stream here, THEN calculate CPL (which will be instantaneous due to hash tables / cached evaluations in python-chess engine)
            
            last_stream_info = None
            for info in stockfish.get_analysis_stream(board, time_limit=time_limit):
                await stream_callback(info)
                await asyncio.sleep(0)
                if "error" not in info:
                    last_stream_info = info

            move_data = stockfish._analyze_move_node(node, board, ply, last_times, increment, time_limit, conn, pre_eval=last_stream_info)
            conn.close()
            analysis_results.append(move_data)
            board.push(move)

        annotated_pgn = _embed_analysis_in_pgn(pgn_text, analysis_results)
        _save_pgn_file(title, annotated_pgn)
        game_json = _pgn_to_game_json(pgn_text, analysis_results, title)
        saved_game_id = None
        if game_json:
            try:
                if game_uuid:
                    game_json["uuid"] = game_uuid
                saved_game_id = save_game(game_json, analysis_depth=depth)
            except Exception:
                pass

        await websocket.send_json({
            "status": "success",
            "title": title,
            "pgn": pgn_text,
            "depth": depth,
            "analysis": analysis_results,
            "game_id": saved_game_id,
            "game_uuid": game_uuid,
        })

    except WebSocketDisconnect:
        print("Analysis WebSocket disconnected")
    except Exception as e:
        traceback.print_exc()
        try:
            await websocket.send_json({"status": "error", "message": str(e)})
        except:
            pass

@app.post("/api/upload-only")
async def upload_only(file: UploadFile = File(...)):
    uploads_dir = Path("uploads")
    uploads_dir.mkdir(exist_ok=True)
    file_path = uploads_dir / file.filename
    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())
    return {"file_url": f"/uploads/{file.filename}"}

@app.post("/api/import-pgn")
def import_pgn(data: dict):
    title = data.get("title", "Imported Game")
    pgn_text = data.get("pgn", "")
    depth = data.get("depth", "Standard")
    
    # Map depth to time limit
    depth_map = {
        'Fast': 2.0,
        'Standard': 10.0,
        'Deep': 30.0
    }
    time_limit = depth_map.get(depth, 10.0)

    global stockfish
    config = get_config()
    if stockfish is None:
        stockfish = StockfishAnalyzer(path_or_url=config["stockfish_path"], threads=int(config.get("stockfish_threads", 1)), hash_size=int(config.get("stockfish_hash", 4096)))
    
    try:
        analysis_results = stockfish.analyze_full_game(pgn_text, time_limit=time_limit)
        annotated_pgn = _embed_analysis_in_pgn(pgn_text, analysis_results)
        _save_pgn_file(title, annotated_pgn)
        game_json = _pgn_to_game_json(pgn_text, analysis_results, title)
        if game_json:
            try:
                game_uuid = data.get("game_uuid")
                if game_uuid:
                    game_json["uuid"] = game_uuid
                save_game(game_json, analysis_depth=data.get("depth", "Standard"))
            except Exception:
                pass
        return {
            "status": "success",
            "title": title,
            "pgn": pgn_text,
            "depth": depth,
            "analysis": analysis_results
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

# ── Chess.com Proxy ────────────────────────────────────────────────────────────

_cc_cache: dict = {}  # simple in-memory cache: key -> {'data': ..., 'expires': float}


@app.get("/api/chesscom/archives")
async def chesscom_archives(username: str):
    """Proxy to Chess.com API: list game archives for a player."""
    import time as _t
    cache_key = f"archives:{username}"
    cached = _cc_cache.get(cache_key)
    if cached and cached["expires"] > _t.time():
        return cached["data"]

    url = f"https://api.chess.com/pub/player/{username}/games/archives"
    try:
        resp = await _http_client.get(url, headers={"User-Agent": "ChessAnalyzer/1.0"})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Chess.com API error: {exc}")

    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Username not found on Chess.com")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Chess.com API error: {resp.status_code}")

    data = resp.json()
    _cc_cache[cache_key] = {"data": data, "expires": _t.time() + 300}
    return data


@app.get("/api/chesscom/games")
async def chesscom_games(username: str, year: int, month: int, offset: int = 0, limit: int = 30):
    """Proxy to Chess.com API: fetch games for a given month, parsed into a cleaner list.

    On cache miss: streams the PGN response and yields each game as NDJSON
    so the full parsed list never exists in memory simultaneously.
    On cache hit: returns JSON (fast path, unchanged)."""
    import time as _t
    cache_key = f"games:{username}:{year}:{month}"
    cached = _cc_cache.get(cache_key)
    if cached and cached["expires"] > _t.time():
        games_list = cached["data"]
        return {"games": games_list[offset:offset + limit], "total": len(games_list)}

    url = f"https://api.chess.com/pub/player/{username}/games/{year}/{month:02d}/pgn"

    async def ndjson_generator():
        """Stream-parse the PGN response. Yields each game as a JSON line.
        Also caches the full list after parsing completes."""
        import time as _t2
        parsed_all = []

        try:
            resp = await _http_client.get(url, headers={"User-Agent": "ChessAnalyzer/1.0"})
        except httpx.HTTPError as exc:
            yield json.dumps({"error": f"Chess.com API error: {exc}"}) + "\n"
            return

        if resp.status_code == 404:
            yield json.dumps({"error": "Username not found on Chess.com"}) + "\n"
            return
        if resp.status_code != 200:
            yield json.dumps({"error": f"Chess.com API error: {resp.status_code}"}) + "\n"
            return

        # Incrementally parse the PGN response body — no buffering the full list
        pgn_stream = io.StringIO(resp.text)
        while True:
            try:
                game = chess.pgn.read_game(pgn_stream)
            except Exception:
                break
            if game is None:
                break

            h = game.headers
            pgn_text = str(game)
            game_entry = {
                "url": h.get("Link", ""),
                "white": h.get("White", ""),
                "black": h.get("Black", ""),
                "date": h.get("Date", ""),
                "result": h.get("Result", ""),
                "eco": h.get("ECO", ""),
                "event": h.get("Event", ""),
                "time_control": h.get("TimeControl", ""),
                "termination": h.get("Termination", ""),
                "pgn": pgn_text,
                "rated": True,
                "white_accuracy": None,
                "black_accuracy": None,
            }
            parsed_all.append(game_entry)
            yield json.dumps(game_entry) + "\n"

        # Populate cache for subsequent requests
        _cc_cache[cache_key] = {"data": parsed_all, "expires": _t2.time() + 120}

    return StreamingResponse(ndjson_generator(), media_type="application/x-ndjson")


class ChessComImportRequest(BaseModel):
    games: list  # list of dicts with 'pgn' (str) and optional 'title' (str)
    depth: Optional[str] = None  # None = import only, no analysis
    username: Optional[str] = None  # for auto-detecting player color


@app.post("/api/chesscom/import")
async def chesscom_import(req: ChessComImportRequest):
    """Import games from Chess.com. If depth is None, saves without analysis.
    If depth is provided, queues for background analysis."""
    import uuid as _uuid

    imported = 0
    skipped = 0
    failed = 0
    details = []

    for entry in req.games:
        pgn_text = entry.get("pgn", "")
        if not pgn_text:
            failed += 1
            details.append({"title": "", "status": "failed"})
            continue

        # Parse PGN to extract headers
        pgn_io = io.StringIO(pgn_text)
        parsed_game = chess.pgn.read_game(pgn_io)

        title = entry.get("title")
        if not title and parsed_game:
            h = parsed_game.headers
            title = f"{h.get('White', '?')} vs {h.get('Black', '?')} ({h.get('Date', '?')})"
        elif not title:
            title = "Imported Game"

        if req.depth is None:
            # Import only — no analysis
            try:
                game_json = _pgn_to_game_json(pgn_text, [], title)
                if game_json:
                    # Check for duplicates before saving
                    existing_uuid = game_json.get("uuid")
                    conn_check = None
                    try:
                        from database import _get_db
                        conn_check = _get_db()
                        existing_row = None
                        if existing_uuid:
                            existing_row = conn_check.execute(
                                "SELECT id FROM games WHERE uuid=?", (existing_uuid,)
                            ).fetchone()
                        if not existing_row and title:
                            existing_row = conn_check.execute(
                                "SELECT id FROM games WHERE title=? COLLATE NOCASE", (title,)
                            ).fetchone()
                        if existing_row:
                            skipped += 1
                            details.append({"title": title, "status": "skipped"})
                            continue
                    except Exception:
                        pass
                    finally:
                        if conn_check:
                            try:
                                conn_check.close()
                            except Exception:
                                pass
                    save_game(game_json, analysis_depth="")
                    imported += 1
                    details.append({"title": title, "status": "imported"})
                else:
                    failed += 1
                    details.append({"title": title, "status": "failed"})
            except Exception as e:
                logging.warning(f"chesscom import failed for '{title}': {e}")
                failed += 1
                details.append({"title": title, "status": "failed"})
        else:
            # Queue for background analysis
            try:
                game_uuid = str(_uuid.uuid4())
                if parsed_game:
                    # Generate a stable-ish UUID from PGN content
                    import hashlib
                    game_uuid = hashlib.md5(pgn_text.encode()).hexdigest()[:8] + "-" + str(_uuid.uuid4())[:8]
                job_req = _QueueAddReq(
                    game_uuid=game_uuid,
                    title=title,
                    pgn=pgn_text,
                    depth=req.depth,
                )
                # Check if already queued
                if any(j["game_uuid"] == job_req.game_uuid and j["status"] in ("queued", "analyzing") for j in _queue_jobs):
                    skipped += 1
                    details.append({"title": title, "status": "skipped"})
                else:
                    await queue_add(job_req)
                    imported += 1
                    details.append({"title": title, "status": "queued"})
            except Exception as e:
                logging.warning(f"chesscom queue failed for '{title}': {e}")
                failed += 1
                details.append({"title": title, "status": "failed"})

    return {
        "imported": imported,
        "skipped": skipped,
        "failed": failed,
        "details": details,
    }


# ── Lichess Import ────────────────────────────────────────────────────────────

_lichess_cache: dict = {}


@app.get("/api/lichess/games")
async def lichess_games(username: str, max: int = 50, perf_type: str = "", offset: int = 0, limit: int = 30):
    """Proxy to Lichess API: fetch recent games for a player as structured list."""
    import time as _t
    from datetime import datetime as _dt

    cache_key = f"lichess:{username}:{max}:{perf_type}"
    cached = _lichess_cache.get(cache_key)
    if cached and cached["expires"] > _t.time():
        games_list = cached["data"]
        return {"games": games_list[offset:offset + limit], "total": len(games_list)}

    params: dict = {
        "max": min(max, 300),
        "clocks": "true",
        "opening": "true",
        "pgnInJson": "true",
    }
    if perf_type:
        params["perfType"] = perf_type

    url = f"https://lichess.org/api/games/user/{username}"
    try:
        resp = await _http_client.get(
            url, params=params,
            headers={"Accept": "application/x-ndjson", "User-Agent": "ChessAnalyzer/1.0"},
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Lichess API error: {exc}")

    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Username not found on Lichess")
    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="Lichess rate limit reached — please wait a moment")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Lichess API error: {resp.status_code}")

    games = []
    for line in resp.text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            g = json.loads(line)
        except Exception:
            continue

        if g.get("status") in ("aborted", "noStart"):
            continue

        white_p = g.get("players", {}).get("white", {})
        black_p = g.get("players", {}).get("black", {})
        white = white_p.get("user", {}).get("name") or f"AI lv{white_p.get('aiLevel', '?')}"
        black = black_p.get("user", {}).get("name") or f"AI lv{black_p.get('aiLevel', '?')}"

        winner = g.get("winner")
        result = "1-0" if winner == "white" else "0-1" if winner == "black" else "1/2-1/2"

        created_ms = g.get("createdAt", 0)
        date_str = _dt.utcfromtimestamp(created_ms / 1000).strftime("%Y.%m.%d") if created_ms else ""

        opening = g.get("opening") or {}
        clock = g.get("clock") or {}
        if clock:
            tc_str = f"{clock.get('initial', 0)}+{clock.get('increment', 0)}"
        else:
            tc_str = g.get("speed", "")

        games.append({
            "url": f"https://lichess.org/{g.get('id', '')}",
            "white": white,
            "black": black,
            "white_rating": white_p.get("rating", 0),
            "black_rating": black_p.get("rating", 0),
            "date": date_str,
            "result": result,
            "eco": opening.get("eco", ""),
            "opening": opening.get("name", ""),
            "event": f"Lichess {g.get('speed', '').title()}",
            "time_control": tc_str,
            "pgn": g.get("pgn", ""),
            "rated": g.get("rated", False),
        })

    _lichess_cache[cache_key] = {"data": games, "expires": _t.time() + 60}
    return {"games": games[offset:offset + limit], "total": len(games)}


class LichessImportRequest(BaseModel):
    games: list
    depth: Optional[str] = None
    username: Optional[str] = None


@app.post("/api/lichess/import")
async def lichess_import(req: LichessImportRequest):
    """Import Lichess games — identical pipeline to Chess.com import."""
    cc_req = ChessComImportRequest(games=req.games, depth=req.depth, username=req.username)
    return await chesscom_import(cc_req)


# ── Background Analysis Queue ─────────────────────────────────────────────────

_queue_jobs: list = []          # list of job dicts, mutated under GIL
_queue_sf: Optional[StockfishAnalyzer] = None  # dedicated engine for queue
_queue_cancel = threading.Event()              # set to abort the running job
_queue_clients: set = set()                   # connected /api/ws/queue WebSockets
_queue_loop_ref: Optional[asyncio.AbstractEventLoop] = None  # for thread-safe broadcast


async def _broadcast_queue():
    """Push current _queue_jobs to every connected queue WebSocket client."""
    if not _queue_clients:
        return
    payload = json.dumps(_queue_jobs)
    dead = set()
    for ws in list(_queue_clients):
        try:
            await ws.send_text(payload)
        except Exception:
            dead.add(ws)
    _queue_clients.difference_update(dead)


def _broadcast_queue_threadsafe():
    """Schedule _broadcast_queue() from any worker thread onto the event loop."""
    if _queue_loop_ref is not None:
        try:
            asyncio.run_coroutine_threadsafe(_broadcast_queue(), _queue_loop_ref)
        except Exception:
            pass  # best-effort; worker thread must not crash


@app.on_event("startup")
async def _start_queue_worker():
    global _queue_loop_ref
    _queue_loop_ref = asyncio.get_event_loop()
    asyncio.create_task(_queue_loop())


async def _queue_loop():
    """Async loop: picks the next queued job and runs it in a thread."""
    while True:
        job = next((j for j in _queue_jobs if j["status"] == "queued"), None)
        if job is None:
            await asyncio.sleep(1)
            continue

        job["status"] = "analyzing"
        _queue_cancel.clear()
        await _broadcast_queue()  # push: queued → analyzing

        try:
            await asyncio.to_thread(_run_queue_job, job, _queue_cancel)
        except Exception as exc:
            traceback.print_exc()
            if job["status"] not in ("done", "cancelled"):
                job["status"] = "error"
                job["error"] = str(exc)
        await _broadcast_queue()  # push: final state (done / error / cancelled)

        await asyncio.sleep(0.2)


def _run_queue_job(job: dict, cancel: threading.Event):
    """Synchronous full-game analysis — runs in a worker thread."""
    global _queue_sf
    import sqlite3 as _sq

    config = get_config()
    if _queue_sf is None:
        _queue_sf = StockfishAnalyzer(
            path_or_url=config["stockfish_path"],
            threads=int(config.get("stockfish_threads", 1)),
            hash_size=int(config.get("stockfish_hash", 4096))
        )

    tl = {"Fast": 0.5, "Standard": 2.0, "Deep": 10.0}.get(job["depth"], 2.0)

    pgn_io = io.StringIO(job["pgn"])
    game = chess.pgn.read_game(pgn_io)
    if not game:
        raise ValueError("Invalid PGN")

    moves = list(game.mainline_moves())
    total = len(moves)
    board = game.board()
    results = []

    tc = game.headers.get("TimeControl", "")
    start_t, inc = _queue_sf._parse_time_control(tc)
    last_t = {"white": start_t or None, "black": start_t or None}

    conn = _sq.connect(str(DB_PATH))
    conn.row_factory = _sq.Row
    try:
        for ply, move in enumerate(moves, 1):
            if cancel.is_set():
                job["status"] = "cancelled"
                _broadcast_queue_threadsafe()
                return
            print(f"[QUEUE-ANALYSIS] ply={ply} san={board.san(move)} uci={move.uci()} fen_before={board.fen()}", flush=True)
            job["progress"] = {
                "percent": int((ply - 1) / total * 100),
                "current_move": board.san(move),
                "ply": ply,
                "total": total,
            }
            _broadcast_queue_threadsafe()  # push progress update
            node = game.root()
            for _ in range(ply):
                node = node.variation(0)
            results.append(_queue_sf._analyze_move_node(node, board, ply, last_t, inc, tl, conn))
            board.push(move)
    finally:
        conn.close()

    if cancel.is_set():
        job["status"] = "cancelled"
        _broadcast_queue_threadsafe()
        return

    game_json = _pgn_to_game_json(job["pgn"], results, job["title"])
    if game_json:
        game_json["uuid"] = job["game_uuid"]
        job["result_game_id"] = save_game(game_json, analysis_depth=job.get("depth", "Standard"))

    job["progress"] = {"percent": 100, "current_move": "Complete", "ply": total, "total": total}
    job["status"] = "done"
    _broadcast_queue_threadsafe()  # push: done with result_game_id


class _QueueAddReq(BaseModel):
    game_uuid: str
    game_id: Optional[int] = None
    title: str = "Game"
    pgn: str
    depth: str = "Standard"


@app.websocket("/api/ws/queue")
async def websocket_queue(websocket: WebSocket):
    """Persistent push channel: sends full _queue_jobs list on every state change."""
    await websocket.accept()
    _queue_clients.add(websocket)
    try:
        await websocket.send_text(json.dumps(_queue_jobs))  # immediate sync on connect
    except Exception:
        _queue_clients.discard(websocket)
        return
    try:
        while True:
            await websocket.receive_text()  # hold connection open; client sends nothing
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        _queue_clients.discard(websocket)


@app.post("/api/queue")
async def queue_add(req: _QueueAddReq):
    import uuid as _uuid
    global _queue_jobs
    # Prevent duplicate queuing of the same game while already active
    if any(j["game_uuid"] == req.game_uuid and j["status"] in ("queued", "analyzing") for j in _queue_jobs):
        existing = next(j for j in _queue_jobs if j["game_uuid"] == req.game_uuid)
        return {"job_id": existing["job_id"], "duplicate": True}
    # Remove any stale terminal entries (error/done/cancelled) for this game before re-queuing
    _queue_jobs = [j for j in _queue_jobs if not (j["game_uuid"] == req.game_uuid and j["status"] in ("error", "done", "cancelled"))]
    job = {
        "job_id": str(_uuid.uuid4())[:8],
        "game_uuid": req.game_uuid,
        "game_id": req.game_id,
        "title": req.title,
        "pgn": req.pgn,
        "depth": req.depth,
        "status": "queued",
        "progress": {},
        "error": None,
        "result_game_id": None,
    }
    _queue_jobs.append(job)
    try:
        await _broadcast_queue()  # push: new job added
    except Exception:
        pass  # best-effort; client will pick up state on next poll
    return {"job_id": job["job_id"]}


@app.get("/api/queue")
def queue_list():
    return _queue_jobs


@app.delete("/api/queue/{job_id}")
async def queue_remove(job_id: str):
    global _queue_jobs
    job = next((j for j in _queue_jobs if j["job_id"] == job_id), None)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] == "analyzing":
        _queue_cancel.set()
    _queue_jobs = [j for j in _queue_jobs if j["job_id"] != job_id]
    await _broadcast_queue()  # push: job removed
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9001)
