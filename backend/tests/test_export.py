import io
import re
import zipfile

import pytest
from docx import Document

from app.export import (
    render_docx,
    safe_filename,
    StoryInput,
)


def make_story(**over):
    base = dict(
        child_name="Maya",
        topic="Soccer",
        genre="fiction",
        text="Once upon a time. The end.",
        reading_level="3",
        pages=2,
        include_drawing_box=False,
    )
    base.update(over)
    return StoryInput(**base)


def test_docx_contains_title_and_body():
    blob = render_docx(make_story())
    doc = Document(io.BytesIO(blob))
    paragraphs = [p.text for p in doc.paragraphs if p.text]
    assert any("For Maya" in p and "Soccer" in p for p in paragraphs)
    assert any("Once upon a time" in p for p in paragraphs)


def test_docx_ignores_layout_fields_without_error():
    # include_drawing_box=True must not affect docx output
    blob = render_docx(make_story(include_drawing_box=True))
    Document(io.BytesIO(blob))  # parses without error


def test_safe_filename_replaces_unsafe_chars():
    assert safe_filename("Maya", "The Moon") == "Maya_The_Moon"
    assert safe_filename("Ma ya", "Soccer/Football") == "Ma_ya_Soccer_Football"
    assert safe_filename("Maya", "..hi..") == "Maya_hi"


def test_safe_filename_never_empty():
    assert safe_filename("", "") == "story_story"
