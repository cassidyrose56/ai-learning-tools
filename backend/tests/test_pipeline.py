import asyncio
from unittest.mock import AsyncMock
import pytest

from app.pipeline import run_topic, TopicParams
from app.schemas import EvalResult


def make_params(**over):
    base = dict(
        child_name="Maya",
        reading_level="3",
        genre="fiction",
        pages=2,
        include_drawing_box=True,
    )
    base.update(over)
    return TopicParams(**base)


async def _drain(queue: asyncio.Queue) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    while not queue.empty():
        events.append(await queue.get())
    return events


async def test_appropriate_on_first_attempt():
    gen = AsyncMock(return_value="story1")
    eva = AsyncMock(
        return_value=EvalResult(appropriate=True, predicted_grade="3", feedback="ok")
    )
    queue: asyncio.Queue = asyncio.Queue()

    await run_topic(
        topic="Soccer",
        params=make_params(),
        queue=queue,
        generate=gen,
        evaluate=eva,
    )

    events = await _drain(queue)
    kinds = [k for k, _ in events]
    assert kinds == ["started", "attempt", "done"]
    assert events[-1][1]["appropriate"] is True
    assert events[-1][1]["attempts"] == 1
    assert gen.await_count == 1


async def test_appropriate_after_two_mismatches():
    gen = AsyncMock(side_effect=["v1", "v2", "v3"])
    eva = AsyncMock(
        side_effect=[
            EvalResult(appropriate=False, predicted_grade="5", feedback="too hard"),
            EvalResult(appropriate=False, predicted_grade="4", feedback="still hard"),
            EvalResult(appropriate=True, predicted_grade="3", feedback="ok"),
        ]
    )
    queue: asyncio.Queue = asyncio.Queue()

    await run_topic(
        topic="Soccer",
        params=make_params(),
        queue=queue,
        generate=gen,
        evaluate=eva,
    )

    events = await _drain(queue)
    kinds = [k for k, _ in events]
    assert kinds == ["started", "attempt", "attempt", "attempt", "done"]
    assert events[-1][1]["appropriate"] is True
    assert events[-1][1]["attempts"] == 3
    # generator was called with feedback on attempts 2 and 3
    second_call = gen.await_args_list[1]
    assert second_call.kwargs["feedback"] == "too hard"
    third_call = gen.await_args_list[2]
    assert third_call.kwargs["feedback"] == "still hard"


async def test_capped_at_three_attempts_returns_last_text():
    gen = AsyncMock(side_effect=["v1", "v2", "v3"])
    eva = AsyncMock(
        return_value=EvalResult(
            appropriate=False, predicted_grade="5", feedback="too hard"
        )
    )
    queue: asyncio.Queue = asyncio.Queue()

    await run_topic(
        topic="Soccer",
        params=make_params(),
        queue=queue,
        generate=gen,
        evaluate=eva,
    )

    events = await _drain(queue)
    done = events[-1][1]
    assert done["appropriate"] is False
    assert done["attempts"] == 3
    assert done["text"] == "v3"
    assert gen.await_count == 3


async def test_evaluator_unavailable_short_circuits():
    gen = AsyncMock(side_effect=["v1", "v2", "v3"])
    eva = AsyncMock(
        return_value=EvalResult(
            appropriate=False, predicted_grade=None, feedback="evaluator unavailable"
        )
    )
    queue: asyncio.Queue = asyncio.Queue()

    await run_topic(
        topic="Soccer",
        params=make_params(),
        queue=queue,
        generate=gen,
        evaluate=eva,
    )

    events = await _drain(queue)
    done = events[-1][1]
    assert done["appropriate"] is False
    assert done["attempts"] == 1
    assert done["predicted_grade"] is None
    assert gen.await_count == 1  # did not burn more generations
