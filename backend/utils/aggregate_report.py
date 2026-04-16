from dataclasses import dataclass, asdict

from utils.cheat_detector import compute_cheat_report, DISCLAIMER, REPORTING_CHANNELS
import database


@dataclass
class AggregateReport:
    game_count: int
    overall_confidence: str
    avg_fairness_score: float
    score_distribution: dict
    top_suspicious: list
    accuracy_trend: list
    baseline_trend: list
    disclaimer: str
    reporting_channels: list

    def to_dict(self) -> dict:
        return asdict(self)


def compute_aggregate_report(game_ids: list, side: str = "opponent") -> AggregateReport:
    """Roll up per-game cheat reports. Uses cached DB reports; computes and caches for any missing."""
    _empty = AggregateReport(
        game_count=0, overall_confidence="low", avg_fairness_score=0.0,
        score_distribution={"low": 0, "medium": 0, "high": 0},
        top_suspicious=[], accuracy_trend=[], baseline_trend=[],
        disclaimer=DISCLAIMER, reporting_channels=list(REPORTING_CHANNELS),
    )
    if not game_ids:
        return _empty

    cached = {r["game_id"]: r for r in database.list_cheat_reports_for_games(game_ids, side)}

    reports = []
    for game_id in game_ids:
        if game_id in cached:
            reports.append({"game_id": game_id, **cached[game_id]})
            continue

        game = database.get_game(game_id)
        if not game:
            continue

        all_moves = game.get("moves") or []
        white_moves = [m for m in all_moves if (m.get("ply") or 0) % 2 == 1]
        black_moves = [m for m in all_moves if (m.get("ply") or 0) % 2 == 0]
        target_moves = black_moves if side == "opponent" else white_moves
        comp_moves = white_moves if side == "opponent" else black_moves

        meta = game.get("metadata", {})
        elo_field = "blackElo" if side == "opponent" else "whiteElo"
        try:
            player_rating = int(meta.get(elo_field) or 0) or None
        except (ValueError, TypeError):
            player_rating = None

        report = compute_cheat_report(
            analysis=target_moves,
            side=side,
            player_moves=comp_moves,
            player_rating=player_rating,
        )
        rd = report.to_dict()
        rd["game_id"] = game_id
        database.upsert_cheat_report(game_id, side, rd, player_rating)
        reports.append(rd)

    if not reports:
        return _empty

    scores = [r.get("fairness_score", 0.0) for r in reports]
    avg_score = round(sum(scores) / len(scores), 3)

    distribution = {"low": 0, "medium": 0, "high": 0}
    for r in reports:
        c = r.get("confidence", "low")
        distribution[c] = distribution.get(c, 0) + 1

    if avg_score >= 0.6:
        overall_confidence = "high"
    elif avg_score >= 0.3:
        overall_confidence = "medium"
    else:
        overall_confidence = "low"

    top_suspicious = sorted(
        [
            {
                "game_id": r["game_id"],
                "fairness_score": r.get("fairness_score", 0.0),
                "confidence": r.get("confidence", "low"),
                "summary": r.get("summary", ""),
            }
            for r in reports
        ],
        key=lambda x: x["fairness_score"],
        reverse=True,
    )[:5]

    accuracy_trend = []
    for r in reports:
        hist = r.get("accuracy_history") or []
        accuracy_trend.append(round(sum(hist) / len(hist), 1) if hist else 0.0)

    baseline_trend = [
        {
            "game_id": r["game_id"],
            "cpl_zscore": (r.get("baseline") or {}).get("cpl_zscore", 0.0),
            "over_performance": (r.get("baseline") or {}).get("over_performance", False),
        }
        for r in reports
    ]

    return AggregateReport(
        game_count=len(reports),
        overall_confidence=overall_confidence,
        avg_fairness_score=avg_score,
        score_distribution=distribution,
        top_suspicious=top_suspicious,
        accuracy_trend=accuracy_trend,
        baseline_trend=baseline_trend,
        disclaimer=DISCLAIMER,
        reporting_channels=list(REPORTING_CHANNELS),
    )
