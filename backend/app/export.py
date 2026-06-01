import io
import re
import zipfile
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
    doc.add_heading(f'For {story.child_name}: "{story.topic}"', level=1)
    for para in [p.strip() for p in story.text.split("\n\n") if p.strip()]:
        doc.add_paragraph(para)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


_SENTENCE_RE = re.compile(r"[^.!?]+[.!?]+(?:\s|$)")


def _tokenize_sentences(text: str) -> list[tuple[str, int]]:
    """Return [(sentence, paragraph_index), ...] preserving paragraph
    boundaries from the input's `\n\n` separators.
    """
    out: list[tuple[str, int]] = []
    for p_idx, para in enumerate(text.split("\n\n")):
        for s in _SENTENCE_RE.findall(para):
            s = s.strip()
            if s:
                out.append((s, p_idx))
    return out


def _join_sentences(items: list[tuple[str, int]]) -> str:
    """Join sentences with " " inside a paragraph and "\n\n" across
    paragraph boundaries, preserving the input paragraph structure.
    """
    if not items:
        return ""
    parts: list[str] = [items[0][0]]
    for prev, cur in zip(items, items[1:]):
        sep = " " if cur[1] == prev[1] else "\n\n"
        parts.append(sep + cur[0])
    return "".join(parts)


def split_into_pages(text: str, n: int) -> list[str]:
    if n <= 0:
        raise ValueError("n must be >= 1")
    sentences = _tokenize_sentences(text)
    if not sentences:
        return [""] * n
    if len(sentences) <= n:
        chunks = [_join_sentences([s]) for s in sentences]
        while len(chunks) < n:
            chunks.append("")
        return chunks

    total_words = sum(len(s[0].split()) for s in sentences)
    target = total_words / n
    chunks: list[str] = []
    current: list[tuple[str, int]] = []
    current_words = 0
    remaining_pages = n

    for i, item in enumerate(sentences):
        sent, _ = item
        words = len(sent.split())
        sentences_left = len(sentences) - i
        # ensure each remaining page gets at least one sentence
        if sentences_left <= remaining_pages - len(chunks) - 1 and current:
            chunks.append(_join_sentences(current))
            current = [item]
            current_words = words
            continue
        if current and current_words + words > target and len(chunks) < n - 1:
            chunks.append(_join_sentences(current))
            current = [item]
            current_words = words
        else:
            current.append(item)
            current_words += words

    if current:
        chunks.append(_join_sentences(current))
    while len(chunks) < n:
        chunks.append("")
    return chunks[:n]


_MARGIN = 0.75 * inch
_BOX_FRACTION = 0.45  # drawing box occupies top 45% of page
_BOX_GAP_LEADING = 1.5


def render_pdf(story: StoryInput) -> bytes:
    buf = io.BytesIO()
    width, height = LETTER
    c = _canvas.Canvas(buf, pagesize=LETTER)
    font_size = FONT_SIZES[story.reading_level]
    leading = font_size * LINE_SPACING[story.reading_level]

    chunks = split_into_pages(story.text, story.pages)
    title = f'For {story.child_name}: "{story.topic}"'

    for idx, chunk in enumerate(chunks):
        c.setFont("Helvetica-Bold", font_size)
        c.drawString(_MARGIN, height - _MARGIN, title)
        text_top = height - _MARGIN - (font_size * 2)

        if story.include_drawing_box:
            box_top = text_top
            box_bottom = box_top - (height - 2 * _MARGIN) * _BOX_FRACTION
            box_height = box_top - box_bottom
            c.rect(_MARGIN, box_bottom, width - 2 * _MARGIN, box_height, stroke=1, fill=0)
            text_top = box_bottom - leading * _BOX_GAP_LEADING

        c.setFont("Helvetica", font_size)
        _draw_paragraphs(c, chunk, _MARGIN, text_top, width - 2 * _MARGIN, leading)

        if idx < len(chunks) - 1:
            c.showPage()

    c.showPage()  # close final page
    c.save()
    return buf.getvalue()


def _draw_wrapped(c, text: str, x: float, y: float, max_width: float, leading: float) -> float:
    from reportlab.pdfbase.pdfmetrics import stringWidth

    font_name = "Helvetica"
    font_size = c._fontsize
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
        cursor_y -= leading
    return cursor_y


def _draw_paragraphs(
    c, text: str, x: float, y: float, max_width: float, leading: float
) -> float:
    """Wrap each `\n\n`-separated paragraph in `text` independently,
    leaving a `leading * 0.7` vertical gap between paragraphs.
    Returns the y-coordinate after the last line drawn.
    """
    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    cursor_y = y
    for i, para in enumerate(paragraphs):
        cursor_y = _draw_wrapped(c, para, x, cursor_y, max_width, leading)
        if i < len(paragraphs) - 1:
            cursor_y -= leading * 0.7
    return cursor_y


def render_bundle(stories: list[StoryInput], *, fmt: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for s in stories:
            base = safe_filename(s.child_name, s.topic)
            if fmt == "docx":
                zf.writestr(f"{base}.docx", render_docx(s))
            elif fmt == "pdf":
                zf.writestr(f"{base}.pdf", render_pdf(s))
            else:
                raise ValueError(f"unknown format {fmt!r}")
    return buf.getvalue()
