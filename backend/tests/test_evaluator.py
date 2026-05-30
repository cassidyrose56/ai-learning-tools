import json
from unittest.mock import AsyncMock, MagicMock
import pytest

from app import evaluator as eval_mod
from app.config import get_settings
from app.evaluator import (
    evaluate_grade_level,
    _band_for_grade,
    _load_prompts,
)


@pytest.fixture(autouse=True)
def reset_caches():
    eval_mod._load_prompts.cache_clear()
    get_settings.cache_clear()
    yield
    eval_mod._load_prompts.cache_clear()
    get_settings.cache_clear()


def _ai_message(payload: dict | str):
    msg = MagicMock()
    msg.content = json.dumps(payload) if isinstance(payload, dict) else payload
    return msg


def _mock_llm(responses):
    llm = MagicMock()
    llm.ainvoke = AsyncMock(side_effect=responses)
    return llm


@pytest.mark.parametrize(
    "grade,band",
    [("K", "K-1"), ("1", "K-1"), ("2", "2-3"), ("3", "2-3"), ("4", "4-5"), ("5", "4-5")],
)
def test_band_for_grade(grade, band):
    assert _band_for_grade(grade) == band


def test_load_prompts_reads_v1_snapshot():
    system, user = _load_prompts("v1")
    assert "grade level appropriateness" in system.lower()
    assert user.strip()  # non-empty


async def test_parses_appropriate_band_response(monkeypatch):
    payload = {
        "reasoning": "...",
        "grade": "2-3",
        "alternative_grade": "K-1",
        "scaffolding_needed": "Pre-teach 'soccer'.",
    }
    monkeypatch.setattr(eval_mod, "_llm", lambda: _mock_llm([_ai_message(payload)]))

    result = await evaluate_grade_level("Some story.", "3")
    assert result.appropriate is True
    assert result.predicted_grade == "2-3"
    assert "K-1" in result.feedback
    assert "Pre-teach" in result.feedback


async def test_parses_mismatch_response(monkeypatch):
    payload = {
        "reasoning": "Sentences too long.",
        "grade": "4-5",
        "alternative_grade": "2-3",
        "scaffolding_needed": "Chunk into shorter sentences.",
    }
    monkeypatch.setattr(eval_mod, "_llm", lambda: _mock_llm([_ai_message(payload)]))

    result = await evaluate_grade_level("Some story.", "3")
    assert result.appropriate is False
    assert result.predicted_grade == "4-5"
    assert "Chunk into shorter sentences" in result.feedback
    assert "Sentences too long" in result.feedback


async def test_retries_three_times_then_gives_up(monkeypatch):
    llm = MagicMock()
    llm.ainvoke = AsyncMock(side_effect=RuntimeError("boom"))
    monkeypatch.setattr(eval_mod, "_llm", lambda: llm)
    sleeps: list[float] = []

    async def fake_sleep(s):
        sleeps.append(s)

    monkeypatch.setattr(eval_mod.asyncio, "sleep", fake_sleep)

    result = await evaluate_grade_level("Some story.", "3")
    assert result.appropriate is False
    assert result.predicted_grade is None
    assert result.feedback == "evaluator unavailable"
    assert llm.ainvoke.await_count == 3
    assert sleeps == [0.5, 1.0]


async def test_malformed_json_treated_as_transient(monkeypatch):
    good = {
        "reasoning": "ok",
        "grade": "2-3",
        "alternative_grade": "K-1",
        "scaffolding_needed": "",
    }
    monkeypatch.setattr(
        eval_mod,
        "_llm",
        lambda: _mock_llm([_ai_message("not json"), _ai_message(good)]),
    )
    monkeypatch.setattr(eval_mod.asyncio, "sleep", AsyncMock())

    result = await evaluate_grade_level("Some story.", "3")
    assert result.appropriate is True


async def test_prompt_version_selectable(monkeypatch, tmp_path):
    # Drop a fake v2 snapshot under a temp prompt root and point the loader at it.
    v2 = tmp_path / "grade-level" / "v2"
    v2.mkdir(parents=True)
    (v2 / "system.txt").write_text("fake v2 system")
    (v2 / "user.txt").write_text("fake v2 user with {text}")
    monkeypatch.setattr(eval_mod, "_PROMPT_ROOT", tmp_path)
    eval_mod._load_prompts.cache_clear()

    monkeypatch.setattr(eval_mod, "_active_version", lambda: "v2")
    payload = {
        "reasoning": "x", "grade": "2-3", "alternative_grade": "K-1", "scaffolding_needed": "",
    }
    captured: list = []

    async def capture_invoke(messages):
        captured.append(messages)
        return _ai_message(payload)

    llm = MagicMock()
    llm.ainvoke = AsyncMock(side_effect=capture_invoke)
    monkeypatch.setattr(eval_mod, "_llm", lambda: llm)

    await evaluate_grade_level("hello", "3")
    # The fake v2 system prompt should have been used
    sent = "".join(getattr(m, "content", "") for m in captured[0])
    assert "fake v2 system" in sent
