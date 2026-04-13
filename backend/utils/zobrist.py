import random
import chess
import ctypes

# Seed the RNG for consistent hashes across runs
random.seed(42)

def _get_rand_64_signed():
    """Returns a signed 64-bit integer suitable for SQLite."""
    val = random.getrandbits(64)
    return ctypes.c_longlong(val).value

# Zobrist constants for pieces and colors
PIECE_KEYS = {}
for i in range(1, 7): # chess.PAWN to chess.KING
    for j in [True, False]: # chess.WHITE, chess.BLACK
        for k in range(64):
            PIECE_KEYS[(i, j, k)] = _get_rand_64_signed()

# Zobrist constants for side to move
BLACK_MOVE_KEY = _get_rand_64_signed()

# Zobrist constants for castling rights (16 possible states)
CASTLING_KEYS = [_get_rand_64_signed() for _ in range(16)]

# Zobrist constants for en passant file (8 possible files + 1 for none)
EN_PASSANT_KEYS = [_get_rand_64_signed() for _ in range(9)]

def calculate_hash(board: chess.Board) -> int:
    h = 0

    # XOR piece squares
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece is not None:
            h ^= PIECE_KEYS[(piece.piece_type, piece.color, square)]

    # XOR side to move
    if board.turn == chess.BLACK:
        h ^= BLACK_MOVE_KEY

    # XOR castling rights. `board.castling_rights` is a bitmask of squares (a 64-bit int).
    # We map standard castling rights to a 0-15 index.
    castling_state = 0
    rights = board.castling_rights
    if rights & chess.BB_H1: castling_state |= 1 # White kingside
    if rights & chess.BB_A1: castling_state |= 2 # White queenside
    if rights & chess.BB_H8: castling_state |= 4 # Black kingside
    if rights & chess.BB_A8: castling_state |= 8 # Black queenside
    h ^= CASTLING_KEYS[castling_state]

    # XOR en passant
    if board.ep_square is not None:
        file = chess.square_file(board.ep_square)
        h ^= EN_PASSANT_KEYS[file]

    # Mask to signed 64-bit so SQLite INTEGER column handles it correctly
    return ctypes.c_longlong(h & 0xFFFFFFFFFFFFFFFF).value
