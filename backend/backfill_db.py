import sqlite3
import json
import io
import sys
import site
site.addsitedir('/Users/elijah/Library/Python/3.9/lib/python/site-packages')
import chess
import chess.pgn

def generate_pgn_from_json(game_json):
    game = chess.pgn.Game()
    
    meta = game_json.get("metadata", {})
    game.headers["Event"] = meta.get("event", "Casual Game")
    game.headers["Site"] = meta.get("site", "?")
    game.headers["Date"] = meta.get("date", "?").replace("-", ".")
    game.headers["Round"] = meta.get("round", "-")
    game.headers["White"] = meta.get("white", "Unknown")
    game.headers["Black"] = meta.get("black", "Unknown")
    game.headers["Result"] = meta.get("result", "*")
    if "whiteElo" in meta: game.headers["WhiteElo"] = meta["whiteElo"]
    if "blackElo" in meta: game.headers["BlackElo"] = meta["blackElo"]
    if "eco" in meta: game.headers["ECO"] = meta["eco"]
    if "timeControl" in meta: game.headers["TimeControl"] = meta["timeControl"]
    
    start_fen = game_json.get("startFen", chess.STARTING_FEN)
    if start_fen and start_fen != chess.STARTING_FEN:
        game.headers["FEN"] = start_fen
        game.headers["SetUp"] = "1"

    node = game
    for m in game_json.get("moves", []):
        san = m.get("san")
        if not san: continue
        try:
            parsed_move = node.board().parse_san(san)
            node = node.add_variation(parsed_move)
            
            time_spent = m.get("time", {}).get("moveDurationSeconds")
            if time_spent is not None:
               node.comment = f"[%clk {time_spent}]"
               
        except ValueError:
            print(f"Skipped invalid move parsing for {san}")
            break

    return str(game)
    
def backfill():
    conn = sqlite3.connect("chess_games.db")
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT id, data FROM games").fetchall()
    
    updates = 0
    for row in rows:
        data = json.loads(row["data"])
        if not data.get("raw_pgn"):
            recovered_pgn = generate_pgn_from_json(data)
            data["raw_pgn"] = recovered_pgn
            conn.execute("UPDATE games SET data = ? WHERE id = ?", (json.dumps(data), row["id"]))
            updates += 1
            
    conn.commit()
    conn.close()
    print(f"Successfully backfilled {updates} games.")

if __name__ == "__main__":
    backfill()
