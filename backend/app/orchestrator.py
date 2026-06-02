import asyncio
import contextlib
from typing import AsyncIterator

from app.pipeline import EvaluateFn, GenerateFn, TopicParams, run_topic


async def run_batch(
    *,
    topics: list[str],
    params: TopicParams,
    generate: GenerateFn,
    evaluate: EvaluateFn,
) -> AsyncIterator[tuple[str, dict]]:
    queue: asyncio.Queue = asyncio.Queue()

    async def _runner(topic: str) -> None:
        await run_topic(
            topic=topic,
            params=params,
            queue=queue,
            generate=generate,
            evaluate=evaluate,
        )

    tasks = [asyncio.create_task(_runner(t)) for t in topics]
    gathered = asyncio.gather(*tasks)

    while True:
        get_task = asyncio.create_task(queue.get())
        done, _ = await asyncio.wait(
            {get_task, gathered}, return_when=asyncio.FIRST_COMPLETED
        )
        if get_task in done:
            yield get_task.result()
        elif gathered in done and queue.empty():
            get_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await get_task
            break

    await gathered

    yield ("complete", {})
