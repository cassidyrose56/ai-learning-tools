import asyncio
import uuid
from dataclasses import dataclass
from typing import Awaitable, Callable

from app.config import MAX_RETRIES
from app.evaluator import EVALUATOR_UNAVAILABLE_FEEDBACK
from app.pedagogy import WORDS_PER_PAGE
from app.schemas import EvalResult

GenerateFn = Callable[..., Awaitable[str]]
EvaluateFn = Callable[[str, str], Awaitable[EvalResult]]


@dataclass
class TopicParams:
    child_name: str
    reading_level: str
    genre: str
    pages: int
    include_drawing_box: bool


async def run_topic(
    *,
    topic: str,
    params: TopicParams,
    queue: asyncio.Queue,
    generate: GenerateFn,
    evaluate: EvaluateFn,
    story_id: str | None = None,
) -> None:
    sid = story_id or str(uuid.uuid4())
    await queue.put(("started", {"story_id": sid, "topic": topic}))

    wpp = WORDS_PER_PAGE[(params.reading_level, params.include_drawing_box)]
    target_words = params.pages * wpp

    feedback: str | None = None
    last_text = ""
    last_predicted: str | None = None
    attempt = 0
    appropriate = False

    for attempt in range(1, MAX_RETRIES + 1):
        await queue.put(("attempt", {"story_id": sid, "attempt": attempt}))
        try:
            last_text = await generate(
                topic=topic,
                reading_level=params.reading_level,
                target_words=target_words,
                genre=params.genre,
                child_name=params.child_name,
                feedback=feedback,
            )
        except Exception as exc:  # noqa: BLE001
            # one immediate retry per spec
            try:
                last_text = await generate(
                    topic=topic,
                    reading_level=params.reading_level,
                    target_words=target_words,
                    genre=params.genre,
                    child_name=params.child_name,
                    feedback=feedback,
                )
            except Exception as exc2:  # noqa: BLE001
                await queue.put(
                    ("error", {"story_id": sid, "message": str(exc2)})
                )
                return

        result = await evaluate(last_text, params.reading_level)
        last_predicted = result.predicted_grade
        if result.appropriate:
            appropriate = True
            break
        if result.feedback == EVALUATOR_UNAVAILABLE_FEEDBACK:
            break
        feedback = result.feedback

    await queue.put(
        (
            "done",
            {
                "story_id": sid,
                "text": last_text,
                "predicted_grade": last_predicted,
                "appropriate": appropriate,
                "attempts": attempt,
            },
        )
    )
