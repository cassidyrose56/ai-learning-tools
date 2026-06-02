import asyncio
from collections import Counter
from unittest.mock import AsyncMock

from app.orchestrator import run_batch
from app.pipeline import TopicParams
from app.schemas import EvalResult


async def test_run_batch_streams_events_for_all_topics(monkeypatch):
    gen = AsyncMock(return_value="story")
    eva = AsyncMock(
        return_value=EvalResult(appropriate=True, predicted_grade="3", feedback="ok")
    )
    params = TopicParams(
        child_name="Maya",
        reading_level="3",
        genre="fiction",
        pages=1,
        include_drawing_box=False,
    )

    events: list[tuple[str, dict]] = []
    async for ev in run_batch(
        topics=["Soccer", "Dinosaurs", "The Moon"],
        params=params,
        generate=gen,
        evaluate=eva,
    ):
        events.append(ev)

    kinds = Counter(k for k, _ in events)
    assert kinds["started"] == 3
    assert kinds["attempt"] == 3
    assert kinds["done"] == 3
    assert kinds["complete"] == 1
    assert events[-1][0] == "complete"
