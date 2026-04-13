import csv
import chess
from pathlib import Path

# Module level cache
_ECO_DB = {}

def _init_eco_db():
    if _ECO_DB:
        return
    assets_dir = Path(__file__).parent.parent / "assets"
    
    # Load all TSV files A, B, C, D, E.tsv mapping ECO names and initial sequences to FENs
    for char in ('a', 'b', 'c', 'd', 'e'):
        tsv_path = assets_dir / f"{char}.tsv"
        if not tsv_path.exists():
            continue
            
        with open(tsv_path, newline='', encoding='utf-8') as f:
            reader = csv.reader(f, delimiter='\t')
            # Skip header: eco, name, pgn
            next(reader, None)
            
            for row in reader:
                if len(row) < 3:
                    continue
                eco_code = row[0].strip()
                name = row[1].strip()
                pgn_str = row[2].strip()
                
                # Convert PGN move string to a Zobrist hash or FEN representing the position
                board = chess.Board()
                moves = pgn_str.split(" ")
                valid = True
                
                # Simple parser for raw algebraic list 1. e4 e5 2. Nf3
                clean_moves = [m for m in moves if not m.endswith('.') and m != '']
                try:
                    for m in clean_moves:
                        board.push_san(m)
                except Exception:
                    valid = False
                    
                if valid:
                    # Save into DB mapped by the exact position representation
                    epd = board.epd(en_passant="fen") # Basic position string omitting halfmove clocks
                    _ECO_DB[epd] = {"eco": eco_code, "name": name, "depth": len(clean_moves)}

def classify_opening(game):
    """
    Given a chess.pgn.Game (or a node representing the game),
    traverse the first 30 plies to find the deepest recognized opening.
    """
    _init_eco_db()
    
    best_match = None
    node = game.root()
    board = node.board()
    
    # Check the root position first before iterating moves
    epd = board.epd(en_passant="fen")
    if epd in _ECO_DB:
        best_match = _ECO_DB[epd]
        
    plies_checked = 0
    # Walk down the mainline
    for move in game.mainline_moves():
        if plies_checked >= 40:
            break
        
        board.push(move)
        epd = board.epd(en_passant="fen")
        
        if epd in _ECO_DB:
            # Found a deeper/more specific opening
            match = _ECO_DB[epd]
            if best_match is None or match["depth"] >= best_match["depth"]:
                best_match = match
                
        plies_checked += 1
        
    return best_match
