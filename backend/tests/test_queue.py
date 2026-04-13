"""Tests for /api/queue endpoints."""
import uuid
import pytest
from tests.conftest import SCHOLAR_MATE_PGN


def test_queue_empty_initially(client):
    resp = client.get("/api/queue")
    assert resp.status_code == 200
    assert resp.json() == []


def test_queue_add_job(client):
    payload = {
        "game_uuid": str(uuid.uuid4()),
        "title": "Queue Test Game",
        "pgn": SCHOLAR_MATE_PGN,
        "depth": "Fast",
    }
    resp = client.post("/api/queue", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "job_id" in data


def test_queue_list_after_add(client):
    payload = {
        "game_uuid": str(uuid.uuid4()),
        "title": "List Test",
        "pgn": SCHOLAR_MATE_PGN,
        "depth": "Fast",
    }
    client.post("/api/queue", json=payload)
    jobs = client.get("/api/queue").json()
    assert len(jobs) >= 1
    job = jobs[0]
    assert "job_id" in job
    assert "status" in job
    assert "title" in job


def test_queue_cancel_job(client):
    payload = {
        "game_uuid": str(uuid.uuid4()),
        "title": "Cancel Test",
        "pgn": SCHOLAR_MATE_PGN,
        "depth": "Fast",
    }
    job_id = client.post("/api/queue", json=payload).json()["job_id"]

    resp = client.delete(f"/api/queue/{job_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

    # Job should be gone or marked cancelled
    jobs = client.get("/api/queue").json()
    remaining = [j for j in jobs if j["job_id"] == job_id and j["status"] not in ("cancelled", "done")]
    assert remaining == []


def test_queue_cancel_nonexistent(client):
    resp = client.delete("/api/queue/nonexistent-job-id")
    assert resp.status_code in (200, 404)  # either graceful or 404


def test_queue_multiple_jobs(client):
    for i in range(3):
        payload = {
            "game_uuid": str(uuid.uuid4()),
            "title": f"Bulk Job {i}",
            "pgn": SCHOLAR_MATE_PGN,
            "depth": "Fast",
        }
        client.post("/api/queue", json=payload)

    jobs = client.get("/api/queue").json()
    assert len(jobs) >= 3
