# Expected CPL and accuracy by Elo band, seeded from Lichess aggregate stats.
# Bands are lower-bound inclusive: a 1450-rated player uses the 1400 entry.

from typing import Optional

_BASELINES = [
    # (min_elo, expected_cpl, expected_accuracy, cpl_stddev)
    (2600, 4,   98.5, 8),
    (2400, 7,   97.5, 10),
    (2200, 12,  96.0, 12),
    (2000, 18,  94.0, 15),
    (1800, 28,  91.0, 18),
    (1600, 40,  87.0, 22),
    (1400, 55,  83.0, 25),
    (1200, 75,  78.0, 30),
    (1000, 95,  72.0, 35),
    (0,    120, 65.0, 40),
]


def expected_for_rating(elo: int) -> dict:
    for min_elo, exp_cpl, exp_acc, stddev in _BASELINES:
        if elo >= min_elo:
            return {
                "elo": elo,
                "expected_cpl": exp_cpl,
                "expected_accuracy": exp_acc,
                "cpl_stddev": stddev,
            }
    return {"elo": elo, "expected_cpl": 120, "expected_accuracy": 65.0, "cpl_stddev": 40}


def baseline_delta(observed_cpl: float, observed_accuracy: float, elo: int) -> dict:
    b = expected_for_rating(elo)
    cpl_zscore = (b["expected_cpl"] - observed_cpl) / b["cpl_stddev"] if b["cpl_stddev"] else 0.0
    accuracy_delta = observed_accuracy - b["expected_accuracy"]
    return {
        "expected_cpl": b["expected_cpl"],
        "expected_accuracy": b["expected_accuracy"],
        "observed_cpl": round(observed_cpl, 1),
        "observed_accuracy": round(observed_accuracy, 1),
        "cpl_zscore": round(cpl_zscore, 2),
        "accuracy_delta": round(accuracy_delta, 1),
        "over_performance": cpl_zscore > 1.5 or accuracy_delta > 8,
    }
