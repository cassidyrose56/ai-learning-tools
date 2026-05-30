import io
import re
from dataclasses import dataclass

from docx import Document


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
