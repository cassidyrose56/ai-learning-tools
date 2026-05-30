import json
import re
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import app.main as main_mod
from app.main import app
from app.schemas import EvalResult


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(
        main_mod,
        "generate_story",
        AsyncMock(return_value="The story body."),
    )
    monkeypatch.setattr(
        main_mod,
        "evaluate_grade_level",
        AsyncMock(
            return_value=EvalResult(
                appropriate=True, predicted_grade="3", feedback="on level"
            )
        ),
    )
    return TestClient(app)


def parse_sse(body: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    for chunk in re.split(r"\n\n+", body.strip()):
        if not chunk.strip():
            continue
        lines = chunk.splitlines()
        ev = next((line[7:] for line in lines if line.startswith("event: ")), None)
        data = next((line[6:] for line in lines if line.startswith("data: ")), "{}")
        if ev:
            events.append((ev, json.loads(data)))
    return events


def test_presets_returns_catalog(client):
    response = client.get("/api/presets")
    assert response.status_code == 200
    body = response.json()
    assert "Sports" in body
    assert "Soccer" in body["Sports"]


def test_generate_emits_full_event_sequence(client):
    body = {
        "child_name": "Maya",
        "reading_level": "3",
        "genre": "fiction",
        "pages": 1,
        "include_drawing_box": True,
        "topics": ["Soccer", "Dinosaurs"],
    }
    with client.stream("POST", "/api/generate", json=body) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        raw = "".join(r.iter_text())

    events = parse_sse(raw)
    kinds = [k for k, _ in events]
    assert kinds.count("started") == 2
    assert kinds.count("done") == 2
    assert kinds[-1] == "complete"


def test_generate_validates_input(client):
    response = client.post(
        "/api/generate",
        json={
            "child_name": "",
            "reading_level": "3",
            "genre": "fiction",
            "pages": 1,
            "topics": ["Soccer"],
        },
    )
    assert response.status_code == 422
