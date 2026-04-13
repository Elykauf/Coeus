import sqlite3
import json
import io
import sys
import os
import site
site.addsitedir('/Users/elijah/Library/Python/3.9/lib/python/site-packages')
import chess
import chess.pgn

# Import our new classifier (ensure utils is on the path)
sys.path.append(os.path.join(os.path.dirname(__file__), 'utils'))
from opening import classify_opening

def backfill_eco():
    conn = sqlite3.connect("chess_games.db")
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT id, data FROM games").fetchall()
    
    updates = 0
    for row in rows:
        data = json.loads(row["data"])
        meta = data.get("metadata", {})
        
        # Determine if ECO is missing or a placeholder
        eco_code = meta.get("eco", "").split(" ")[0]
        if not eco_code or eco_code == "?":
            raw_pgn = data.get("raw_pgn")
            if raw_pgn:
                try:
                    game = chess.pgn.read_game(io.StringIO(raw_pgn))
                    if game:
                        classification = classify_opening(game)
                        if classification:
                            # Update metadata object with new values
                            meta["eco"] = classification["eco"]
                            meta["opening"] = classification["name"]
                            
                            # Rewrite the data blob
                            data["metadata"] = meta
                            conn.execute("UPDATE games SET eco = ?, data = ? WHERE id = ?", 
                                         (meta["eco"], json.dumps(data), row["id"]))
                            updates += 1
                except Exception as e:
                    print(f"Error classifying game {row['id']}: {e}")
            
    conn.commit()
    conn.close()
    print(f"Successfully backfilled ECO codes for {updates} games.")

if __name__ == "__main__":
    backfill_eco()
