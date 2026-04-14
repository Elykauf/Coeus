# ── Cheat Detector ─────────────────────────────────────────────────────────────
# Statistical fairness analysis for a player's half of a chess game.
# Returns a CheatReport with signal scores and a human-readable summary.

from dataclasses import dataclass, asdict
from typing import Any, Optional
import math


@dataclass
class CheatReport:
    fairness_score: float       # 0–1 (1 = most suspicious)
    fairness_label: str         # FAIR / SUSPICIOUS / LIKELY_MANIPULATED
    luck_score: float          # positive = lucky, negative = unlucky
    accuracy_variance: float   # std-dev of per-move accuracy
    time_correlation: float   # Pearson r between time_spent and CPL (-1 to 1)
    perfect_streak_max: int    # longest consecutive CPL=0 run
    phase_accuracy: dict       # {phase: avg_accuracy}
    premove_count: int         # moves < 1s in positions with 3+ legal moves & eval > 1 pawn
    flagged_move_count: int    # total flagged moves
    flagged_moves: list         # [{ply, san, reason, time_spent, cpl}]
    summary: str                # paragraph summary

    def to_dict(self) -> dict:
        return asdict(self)


def compute_pearson_r(x: list[float], y: list[float]) -> float:
    """Pearson correlation coefficient. Returns 0 if insufficient variance."""
    n = len(x)
    if n < 3:
        return 0.0
    mx, my = sum(x) / n, sum(y) / n
    num = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
    dx = math.sqrt(sum((xi - mx) ** 2 for xi in x))
    dy = math.sqrt(sum((yi - my) ** 2 for yi in y))
    if dx == 0 or dy == 0:
        return 0.0
    return num / (dx * dy)


def get_accuracy(cpl: Optional[float]) -> float:
    """Convert centipawn loss to 0–100 accuracy."""
    if cpl is None:
        return 100.0
    return max(0.0, 100.0 * math.exp(-0.005 * cpl))


def count_legal_moves(fen: str) -> int:
    """Rough legal move count from FEN using chess library if available."""
    try:
        import chess
        board = chess.Board(fen)
        return len(list(board.legal_moves))
    except Exception:
        return 20  # conservative default


# ── Helpers to read move fields from both DB format (nested) and analysis format (flat) ──

def _cpl(m: dict) -> float:
    """Centipawn loss: annotations.cpl (DB) or root-level cpl (analysis format)."""
    return m.get("annotations", {}).get("cpl") or m.get("cpl") or 0

def _phase(m: dict) -> str:
    """Phase: annotations.phase (DB) or root-level phase (analysis format)."""
    ann = m.get("annotations", {})
    return ann.get("phase") if ann.get("phase") else (m.get("phase") or "unknown")

def _time_spent(m: dict) -> float:
    """Time spent: time.moveDurationSeconds (DB) or root-level time_spent (analysis format)."""
    t = m.get("time", {})
    if t.get("moveDurationSeconds") is not None:
        return float(t["moveDurationSeconds"])
    return float(m.get("time_spent") or 0)

def _build_flagged_moves(moves: list[dict], opponent_moves: list[dict]) -> tuple[list[dict], int]:
    """
    Flag suspicious individual moves from the opponent's half.
    Returns (flagged_moves, premove_count).
    A move is flagged if:
      - CPL = 0 AND time_spent < 3s AND phase = middlegame/endgame
      - OR accuracy = 100 AND time_spent < 2s
    """
    flagged = []
    premove_count = 0

    for m in opponent_moves:
        cpl = _cpl(m)
        t = _time_spent(m)
        phase = _phase(m)
        san = m.get("san") or "?"
        ply = m.get("ply") or 0
        acc = get_accuracy(cpl)
        reason = None

        if cpl == 0 and t < 3 and phase in ("middlegame", "endgame"):
            reason = f"Perfect play ({acc:.0f}%) in {t:.1f}s — {phase}"
            premove_count += 1
        elif acc == 100 and t < 2:
            reason = f"100% accuracy in {t:.1f}s — instant perfect move"
            premove_count += 1

        if reason:
            flagged.append({
                "ply": ply,
                "san": san,
                "reason": reason,
                "time_spent": round(t, 1),
                "cpl": cpl,
                "accuracy": round(acc, 1),
            })

    return flagged, premove_count


def _perfect_clusters(moves: list[dict]) -> int:
    """Longest run of consecutive zero-CPL moves."""
    max_streak = 0
    current = 0
    for m in moves:
        if _cpl(m) == 0:
            current += 1
            max_streak = max(max_streak, current)
        else:
            current = 0
    return max_streak


def _phase_breakdown(moves: list[dict]) -> dict[str, float]:
    """Average accuracy per phase for the given move set."""
    phases: dict[str, list[float]] = {}
    for m in moves:
        phase = _phase(m)
        phases.setdefault(phase, []).append(get_accuracy(_cpl(m)))
    return {p: round(sum(v) / len(v), 1) if v else 100.0 for p, v in phases.items()}


def _time_correlation(moves: list[dict]) -> float:
    """Pearson r between time spent and CPL. Negative = human pattern."""
    times = [_time_spent(m) for m in moves if _time_spent(m) > 0 or _cpl(m) > 0]
    cpls  = [_cpl(m) for m in moves if _time_spent(m) > 0 or _cpl(m) > 0]
    return round(compute_pearson_r(times, cpls), 3)


def compute_cheat_report(
    analysis: list[dict],
    side: str = "opponent",
    player_moves: Optional[list[dict]] = None,
) -> CheatReport:
    """
    Compute a fairness report for one side of a game.

    Args:
        analysis: Full game analysis array (both sides' moves)
        side: "opponent" or "self"
        player_moves: The OTHER side's moves (needed for luck_score).
                      If omitted, luck_score is skipped.
    """
    if not analysis:
        return CheatReport(
            fairness_score=0.0, fairness_label="NO_DATA",
            luck_score=0.0, accuracy_variance=0.0, time_correlation=0.0,
            perfect_streak_max=0, phase_accuracy={},
            premove_count=0, flagged_move_count=0, flagged_moves=[],
            summary="No move data available.",
        )

    # Determine whose moves to analyze
    # White moves have odd ply numbers (1,3,5...), Black have even (2,4,6...)
    if side == "opponent":
        # Opponent is the OTHER color from the reviewer's perspective
        target_moves = analysis
    else:
        target_moves = analysis

    # Split into white/black halves by ply parity
    white_moves = [m for m in target_moves if (m.get("ply") or 0) % 2 == 1]
    black_moves = [m for m in target_moves if (m.get("ply") or 0) % 2 == 0]

    # For opponent analysis: opponent is the side we're NOT viewing as
    # For self analysis: analyze the side we're viewing as
    # (The caller controls this via filtering)
    moves_to_analyze = target_moves  # caller pre-filters by reviewingAs

    # Core signals
    phase_acc = _phase_breakdown(moves_to_analyze)
    perfect_streak = _perfect_clusters(moves_to_analyze)
    time_corr = _time_correlation(moves_to_analyze)
    flagged, premove_count = _build_flagged_moves(moves_to_analyze, moves_to_analyze)

    # Accuracy variance (std-dev)
    accs = [get_accuracy(_cpl(m)) for m in moves_to_analyze]
    if len(accs) >= 2:
        mean_acc = sum(accs) / len(accs)
        variance = sum((a - mean_acc) ** 2 for a in accs) / len(accs)
        acc_variance = round(math.sqrt(variance), 2)
    else:
        acc_variance = 0.0

    # Luck score: compare opponent blunders to player blunders
    luck_score = 0.0
    if player_moves:
        opp_blunders = sum(1 for m in moves_to_analyze if _cpl(m) >= 200)
        player_blunders = sum(1 for m in player_moves if _cpl(m) >= 200)
        total = len(moves_to_analyze) + len(player_moves)
        if total > 0:
            luck_score = round((opp_blunders - player_blunders) / max(total, 1), 2)

    # Composite fairness score (0–1)
    # Higher = more suspicious
    streak_score = min(perfect_streak / 10, 1.0) * 0.30
    variance_score = min(acc_variance / 20, 1.0) * 0.20  # LOW variance = suspicious
    time_score = (1 - min(abs(time_corr) / 0.8, 1.0)) * 0.25 if time_corr < 0 else 0.0
    premove_score = min(premove_count / 5, 1.0) * 0.25

    fairness_score = round(min(streak_score + variance_score + time_score + premove_score, 1.0), 3)

    if fairness_score >= 0.6:
        label = "LIKELY_MANIPULATED"
    elif fairness_score >= 0.3:
        label = "SUSPICIOUS"
    else:
        label = "FAIR"

    # Human-readable summary
    avg_acc = round(sum(accs) / len(accs), 1) if accs else 0
    phase_str = ", ".join(f"{p}: {v:.0f}%" for p, v in phase_acc.items())
    summary = (
        f"Analyzed {len(moves_to_analyze)} moves. "
        f"Average accuracy {avg_acc:.0f}%. "
        f"Accuracy by phase: {phase_str}. "
        f"Longest perfect-move streak: {perfect_streak}. "
        f"Time-accuracy correlation: {time_corr:.2f} "
        f"({'human pattern' if time_corr < -0.1 else 'atypical'}). "
        f"{premove_count} instant moves flagged. "
        f"Overall: {label} ({fairness_score:.2f})."
    )

    return CheatReport(
        fairness_score=fairness_score,
        fairness_label=label,
        luck_score=luck_score,
        accuracy_variance=acc_variance,
        time_correlation=time_corr,
        perfect_streak_max=perfect_streak,
        phase_accuracy=phase_acc,
        premove_count=premove_count,
        flagged_move_count=len(flagged),
        flagged_moves=flagged,
        summary=summary,
    )
