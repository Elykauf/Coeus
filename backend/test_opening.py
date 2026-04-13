import sys
import os
import json
import chess.pgn
import io
sys.path.append(os.path.join(os.path.dirname(__file__), 'utils'))
from opening import classify_opening

pgn_str = """[Event "Casual Game"]
[Site "?"]
[Date "????.??.??"]
[Round "?"]
[White "?"]
[Black "?"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *"""

game = chess.pgn.read_game(io.StringIO(pgn_str))
res = classify_opening(game)

print(json.dumps(res, indent=2))
