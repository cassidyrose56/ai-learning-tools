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


from app.export import split_into_pages


def test_split_into_pages_returns_exact_chunk_count():
    text = "One two three. Four five. Six seven eight. Nine ten. Eleven twelve."
    chunks = split_into_pages(text, 3)
    assert len(chunks) == 3


def test_split_into_pages_never_breaks_mid_sentence():
    text = "Sentence one. Sentence two? Sentence three! Sentence four."
    chunks = split_into_pages(text, 2)
    for chunk in chunks:
        # each chunk must end with terminal punctuation
        assert chunk.rstrip()[-1] in ".!?"


def test_split_into_pages_groups_consecutive_sentences():
    text = " ".join(f"Sentence {i}." for i in range(1, 11))
    chunks = split_into_pages(text, 3)
    # concatenating chunks reconstructs the sentence sequence
    rejoined = " ".join(c.strip() for c in chunks)
    assert "Sentence 1." in rejoined
    assert "Sentence 10." in rejoined
    # chunks ordered
    indices = [int(re.search(r"Sentence (\d+)", c).group(1)) for c in chunks]
    assert indices == sorted(indices)


def test_split_into_pages_balanced_lengths():
    text = " ".join(f"Word{i} word{i}." for i in range(50))
    chunks = split_into_pages(text, 4)
    lens = [len(c.split()) for c in chunks]
    # roughly balanced — no chunk more than 2x the smallest
    assert max(lens) <= 2 * max(min(lens), 1)


def test_split_into_pages_handles_fewer_sentences_than_pages():
    text = "Only one sentence."
    chunks = split_into_pages(text, 3)
    assert len(chunks) == 3
    # first chunk has the content; rest may be empty
    assert chunks[0].strip().endswith(".")


from pypdf import PdfReader

from app.export import render_pdf
from app.pedagogy import FONT_SIZES, LINE_SPACING


def test_pdf_has_correct_page_count():
    story = make_story(pages=3)
    blob = render_pdf(story)
    reader = PdfReader(io.BytesIO(blob))
    assert len(reader.pages) == 3


def test_pdf_begins_with_pdf_signature():
    blob = render_pdf(make_story())
    assert blob[:4] == b"%PDF"
    assert len(blob) > 500


def test_pdf_draws_box_when_enabled(monkeypatch):
    # spy on canvas.rect calls
    rect_calls: list[tuple] = []
    from reportlab.pdfgen import canvas as canvas_mod

    real_rect = canvas_mod.Canvas.rect

    def spy_rect(self, *args, **kwargs):
        rect_calls.append((args, kwargs))
        return real_rect(self, *args, **kwargs)

    monkeypatch.setattr(canvas_mod.Canvas, "rect", spy_rect)

    render_pdf(make_story(pages=2, include_drawing_box=True))
    box_with_box = len(rect_calls)
    rect_calls.clear()

    render_pdf(make_story(pages=2, include_drawing_box=False))
    box_without_box = len(rect_calls)

    assert box_with_box >= 2  # at least one rect per page
    assert box_without_box == 0


def test_pdf_font_size_per_reading_level():
    assert FONT_SIZES == {"K": 24, "1": 20, "2": 18, "3": 16, "4": 14, "5": 14}


def test_pdf_line_spacing_per_reading_level():
    assert LINE_SPACING == {
        "K": 1.6, "1": 1.5, "2": 1.4, "3": 1.35, "4": 1.3, "5": 1.3,
    }


def test_pdf_uses_per_grade_leading(monkeypatch):
    # render the same long text at K vs grade 5; K's larger leading should
    # fit fewer lines per page, producing a smaller cursor_y per drawString.
    from reportlab.pdfgen import canvas as canvas_mod

    y_positions: list[float] = []
    real_draw = canvas_mod.Canvas.drawString

    def spy_draw(self, x, y, text, *args, **kwargs):
        y_positions.append(y)
        return real_draw(self, x, y, text, *args, **kwargs)

    monkeypatch.setattr(canvas_mod.Canvas, "drawString", spy_draw)

    long_text = " ".join(f"word{i}." for i in range(200))

    render_pdf(make_story(reading_level="K", pages=1, text=long_text))
    k_gaps = [y_positions[i] - y_positions[i + 1] for i in range(len(y_positions) - 1)]
    k_leading = max(k_gaps)  # title-to-body jump is larger; ignore via max-of-body
    y_positions.clear()

    render_pdf(make_story(reading_level="5", pages=1, text=long_text))
    g5_gaps = [y_positions[i] - y_positions[i + 1] for i in range(len(y_positions) - 1)]
    g5_leading = max(g5_gaps)

    # K leading = 24 * 1.6 = 38.4; grade-5 leading = 14 * 1.3 = 18.2.
    # Even after picking the max-gap (which includes the title->body jump
    # in both cases), K's body leading must dominate grade 5's.
    assert k_leading > g5_leading


from app.export import render_bundle


def test_bundle_zip_contains_one_file_per_story():
    stories = [make_story(topic="Soccer"), make_story(topic="The Moon")]
    blob = render_bundle(stories, fmt="docx")
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        names = sorted(zf.namelist())
    assert names == ["Maya_Soccer.docx", "Maya_The_Moon.docx"]


def test_bundle_pdf_zip_files_are_pdfs():
    stories = [make_story(topic="Soccer", text="One. Two.")]
    blob = render_bundle(stories, fmt="pdf")
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        with zf.open("Maya_Soccer.pdf") as f:
            assert f.read(4) == b"%PDF"
