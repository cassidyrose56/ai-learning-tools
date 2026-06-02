from unittest.mock import AsyncMock, MagicMock
import pytest

from app import generator as gen_mod
from app.generator import generate_story, build_prompt


def test_fiction_prompt_contains_child_name():
    prompt = build_prompt(
        genre="fiction",
        topic="Soccer",
        reading_level="3",
        target_words=200,
        child_name="Maya",
    )
    assert "Maya" in prompt
    assert "Soccer" in prompt
    assert "200" in prompt


def test_non_fiction_prompt_excludes_child_name():
    prompt = build_prompt(
        genre="non-fiction",
        topic="Sharks",
        reading_level="2",
        target_words=140,
        child_name="Maya",
    )
    assert "Maya" not in prompt
    assert "Sharks" in prompt


def test_feedback_appears_in_revision_prompt():
    prompt = build_prompt(
        genre="fiction",
        topic="Soccer",
        reading_level="3",
        target_words=200,
        child_name="Maya",
        feedback="Sentences are too long for grade 3.",
    )
    assert "Sentences are too long" in prompt


def test_target_words_box_on_vs_off():
    from app.pedagogy import WORDS_PER_PAGE

    assert WORDS_PER_PAGE[("3", True)] == 100
    assert WORDS_PER_PAGE[("3", False)] == 200
    on_prompt = build_prompt(
        genre="fiction",
        topic="Soccer",
        reading_level="3",
        target_words=2 * WORDS_PER_PAGE[("3", True)],
        child_name="Maya",
    )
    off_prompt = build_prompt(
        genre="fiction",
        topic="Soccer",
        reading_level="3",
        target_words=2 * WORDS_PER_PAGE[("3", False)],
        child_name="Maya",
    )
    assert "200" in on_prompt
    assert "400" in off_prompt


async def test_generate_story_calls_anthropic(monkeypatch):
    fake_message = MagicMock()
    fake_message.content = [MagicMock(text="The story body.")]
    fake_client = MagicMock()
    fake_client.messages.create = AsyncMock(return_value=fake_message)
    monkeypatch.setattr(gen_mod, "_client", lambda: fake_client)

    text = await generate_story(
        topic="Soccer",
        reading_level="3",
        target_words=200,
        genre="fiction",
        child_name="Maya",
    )
    assert text == "The story body."
    assert fake_client.messages.create.await_count == 1
    call = fake_client.messages.create.await_args.kwargs
    assert call["model"] == "claude-sonnet-4-6"
    assert "Maya" in call["messages"][0]["content"]
