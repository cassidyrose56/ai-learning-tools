import io
import re
from dataclasses import dataclass

from docx import Document
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas as _canvas

from app.pedagogy import FONT_SIZES, LINE_SPACING


@dataclass
class StoryInput:
    child_name: str
    topic: str
    genre: str
    text: str
    reading_level: str
    pages: int
    include_drawing_box: bool


_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


def safe_filename(child_name: str, topic: str) -> str:
    def clean(s: str) -> str:
        s = _UNSAFE.sub("_", s).strip("._-")
        return s or "story"
    return f"{clean(child_name)}_{clean(topic)}"


def render_docx(story: StoryInput) -> bytes:
    doc = Document()
    doc.add_heading(f'For {story.child_name} — "{story.topic}"', level=1)
    for para in [p.strip() for p in story.text.split("\n\n") if p.strip()]:
        doc.add_paragraph(para)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


_SENTENCE_RE = re.compile(r"[^.!?]+[.!?]+(?:\s|$)")


def split_into_pages(text: str, n: int) -> list[str]:
    if n <= 0:
        raise ValueError("n must be >= 1")
    sentences = [s.strip() for s in _SENTENCE_RE.findall(text) if s.strip()]
    if not sentences:
        return [""] * n
    if len(sentences) <= n:
        chunks = [s for s in sentences]
        while len(chunks) < n:
            chunks.append("")
        return chunks

    total_words = sum(len(s.split()) for s in sentences)
    target = total_words / n
    chunks: list[str] = []
    current: list[str] = []
    current_words = 0
    remaining_pages = n

    for i, sent in enumerate(sentences):
        words = len(sent.split())
        sentences_left = len(sentences) - i
        # ensure each remaining page gets at least one sentence
        if sentences_left <= remaining_pages - len(chunks) - 1 and current:
            chunks.append(" ".join(current))
            current = [sent]
            current_words = words
            continue
        if current and current_words + words > target and len(chunks) < n - 1:
            chunks.append(" ".join(current))
            current = [sent]
            current_words = words
        else:
            current.append(sent)
            current_words += words

    if current:
        chunks.append(" ".join(current))
    while len(chunks) < n:
        chunks.append("")
    return chunks[:n]


_MARGIN = 0.75 * inch
_BOX_FRACTION = 0.45  # drawing box occupies top 45% of page


def render_pdf(story: StoryInput) -> bytes:
    buf = io.BytesIO()
    width, height = LETTER
    c = _canvas.Canvas(buf, pagesize=LETTER)
    font_size = FONT_SIZES[story.reading_level]
    leading = font_size * LINE_SPACING[story.reading_level]

    chunks = split_into_pages(story.text, story.pages)
    title = f'For {story.child_name} — "{story.topic}"'

    for idx, chunk in enumerate(chunks):
        c.setFont("Helvetica-Bold", font_size)
        c.drawString(_MARGIN, height - _MARGIN, title)
        text_top = height - _MARGIN - (font_size * 2)

        if story.include_drawing_box:
            box_top = text_top
            box_bottom = box_top - (height - 2 * _MARGIN) * _BOX_FRACTION
            box_height = box_top - box_bottom
            c.rect(_MARGIN, box_bottom, width - 2 * _MARGIN, box_height, stroke=1, fill=0)
            text_top = box_bottom - font_size

        c.setFont("Helvetica", font_size)
        _draw_wrapped(c, chunk, _MARGIN, text_top, width - 2 * _MARGIN, leading)

        if idx < len(chunks) - 1:
            c.showPage()

    c.showPage()  # close final page
    c.save()
    return buf.getvalue()


def _draw_wrapped(c, text: str, x: float, y: float, max_width: float, leading: float) -> None:
    from reportlab.pdfbase.pdfmetrics import stringWidth

    font_name = "Helvetica"
    font_size = c._fontsize  # current font size
    words = text.split()
    line: list[str] = []
    cursor_y = y

    def width_of(w: list[str]) -> float:
        return stringWidth(" ".join(w), font_name, font_size)

    for w in words:
        line.append(w)
        if width_of(line) > max_width:
            line.pop()
            if line:
                c.drawString(x, cursor_y, " ".join(line))
                cursor_y -= leading
            line = [w]
    if line:
        c.drawString(x, cursor_y, " ".join(line))
