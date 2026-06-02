from functools import lru_cache
from pathlib import Path
from typing import Literal

from anthropic import AsyncAnthropic
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config import get_settings

Genre = Literal["fiction", "non-fiction"]

_TEMPLATE_DIR = Path(__file__).parent / "prompts"
_env = Environment(
    loader=FileSystemLoader(_TEMPLATE_DIR),
    autoescape=select_autoescape(disabled_extensions=("j2",), default=False),
    trim_blocks=True,
    lstrip_blocks=True,
)


def build_prompt(
    *,
    genre: Genre,
    topic: str,
    reading_level: str,
    target_words: int,
    child_name: str,
    feedback: str | None = None,
) -> str:
    template_name = "fiction.j2" if genre == "fiction" else "non_fiction.j2"
    tmpl = _env.get_template(template_name)
    return tmpl.render(
        topic=topic,
        reading_level=reading_level,
        target_words=target_words,
        child_name=child_name,
        feedback=feedback,
    )


@lru_cache
def _client() -> AsyncAnthropic:
    return AsyncAnthropic(api_key=get_settings().anthropic_api_key)


async def generate_story(
    *,
    topic: str,
    reading_level: str,
    target_words: int,
    genre: Genre,
    child_name: str,
    feedback: str | None = None,
) -> str:
    prompt = build_prompt(
        genre=genre,
        topic=topic,
        reading_level=reading_level,
        target_words=target_words,
        child_name=child_name,
        feedback=feedback,
    )
    client = _client()
    message = await client.messages.create(
        model=get_settings().claude_model,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(block.text for block in message.content)
