import httpx


def fetch_chesscom_status(username: str) -> dict:
    url = f"https://api.chess.com/pub/player/{username}"
    try:
        r = httpx.get(url, timeout=5.0, headers={"User-Agent": "chess-analyzer/1.0"})
        if r.status_code == 404:
            return _result("chesscom", username, "unknown", {})
        r.raise_for_status()
        data = r.json()
        status = data.get("status", "")
        if status == "closed:fair_play_violations":
            account_status = "closed_fair_play"
        elif status and status.startswith("closed"):
            account_status = "closed_other"
        else:
            account_status = "active"
        return _result("chesscom", username, account_status, data)
    except Exception:
        return _result("chesscom", username, "unknown", {})


def fetch_lichess_status(username: str) -> dict:
    url = f"https://lichess.org/api/user/{username}"
    try:
        r = httpx.get(url, timeout=5.0, headers={"Accept": "application/json"})
        if r.status_code == 404:
            return _result("lichess", username, "unknown", {})
        r.raise_for_status()
        data = r.json()
        if data.get("tosViolation") or data.get("closed"):
            account_status = "closed_fair_play"
        elif data.get("disabled"):
            account_status = "closed_other"
        else:
            account_status = "active"
        return _result("lichess", username, account_status, data)
    except Exception:
        return _result("lichess", username, "unknown", {})


def _result(platform: str, username: str, account_status: str, raw: dict) -> dict:
    return {
        "platform": platform,
        "username": username,
        "account_status": account_status,
        "raw": raw,
    }
