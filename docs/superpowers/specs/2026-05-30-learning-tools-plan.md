# AI Learning Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single-page web app that lets a K–5 teacher generate one Claude-written story per selected topic, grade-level-checked by a Gemini-based evaluator (using the Learning Commons grade-level rubric), and exportable as Word or PDF (single file or zip bundle).

**Architecture:** FastAPI backend with one SSE generation endpoint and three JSON/file endpoints (presets, export, bundle); Vite + React + TypeScript frontend that streams the SSE feed into per-topic story cards. The Learning Commons evaluator is consumed as a `vendor/evaluators` git submodule via a thin `evaluator.py` adapter. No persistence.

**Tech Stack:** Python 3.12, FastAPI, Anthropic SDK (`claude-sonnet-4-6`), `langchain-google-genai` (`gemini-2.5-pro` at temperature 0.25, mirroring the upstream notebook), Jinja2, python-docx, reportlab, pypdf (tests). Vite + React 18 + TypeScript, Vitest, @testing-library/react. uv for Python deps, npm for frontend deps. The grade-level rubric + procedure prompts are byte-identical snapshots of the upstream `learning-commons-org/evaluators` submodule, stored under `backend/app/evaluator_prompts/grade-level/v1/` so we can iterate on them (future `v2/`, etc.) without polluting the submodule.

---

## Phase-by-phase order

1. Repo scaffolding (submodule, `.env.example`, Makefile, README stub)
2. Backend project + config + schemas
3. Generator (Jinja2 prompts + Anthropic wrapper)
4. Evaluator adapter (versioned rubric load + Gemini call + band-to-grade mapping + transport retries)
5. Pipeline (per-topic generate+evaluate loop)
6. Orchestrator + presets + SSE `/api/generate`
7. DOCX export
8. PDF export (`split_into_pages` + reportlab layout)
9. Bundle export (zip) + filename sanitizer
10. Frontend scaffolding + shared types + SSE helper
11. `RequestForm`
12. `StoryList` + `StoryCard`
13. `PdfPreviewModal`
14. Wire-up, README, manual smoke test

---

## Phase 1 — Repository scaffolding

### Task 1.1: Add the evaluator git submodule

**Files:**
- Modify: `.gitmodules` (created by submodule command)
- Create: `vendor/evaluators/` (populated by submodule init)

- [ ] **Step 1: Add the submodule**

Run:

```bash
cd /Users/cassidycoombs/personal/ai-learning-tools
git submodule add https://github.com/learning-commons-org/evaluators vendor/evaluators
git submodule update --init --recursive
```

Expected: `vendor/evaluators/` populated; `.gitmodules` created with one entry pointing at the upstream URL.

- [ ] **Step 2: Verify rubric prompt path exists**

Run:

```bash
find vendor/evaluators/evals/prompts -type f | head
```

Expected: at least one prompt file under `vendor/evaluators/evals/prompts/`. If the path is different (upstream re-org), record the actual path here for Phase 4. Do not proceed to Phase 4 until this path is known.

- [ ] **Step 3: Commit the submodule**

```bash
git add .gitmodules vendor/evaluators
git commit -m "chore: add learning-commons evaluators as submodule at vendor/evaluators"
```

### Task 1.2: Top-level `.env.example` and Makefile

**Files:**
- Create: `.env.example`
- Create: `Makefile`

- [ ] **Step 1: Create `.env.example`**

```bash
# Used by the story generator (Claude)
ANTHROPIC_API_KEY=sk-ant-...

# Used by the grade-level evaluator (Gemini 2.5 Pro)
GOOGLE_API_KEY=...

# Not used in v1. Reserved for v2 — some additional Learning Commons
# evaluators (vocabulary, sentence structure, etc.) are calibrated on
# OpenAI models. See docs/v2-ideas.md.
OPENAI_API_KEY=sk-...
```

- [ ] **Step 2: Create `Makefile`**

```make
.PHONY: dev test lint backend-dev frontend-dev backend-test frontend-test

backend-dev:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

frontend-dev:
	cd frontend && npm run dev

dev:
	@echo "Run 'make backend-dev' and 'make frontend-dev' in two terminals."

backend-test:
	cd backend && uv run pytest -q

frontend-test:
	cd frontend && npm test -- --run

test: backend-test frontend-test

lint:
	cd backend && uv run ruff check app tests
```

- [ ] **Step 3: Commit**

```bash
git add .env.example Makefile
git commit -m "chore: add .env.example and Makefile"
```

### Task 1.3: README stub

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README skeleton**

```markdown
# AI Learning Tools

K–5 reading material generator. See
`docs/superpowers/specs/2026-05-30-learning-tools-design.md` for the design
spec.

## Setup

1. `git submodule update --init --recursive`
2. Copy `.env.example` → `.env` and fill in `ANTHROPIC_API_KEY` and `GOOGLE_API_KEY`. (`OPENAI_API_KEY` is reserved for v2 — leave the placeholder.)
3. Backend: `cd backend && uv sync`
4. Frontend: `cd frontend && npm install`

## Develop

- `make backend-dev` (http://localhost:8000)
- `make frontend-dev` (http://localhost:5173)

## Test

- `make test` runs backend + frontend test suites.

## Updating the evaluator rubric

```bash
git submodule update --remote vendor/evaluators
git add vendor/evaluators
git commit -m "chore: bump evaluators submodule"
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README scaffolding"
```

---

## Phase 2 — Backend project + config + schemas

### Task 2.1: Initialize the backend uv project

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`

- [ ] **Step 1: Initialize uv project**

```bash
cd backend
uv init --bare --python 3.12
uv add fastapi 'uvicorn[standard]' anthropic langchain-google-genai jinja2 httpx pydantic 'pydantic-settings' python-docx reportlab
uv add --dev pytest pytest-asyncio pypdf ruff
```

Expected: `pyproject.toml` and `uv.lock` created with the listed deps.

- [ ] **Step 2: Configure pytest**

Append to `backend/pyproject.toml`:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 3: Create empty packages**

```bash
mkdir -p backend/app backend/tests
touch backend/app/__init__.py backend/tests/__init__.py
```

- [ ] **Step 4: Add `conftest.py` with a project-root import path**

`backend/tests/conftest.py`:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
```

- [ ] **Step 5: Verify pytest finds zero tests**

Run: `cd backend && uv run pytest -q`
Expected: `no tests ran` (exit 5 is OK at this stage; treat as success).

- [ ] **Step 6: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock backend/app backend/tests
git commit -m "chore(backend): initialize uv project with FastAPI + test deps"
```

### Task 2.2: `config.py` (Settings + retry caps) and `pedagogy.py` (editorial tables)

Two files because they belong to two different categories. `config.py` is env-driven runtime settings (API keys, model IDs, prompt-version selector). `pedagogy.py` holds editorial constants the operator does not tune from outside the code — pedagogy choices like "how many words per page is on-level for grade 3." Keeping them split prevents the file from becoming a junk drawer as later phases add `FONT_SIZES`, the grade-to-band mapping, and similar tables.

**Files:**
- Create: `backend/app/config.py`
- Create: `backend/app/pedagogy.py`
- Create: `backend/tests/test_config.py`
- Create: `backend/tests/test_pedagogy.py`

- [ ] **Step 1: Write failing tests**

`backend/tests/test_pedagogy.py`:

```python
from app.pedagogy import WORDS_PER_PAGE


def test_words_per_page_doubles_when_drawing_box_off():
    for level in ["K", "1", "2", "3", "4", "5"]:
        on = WORDS_PER_PAGE[(level, True)]
        off = WORDS_PER_PAGE[(level, False)]
        assert off == on * 2, f"level {level}: {off} != 2*{on}"
```

`backend/tests/test_config.py`:

```python
from app.config import MAX_RETRIES, EVALUATOR_TRANSPORT_RETRIES, get_settings


def test_retry_caps():
    assert MAX_RETRIES == 3
    assert EVALUATOR_TRANSPORT_RETRIES == 3


def test_settings_reads_env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "anth-test")
    monkeypatch.setenv("GOOGLE_API_KEY", "g-test")
    get_settings.cache_clear()
    s = get_settings()
    assert s.anthropic_api_key == "anth-test"
    assert s.google_api_key == "g-test"
    assert s.claude_model == "claude-sonnet-4-6"
    assert s.gemini_model == "gemini-2.5-pro"
    assert s.evaluator_prompt_version == "v1"


def test_settings_evaluator_prompt_version_overridable(monkeypatch):
    monkeypatch.setenv("EVALUATOR_PROMPT_VERSION", "v2")
    get_settings.cache_clear()
    assert get_settings().evaluator_prompt_version == "v2"
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && uv run pytest tests/test_config.py tests/test_pedagogy.py -v`
Expected: `ModuleNotFoundError` on `app.config` and `app.pedagogy`.

- [ ] **Step 3: Implement `pedagogy.py`**

`backend/app/pedagogy.py`:

```python
# Editorial / pedagogy constants. Things that encode "what counts as
# on-level for grade N" — not things the operator tunes via env or UI.
#
# Coming in later v1 phases (drop into THIS file when they land — don't
# scatter them across consumer modules):
#   - GRADE_TO_BAND   single-grade -> Learning Commons band, added in
#                     Task 4.1 (evaluator)
#   - FONT_SIZES      per-grade PDF body font, added in Task 8.2 (renderer)
#
# v2 brainstorms (see docs/v2-ideas.md "Pedagogy table extensions"):
#   - Scaffolding playbook    (when to add definitions, picture support, etc.)
#   - Vocabulary allow/avoid  (per-grade word lists)
#   - Sentence-length targets (per-grade max sentence length)

WORDS_PER_PAGE: dict[tuple[str, bool], int] = {
    # (reading_level, include_drawing_box): words per page
    #
    # Box-on values match conventional leveled-reader page counts
    # (which assume illustration space at the top of the page).
    # Box-off values are doubled to fill the area freed up by removing the box.
    ("K", True):  20,  ("K", False):  40,
    ("1", True):  40,  ("1", False):  80,
    ("2", True):  70,  ("2", False): 140,
    ("3", True): 100,  ("3", False): 200,
    ("4", True): 150,  ("4", False): 300,
    ("5", True): 200,  ("5", False): 400,
}
```

- [ ] **Step 4: Implement `config.py`**

`backend/app/config.py`:

```python
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

# Editorial / pedagogy constants (WORDS_PER_PAGE, FONT_SIZES, grade-to-band,
# etc.) live in app/pedagogy.py — keep them out of here so config.py stays
# the home for env-driven runtime settings only.

MAX_RETRIES = 3
EVALUATOR_TRANSPORT_RETRIES = 3


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    anthropic_api_key: str = ""
    google_api_key: str = ""
    openai_api_key: str = ""  # reserved for v2; not used in v1
    claude_model: str = "claude-sonnet-4-6"
    gemini_model: str = "gemini-2.5-pro"
    evaluator_prompt_version: str = "v1"


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 5: Run, confirm pass**

Run: `cd backend && uv run pytest tests/test_config.py tests/test_pedagogy.py -v`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/config.py backend/app/pedagogy.py \
        backend/tests/test_config.py backend/tests/test_pedagogy.py
git commit -m "feat(backend): add pedagogy.py (WORDS_PER_PAGE) and config.py (Settings)"
```

### Task 2.3: `schemas.py` — request/response/event models

**Files:**
- Create: `backend/app/schemas.py`
- Create: `backend/tests/test_schemas.py`

- [ ] **Step 1: Write failing test**

`backend/tests/test_schemas.py`:

```python
import pytest
from pydantic import ValidationError
from app.schemas import (
    GenerateRequest,
    ExportRequest,
    BundleRequest,
    Genre,
    ReadingLevel,
)


def test_generate_request_minimal_valid():
    req = GenerateRequest(
        child_name="Maya",
        reading_level="3",
        genre="fiction",
        pages=2,
        topics=["Soccer"],
    )
    assert req.include_drawing_box is False
    assert req.topics == ["Soccer"]


def test_generate_request_rejects_invalid_level():
    with pytest.raises(ValidationError):
        GenerateRequest(
            child_name="Maya",
            reading_level="6",
            genre="fiction",
            pages=1,
            topics=["A"],
        )


def test_generate_request_rejects_empty_topics():
    with pytest.raises(ValidationError):
        GenerateRequest(
            child_name="Maya",
            reading_level="3",
            genre="fiction",
            pages=1,
            topics=[],
        )


def test_generate_request_rejects_pages_zero():
    with pytest.raises(ValidationError):
        GenerateRequest(
            child_name="Maya",
            reading_level="3",
            genre="fiction",
            pages=0,
            topics=["A"],
        )


def test_export_request_pdf_round_trip():
    req = ExportRequest(
        format="pdf",
        child_name="Maya",
        topic="Soccer",
        genre="fiction",
        text="Once upon a time.",
        reading_level="3",
        pages=2,
        include_drawing_box=True,
    )
    assert req.format == "pdf"


def test_bundle_request_requires_one_story():
    with pytest.raises(ValidationError):
        BundleRequest(format="pdf", stories=[])
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && uv run pytest tests/test_schemas.py -v`
Expected: ImportError on `app.schemas`.

- [ ] **Step 3: Implement schemas**

`backend/app/schemas.py`:

```python
from typing import Literal
from pydantic import BaseModel, Field

Genre = Literal["fiction", "non-fiction"]
ReadingLevel = Literal["K", "1", "2", "3", "4", "5"]


class GenerateRequest(BaseModel):
    child_name: str = Field(min_length=1)
    reading_level: ReadingLevel
    genre: Genre
    pages: int = Field(ge=1)
    include_drawing_box: bool = False
    topics: list[str] = Field(min_length=1)


class StoryPayload(BaseModel):
    child_name: str = Field(min_length=1)
    topic: str = Field(min_length=1)
    genre: Genre
    text: str
    reading_level: ReadingLevel
    pages: int = Field(ge=1)
    include_drawing_box: bool = False


class ExportRequest(StoryPayload):
    format: Literal["docx", "pdf"]


class BundleRequest(BaseModel):
    format: Literal["docx", "pdf"]
    stories: list[StoryPayload] = Field(min_length=1)


class EvalResult(BaseModel):
    appropriate: bool
    predicted_grade: str | None
    feedback: str


class StartedEvent(BaseModel):
    story_id: str
    topic: str


class AttemptEvent(BaseModel):
    story_id: str
    attempt: int


class DoneEvent(BaseModel):
    story_id: str
    text: str
    predicted_grade: str | None
    appropriate: bool
    attempts: int


class ErrorEvent(BaseModel):
    story_id: str | None
    message: str
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && uv run pytest tests/test_schemas.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas.py backend/tests/test_schemas.py
git commit -m "feat(backend): add pydantic schemas for requests and SSE events"
```

---

## Phase 3 — Generator

### Task 3.1: Jinja2 prompt templates

**Files:**
- Create: `backend/app/prompts/fiction.j2`
- Create: `backend/app/prompts/non_fiction.j2`

- [ ] **Step 1: Create the prompt directory**

```bash
mkdir -p backend/app/prompts
```

- [ ] **Step 2: Write `fiction.j2`**

`backend/app/prompts/fiction.j2`:

```
You are writing a short K–5 leveled-reader story for a student.

Target reading level: {{ reading_level }} (US grade band).
Genre: fiction.
Topic: {{ topic }}.
Target length: approximately {{ target_words }} words.

The main character of the story is named {{ child_name }}.
Write the story so that {{ child_name }} is the protagonist. Keep names,
vocabulary, sentence length, and concepts consistent with the target
reading level. Avoid frightening or unsafe content. Do not include a
title, preamble, or "The End" — output only the story prose.

{% if feedback %}
A previous draft did not match the target reading level. Reviewer feedback:
"{{ feedback }}"
Revise so the new draft satisfies the target reading level.
{% endif %}
```

- [ ] **Step 3: Write `non_fiction.j2`**

`backend/app/prompts/non_fiction.j2`:

```
You are writing a short K–5 leveled-reader nonfiction passage for a student.

Target reading level: {{ reading_level }} (US grade band).
Genre: non-fiction.
Topic: {{ topic }}.
Target length: approximately {{ target_words }} words.

Write an age-appropriate, accurate informational passage about the topic.
Use vocabulary, sentence length, and concepts consistent with the target
reading level. Do not invent specific people. Do not include a title,
preamble, or summary — output only the passage prose.

{% if feedback %}
A previous draft did not match the target reading level. Reviewer feedback:
"{{ feedback }}"
Revise so the new draft satisfies the target reading level.
{% endif %}
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/prompts
git commit -m "feat(backend): add fiction and non-fiction prompt templates"
```

### Task 3.2: `generator.py` with Anthropic SDK wrapper

**Files:**
- Create: `backend/app/generator.py`
- Create: `backend/tests/test_generator.py`

- [ ] **Step 1: Write failing tests**

`backend/tests/test_generator.py`:

```python
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
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && uv run pytest tests/test_generator.py -v`
Expected: ImportError on `app.generator`.

- [ ] **Step 3: Implement generator**

`backend/app/generator.py`:

```python
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
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && uv run pytest tests/test_generator.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/generator.py backend/tests/test_generator.py
git commit -m "feat(backend): add generator with Jinja2 prompt and Anthropic call"
```

---

## Phase 4 — Evaluator adapter

### Task 4.1: `evaluator.py` — Gemini judge + band-to-grade mapping + transport retries

**Files:**
- Create: `backend/app/evaluator.py`
- Create: `backend/tests/test_evaluator.py`
- Modify: `backend/app/pedagogy.py` (add `GRADE_TO_BAND`)

The grade-level rubric prompts already live at
`backend/app/evaluator_prompts/grade-level/v1/{system,user}.txt` — they were
snapshotted from the submodule during repo setup. No fixture rubric is
needed; tests read the real v1 snapshot.

- [ ] **Step 0: Add `GRADE_TO_BAND` to `pedagogy.py`**

Insert into `backend/app/pedagogy.py`, below `WORDS_PER_PAGE`:

```python
# Single-grade -> Learning Commons grade band. The grade-level rubric
# only emits bands (K-1, 2-3, 4-5, 6-8, 9-10, 11-CCR); our UI offers
# single grades. evaluator.py expands the teacher's target grade
# through this table before comparing against the judge's verdict.
GRADE_TO_BAND: dict[str, str] = {
    "K": "K-1", "1": "K-1",
    "2": "2-3", "3": "2-3",
    "4": "4-5", "5": "4-5",
}
```

- [ ] **Step 1: Write failing tests**

`backend/tests/test_evaluator.py`:

```python
import json
from unittest.mock import AsyncMock, MagicMock
import pytest

from app import evaluator as eval_mod
from app.evaluator import (
    evaluate_grade_level,
    _band_for_grade,
    _load_prompts,
)


@pytest.fixture(autouse=True)
def reset_caches():
    eval_mod._load_prompts.cache_clear()
    yield
    eval_mod._load_prompts.cache_clear()


def _ai_message(payload: dict | str):
    msg = MagicMock()
    msg.content = json.dumps(payload) if isinstance(payload, dict) else payload
    return msg


def _mock_llm(responses):
    llm = MagicMock()
    llm.ainvoke = AsyncMock(side_effect=responses)
    return llm


@pytest.mark.parametrize(
    "grade,band",
    [("K", "K-1"), ("1", "K-1"), ("2", "2-3"), ("3", "2-3"), ("4", "4-5"), ("5", "4-5")],
)
def test_band_for_grade(grade, band):
    assert _band_for_grade(grade) == band


def test_load_prompts_reads_v1_snapshot():
    system, user = _load_prompts("v1")
    assert "grade level appropriateness" in system.lower()
    assert user.strip()  # non-empty


async def test_parses_appropriate_band_response(monkeypatch):
    payload = {
        "reasoning": "...",
        "grade": "2-3",
        "alternative_grade": "K-1",
        "scaffolding_needed": "Pre-teach 'soccer'.",
        "revision_guidance": "Could trim one sentence for tighter pacing.",
    }
    monkeypatch.setattr(eval_mod, "_llm", lambda: _mock_llm([_ai_message(payload)]))

    result = await evaluate_grade_level("Some story.", "3")
    assert result.appropriate is True
    assert result.predicted_grade == "2-3"
    assert "K-1" in result.feedback
    assert "Could trim" in result.feedback
    # scaffolding_needed is teacher-facing and must NOT be fed back to Claude.
    assert "Pre-teach" not in result.feedback


async def test_parses_mismatch_response(monkeypatch):
    payload = {
        "reasoning": "Sentences too long.",
        "grade": "4-5",
        "alternative_grade": "2-3",
        "scaffolding_needed": "Read aloud with vocabulary support.",
        "revision_guidance": "Chunk into shorter sentences and replace 'velocity' with 'speed'.",
    }
    monkeypatch.setattr(eval_mod, "_llm", lambda: _mock_llm([_ai_message(payload)]))

    result = await evaluate_grade_level("Some story.", "3")
    assert result.appropriate is False
    assert result.predicted_grade == "4-5"
    assert "Chunk into shorter sentences" in result.feedback
    assert "Sentences too long" in result.feedback
    # scaffolding_needed is teacher-facing and must NOT be fed back to Claude.
    assert "Read aloud" not in result.feedback


async def test_retries_three_times_then_gives_up(monkeypatch):
    llm = MagicMock()
    llm.ainvoke = AsyncMock(side_effect=RuntimeError("boom"))
    monkeypatch.setattr(eval_mod, "_llm", lambda: llm)
    sleeps: list[float] = []

    async def fake_sleep(s):
        sleeps.append(s)

    monkeypatch.setattr(eval_mod.asyncio, "sleep", fake_sleep)

    result = await evaluate_grade_level("Some story.", "3")
    assert result.appropriate is False
    assert result.predicted_grade is None
    assert result.feedback == "evaluator unavailable"
    assert llm.ainvoke.await_count == 3
    assert sleeps == [0.5, 1.0]


async def test_malformed_json_treated_as_transient(monkeypatch):
    good = {
        "reasoning": "ok",
        "grade": "2-3",
        "alternative_grade": "K-1",
        "scaffolding_needed": "",
        "revision_guidance": "",
    }
    monkeypatch.setattr(
        eval_mod,
        "_llm",
        lambda: _mock_llm([_ai_message("not json"), _ai_message(good)]),
    )
    monkeypatch.setattr(eval_mod.asyncio, "sleep", AsyncMock())

    result = await evaluate_grade_level("Some story.", "3")
    assert result.appropriate is True


async def test_prompt_version_selectable(monkeypatch, tmp_path):
    # Drop a fake v2 snapshot under a temp prompt root and point the loader at it.
    v2 = tmp_path / "grade-level" / "v2"
    v2.mkdir(parents=True)
    (v2 / "system.txt").write_text("fake v2 system")
    (v2 / "user.txt").write_text("fake v2 user with {text}")
    monkeypatch.setattr(eval_mod, "_PROMPT_ROOT", tmp_path)
    eval_mod._load_prompts.cache_clear()

    monkeypatch.setattr(eval_mod, "_active_version", lambda: "v2")
    payload = {
        "reasoning": "x", "grade": "2-3", "alternative_grade": "K-1",
        "scaffolding_needed": "", "revision_guidance": "",
    }
    captured: list = []

    async def capture_invoke(messages):
        captured.append(messages)
        return _ai_message(payload)

    llm = MagicMock()
    llm.ainvoke = AsyncMock(side_effect=capture_invoke)
    monkeypatch.setattr(eval_mod, "_llm", lambda: llm)

    await evaluate_grade_level("hello", "3")
    # The fake v2 system prompt should have been used
    sent = "".join(getattr(m, "content", "") for m in captured[0])
    assert "fake v2 system" in sent
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && uv run pytest tests/test_evaluator.py -v`
Expected: ImportError on `app.evaluator`.

- [ ] **Step 3: Implement evaluator**

`backend/app/evaluator.py`:

```python
import asyncio
import json
import logging
from functools import lru_cache
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import EVALUATOR_TRANSPORT_RETRIES, get_settings
from app.pedagogy import GRADE_TO_BAND
from app.schemas import EvalResult

log = logging.getLogger(__name__)

_PROMPT_ROOT = Path(__file__).parent / "evaluator_prompts"


def _band_for_grade(grade: str) -> str:
    return GRADE_TO_BAND[grade]


def _active_version() -> str:
    return get_settings().evaluator_prompt_version


@lru_cache(maxsize=8)
def _load_prompts(version: str) -> tuple[str, str]:
    base = _PROMPT_ROOT / "grade-level" / version
    return (
        (base / "system.txt").read_text(encoding="utf-8"),
        (base / "user.txt").read_text(encoding="utf-8"),
    )


@lru_cache
def _llm() -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model=get_settings().gemini_model,
        temperature=0.25,
        timeout=120,
        google_api_key=get_settings().google_api_key,
    )


_BACKOFF = [0.5, 1.0, 2.0]


def _build_feedback(payload: dict) -> str:
    # `scaffolding_needed` (from upstream rubric) describes teacher-facing
    # supports for reading the text at the lower `alternative_grade` band —
    # it's not generator-revision guidance, and we deliberately don't feed
    # it back to Claude. We ask Gemini for a separate `revision_guidance`
    # field in the JSON footer and use that for the regenerator prompt.
    reasoning = str(payload.get("reasoning", "")).strip()
    alt = str(payload.get("alternative_grade", "")).strip()
    revision = str(payload.get("revision_guidance", "")).strip()
    parts: list[str] = []
    if reasoning:
        parts.append(f"Reasoning: {reasoning}")
    if alt:
        parts.append(f"Closer fit was band {alt}.")
    if revision:
        parts.append(f"Suggested revisions: {revision}")
    return " ".join(parts)


async def evaluate_grade_level(text: str, target_reading_level: str) -> EvalResult:
    system_prompt, user_prompt = _load_prompts(_active_version())
    # The upstream user prompt expects a {text} placeholder. We also pass
    # the target grade as context for the judge to anchor on.
    hydrated_user = (
        f"Target student grade: {target_reading_level}\n\n"
        f"Procedure:\n{user_prompt}\n\n"
        f"Text to evaluate:\n{text}\n\n"
        "Return JSON only, no prose, with these fields: "
        '{"reasoning": "...", "grade": "<band>", '
        '"alternative_grade": "<band>", "scaffolding_needed": "...", '
        '"revision_guidance": "..."}. '
        "`scaffolding_needed` is the upstream rubric's teacher-facing "
        "supports for reading at `alternative_grade` (pictures, "
        "pre-teaching, read-aloud, etc.). `revision_guidance` is "
        "separate: concrete suggestions for revising the TEXT itself "
        "(shorter sentences, simpler vocabulary, fewer concepts, or — "
        "if the text is too easy — longer sentences, richer vocabulary) "
        "so the next draft better hits the target student grade. "
        "Populate `revision_guidance` whether the text is currently too "
        "hard OR too easy."
    )
    expected_band = _band_for_grade(target_reading_level)

    last_err: Exception | None = None
    for attempt in range(EVALUATOR_TRANSPORT_RETRIES):
        try:
            response = await _llm().ainvoke(
                [SystemMessage(content=system_prompt), HumanMessage(content=hydrated_user)]
            )
            raw = response.content or ""
            data = json.loads(raw)
            predicted_band = str(data["grade"])
            return EvalResult(
                appropriate=(predicted_band == expected_band),
                predicted_grade=predicted_band,
                feedback=_build_feedback(data),
            )
        except (json.JSONDecodeError, KeyError, Exception) as exc:  # noqa: BLE001
            last_err = exc
            log.warning("evaluator attempt %s failed: %s", attempt + 1, exc)
            if attempt < EVALUATOR_TRANSPORT_RETRIES - 1:
                await asyncio.sleep(_BACKOFF[attempt])
    log.error("evaluator unavailable after retries: %s", last_err)
    return EvalResult(
        appropriate=False, predicted_grade=None, feedback="evaluator unavailable"
    )
```

> **Why `predicted_grade` carries a band string:** The wire-level SSE
> `done` event already calls this field `predicted_grade`. Rather than
> introduce a parallel `predicted_band` field and update every consumer,
> we keep the name and document that the value is the rubric band
> (`"K-1"`, `"2-3"`, `"4-5"`, …). Frontend renders it as-is.

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && uv run pytest tests/test_evaluator.py -v`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/evaluator.py backend/app/pedagogy.py backend/tests/test_evaluator.py
git commit -m "feat(backend): add Gemini evaluator with band-to-grade mapping"
```

---

## Phase 5 — Pipeline

### Task 5.1: `pipeline.py` — per-topic generate+evaluate loop

**Files:**
- Create: `backend/app/pipeline.py`
- Create: `backend/tests/test_pipeline.py`

- [ ] **Step 1: Write failing tests**

`backend/tests/test_pipeline.py`:

```python
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


async def test_appropriate_on_first_attempt(monkeypatch):
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


async def test_appropriate_after_two_mismatches(monkeypatch):
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
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && uv run pytest tests/test_pipeline.py -v`
Expected: ImportError on `app.pipeline`.

- [ ] **Step 3: Implement pipeline**

`backend/app/pipeline.py`:

```python
import asyncio
import uuid
from dataclasses import dataclass
from typing import Awaitable, Callable

from app.config import MAX_RETRIES
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
        if result.feedback == "evaluator unavailable":
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
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && uv run pytest tests/test_pipeline.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/pipeline.py backend/tests/test_pipeline.py
git commit -m "feat(backend): add pipeline with retry+evaluator-unavailable handling"
```

---

## Phase 6 — Orchestrator, presets, SSE

### Task 6.1: `orchestrator.py` — fan-out over topics

**Files:**
- Create: `backend/app/orchestrator.py`
- Create: `backend/tests/test_orchestrator.py`

- [ ] **Step 1: Write failing test**

`backend/tests/test_orchestrator.py`:

```python
import asyncio
from collections import Counter
from unittest.mock import AsyncMock

from app.orchestrator import run_batch
from app.pipeline import TopicParams
from app.schemas import EvalResult


async def test_run_batch_streams_events_for_all_topics(monkeypatch):
    gen = AsyncMock(return_value="story")
    eva = AsyncMock(
        return_value=EvalResult(appropriate=True, predicted_grade="3", feedback="ok")
    )
    params = TopicParams(
        child_name="Maya",
        reading_level="3",
        genre="fiction",
        pages=1,
        include_drawing_box=False,
    )

    events: list[tuple[str, dict]] = []
    async for ev in run_batch(
        topics=["Soccer", "Dinosaurs", "The Moon"],
        params=params,
        generate=gen,
        evaluate=eva,
    ):
        events.append(ev)

    kinds = Counter(k for k, _ in events)
    assert kinds["started"] == 3
    assert kinds["attempt"] == 3
    assert kinds["done"] == 3
    assert kinds["complete"] == 1
    assert events[-1][0] == "complete"
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && uv run pytest tests/test_orchestrator.py -v`
Expected: ImportError.

- [ ] **Step 3: Implement orchestrator**

`backend/app/orchestrator.py`:

```python
import asyncio
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
            break

    yield ("complete", {})
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && uv run pytest tests/test_orchestrator.py -v`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/orchestrator.py backend/tests/test_orchestrator.py
git commit -m "feat(backend): add orchestrator that streams events from N topics"
```

### Task 6.2: `main.py` — FastAPI app with `/api/presets` and SSE `/api/generate`

**Files:**
- Create: `backend/app/main.py`
- Create: `backend/app/presets.py`
- Create: `backend/tests/test_api.py`

- [ ] **Step 1: Write failing tests**

`backend/tests/test_api.py`:

```python
import json
import re
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import app.main as main_mod
from app.main import app
from app.schemas import EvalResult


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(
        main_mod,
        "generate_story",
        AsyncMock(return_value="The story body."),
    )
    monkeypatch.setattr(
        main_mod,
        "evaluate_grade_level",
        AsyncMock(
            return_value=EvalResult(
                appropriate=True, predicted_grade="3", feedback="on level"
            )
        ),
    )
    return TestClient(app)


def parse_sse(body: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    for chunk in re.split(r"\n\n+", body.strip()):
        if not chunk.strip():
            continue
        lines = chunk.splitlines()
        ev = next((l[7:] for l in lines if l.startswith("event: ")), None)
        data = next((l[6:] for l in lines if l.startswith("data: ")), "{}")
        if ev:
            events.append((ev, json.loads(data)))
    return events


def test_presets_returns_catalog(client):
    response = client.get("/api/presets")
    assert response.status_code == 200
    body = response.json()
    assert "Sports" in body
    assert "Soccer" in body["Sports"]


def test_generate_emits_full_event_sequence(client):
    body = {
        "child_name": "Maya",
        "reading_level": "3",
        "genre": "fiction",
        "pages": 1,
        "include_drawing_box": True,
        "topics": ["Soccer", "Dinosaurs"],
    }
    with client.stream("POST", "/api/generate", json=body) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        raw = "".join(r.iter_text())

    events = parse_sse(raw)
    kinds = [k for k, _ in events]
    assert kinds.count("started") == 2
    assert kinds.count("done") == 2
    assert kinds[-1] == "complete"


def test_generate_validates_input(client):
    response = client.post(
        "/api/generate",
        json={
            "child_name": "",
            "reading_level": "3",
            "genre": "fiction",
            "pages": 1,
            "topics": ["Soccer"],
        },
    )
    assert response.status_code == 422
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && uv run pytest tests/test_api.py -v`
Expected: ImportError on `app.main`.

- [ ] **Step 3: Implement presets catalog**

`backend/app/presets.py`:

```python
PRESETS: dict[str, list[str]] = {
    "Sports":   ["Soccer", "Basketball", "Baseball", "Football", "Tennis", "Swimming"],
    "Animals":  ["Dogs", "Cats", "Dinosaurs", "Sharks", "Birds", "Insects"],
    "Space":    ["Planets", "Stars", "Astronauts", "The Moon", "Black Holes", "Rockets"],
    "History":  ["Ancient Egypt", "Vikings", "Wild West", "Knights", "Pirates", "Inventors"],
    "Nature":   ["Forests", "Oceans", "Mountains", "Weather", "Plants", "Rivers"],
    "Vehicles": ["Cars", "Trains", "Airplanes", "Boats", "Construction", "Spaceships"],
}
```

- [ ] **Step 4: Implement FastAPI app**

`backend/app/main.py`:

```python
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.evaluator import evaluate_grade_level
from app.generator import generate_story
from app.orchestrator import run_batch
from app.pipeline import TopicParams
from app.presets import PRESETS
from app.schemas import GenerateRequest

app = FastAPI(title="AI Learning Tools")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/presets")
async def get_presets() -> dict[str, list[str]]:
    return PRESETS


@app.post("/api/generate")
async def generate(request: GenerateRequest) -> StreamingResponse:
    params = TopicParams(
        child_name=request.child_name,
        reading_level=request.reading_level,
        genre=request.genre,
        pages=request.pages,
        include_drawing_box=request.include_drawing_box,
    )

    async def event_source():
        try:
            async for kind, data in run_batch(
                topics=request.topics,
                params=params,
                generate=generate_story,
                evaluate=evaluate_grade_level,
            ):
                yield f"event: {kind}\ndata: {json.dumps(data)}\n\n"
        except Exception as exc:  # noqa: BLE001
            yield (
                "event: error\n"
                f"data: {json.dumps({'story_id': None, 'message': str(exc)})}\n\n"
            )

    return StreamingResponse(event_source(), media_type="text/event-stream")
```

- [ ] **Step 5: Run, confirm pass**

Run: `cd backend && uv run pytest tests/test_api.py -v`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/app/presets.py backend/tests/test_api.py
git commit -m "feat(backend): wire FastAPI app with /api/presets and SSE /api/generate"
```

---

## Phase 7 — DOCX export

### Task 7.1: `export.py::render_docx` + filename helper

**Files:**
- Create: `backend/app/export.py`
- Create: `backend/tests/test_export.py`

- [ ] **Step 1: Write failing test**

`backend/tests/test_export.py`:

```python
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
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && uv run pytest tests/test_export.py -v`
Expected: ImportError.

- [ ] **Step 3: Implement docx renderer and filename helper**

`backend/app/export.py`:

```python
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
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && uv run pytest tests/test_export.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/export.py backend/tests/test_export.py
git commit -m "feat(backend): add docx renderer and safe-filename helper"
```

---

## Phase 8 — PDF export

### Task 8.1: `split_into_pages` — sentence-aware chunker

**Files:**
- Modify: `backend/app/export.py`
- Modify: `backend/tests/test_export.py`

- [ ] **Step 1: Append failing tests to `test_export.py`**

Append to `backend/tests/test_export.py`:

```python
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
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && uv run pytest tests/test_export.py::test_split_into_pages_returns_exact_chunk_count -v`
Expected: ImportError on `split_into_pages`.

- [ ] **Step 3: Implement `split_into_pages`**

Append to `backend/app/export.py`:

```python
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
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && uv run pytest tests/test_export.py -v`
Expected: all tests pass (existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add backend/app/export.py backend/tests/test_export.py
git commit -m "feat(backend): add sentence-aware split_into_pages chunker"
```

### Task 8.2: `render_pdf` with layout, font sizes, drawing box

**Files:**
- Modify: `backend/app/export.py`
- Modify: `backend/tests/test_export.py`

- [ ] **Step 1: Append failing tests**

Append to `backend/tests/test_export.py`:

```python
from pypdf import PdfReader

from app.export import render_pdf
from app.pedagogy import FONT_SIZES


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
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && uv run pytest tests/test_export.py -v`
Expected: failures on the new tests (`render_pdf` not defined and/or `FONT_SIZES` not yet in `app.pedagogy`).

- [ ] **Step 3a: Add `FONT_SIZES` to `pedagogy.py`**

Insert into `backend/app/pedagogy.py`, below `WORDS_PER_PAGE`:

```python
FONT_SIZES: dict[str, int] = {
    # Per-grade PDF body font, in points. Larger for early readers;
    # plateaus at grade 4 because 14pt is already comfortable for grade-5
    # text on letter-size pages.
    "K": 24, "1": 20, "2": 18, "3": 16, "4": 14, "5": 14,
}
```

(Remove the matching `FONT_SIZES` declaration from `export.py` if you initially added it there — there is one source of truth.)

- [ ] **Step 3b: Implement `render_pdf`**

Append to `backend/app/export.py`:

```python
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas as _canvas

from app.pedagogy import FONT_SIZES

_MARGIN = 0.75 * inch
_BOX_FRACTION = 0.45  # drawing box occupies top 45% of page


def render_pdf(story: StoryInput) -> bytes:
    buf = io.BytesIO()
    width, height = LETTER
    c = _canvas.Canvas(buf, pagesize=LETTER)
    font_size = FONT_SIZES[story.reading_level]
    leading = font_size * 1.3

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
```

> **Note on the final `c.showPage()`:** reportlab requires a final `showPage` + `save` to flush the last page. The loop adds page breaks *between* chunks; the trailing `showPage()` flushes the last one without producing an extra blank page because no drawing has happened since the last `drawString`/`rect`. The `test_pdf_has_correct_page_count` test pins this behaviour.

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && uv run pytest tests/test_export.py -v`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/export.py backend/app/pedagogy.py backend/tests/test_export.py
git commit -m "feat(backend): add reportlab PDF renderer with layout and drawing box"
```

### Task 8.3: Wire `/api/export` route

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_api.py`

- [ ] **Step 1: Add failing tests**

Append to `backend/tests/test_api.py`:

```python
def test_export_docx_returns_word_file(client):
    body = {
        "format": "docx",
        "child_name": "Maya",
        "topic": "The Moon",
        "genre": "fiction",
        "text": "Once upon a time. The end.",
        "reading_level": "3",
        "pages": 1,
        "include_drawing_box": False,
    }
    r = client.post("/api/export", json=body)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert "Maya_The_Moon.docx" in r.headers["content-disposition"]


def test_export_pdf_returns_pdf_bytes(client):
    body = {
        "format": "pdf",
        "child_name": "Maya",
        "topic": "Soccer",
        "genre": "fiction",
        "text": "Once. Twice. Thrice.",
        "reading_level": "3",
        "pages": 1,
        "include_drawing_box": True,
    }
    r = client.post("/api/export", json=body)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"
    assert "Maya_Soccer.pdf" in r.headers["content-disposition"]
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && uv run pytest tests/test_api.py -v`
Expected: 404 / not-found errors.

- [ ] **Step 3: Add `/api/export` route**

Add to `backend/app/main.py` imports:

```python
from fastapi import Response
from app.export import StoryInput, render_docx, render_pdf, safe_filename
from app.schemas import ExportRequest
```

And add the route:

```python
@app.post("/api/export")
async def export(request: ExportRequest) -> Response:
    story = StoryInput(
        child_name=request.child_name,
        topic=request.topic,
        genre=request.genre,
        text=request.text,
        reading_level=request.reading_level,
        pages=request.pages,
        include_drawing_box=request.include_drawing_box,
    )
    base = safe_filename(request.child_name, request.topic)
    if request.format == "docx":
        blob = render_docx(story)
        media = (
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document"
        )
        filename = f"{base}.docx"
    else:
        blob = render_pdf(story)
        media = "application/pdf"
        filename = f"{base}.pdf"
    return Response(
        content=blob,
        media_type=media,
        headers={"content-disposition": f'attachment; filename="{filename}"'},
    )
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && uv run pytest tests/test_api.py -v`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/tests/test_api.py
git commit -m "feat(backend): add /api/export route for docx and pdf"
```

---

## Phase 9 — Bundle export

### Task 9.1: `/api/export/bundle` — zip of per-story files

**Files:**
- Modify: `backend/app/export.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_export.py`
- Modify: `backend/tests/test_api.py`

- [ ] **Step 1: Append failing unit test**

Append to `backend/tests/test_export.py`:

```python
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
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && uv run pytest tests/test_export.py -v`
Expected: ImportError on `render_bundle`.

- [ ] **Step 3: Implement `render_bundle`**

Append to `backend/app/export.py`:

```python
import zipfile


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
```

- [ ] **Step 4: Append failing API test**

Append to `backend/tests/test_api.py`:

```python
def test_export_bundle_returns_zip(client):
    body = {
        "format": "docx",
        "stories": [
            {
                "child_name": "Maya",
                "topic": "Soccer",
                "genre": "fiction",
                "text": "One. Two.",
                "reading_level": "3",
                "pages": 1,
                "include_drawing_box": False,
            },
            {
                "child_name": "Maya",
                "topic": "Dinosaurs",
                "genre": "fiction",
                "text": "One. Two.",
                "reading_level": "3",
                "pages": 1,
                "include_drawing_box": False,
            },
        ],
    }
    r = client.post("/api/export/bundle", json=body)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"
    assert "Maya_stories.zip" in r.headers["content-disposition"]
```

- [ ] **Step 5: Add bundle route**

Add to `backend/app/main.py` imports:

```python
from app.export import render_bundle
from app.schemas import BundleRequest
```

Append route:

```python
@app.post("/api/export/bundle")
async def export_bundle(request: BundleRequest) -> Response:
    inputs = [
        StoryInput(
            child_name=s.child_name,
            topic=s.topic,
            genre=s.genre,
            text=s.text,
            reading_level=s.reading_level,
            pages=s.pages,
            include_drawing_box=s.include_drawing_box,
        )
        for s in request.stories
    ]
    blob = render_bundle(inputs, fmt=request.format)
    child = safe_filename(request.stories[0].child_name, "stories").split("_")[0]
    filename = f"{child}_stories.zip"
    return Response(
        content=blob,
        media_type="application/zip",
        headers={"content-disposition": f'attachment; filename="{filename}"'},
    )
```

- [ ] **Step 6: Run, confirm pass**

Run: `cd backend && uv run pytest -q`
Expected: all backend tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/export.py backend/app/main.py backend/tests
git commit -m "feat(backend): add /api/export/bundle returning a per-story zip"
```

---

## Phase 10 — Frontend scaffold, types, SSE helper

### Task 10.1: Initialize the Vite project

**Files:**
- Create: `frontend/` (via `npm create`)

- [ ] **Step 1: Scaffold Vite React + TS template**

```bash
cd /Users/cassidycoombs/personal/ai-learning-tools
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Configure Vitest**

Edit `frontend/vite.config.ts` to add a `test` block:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8000" } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

Create `frontend/src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Update `frontend/tsconfig.json`'s `compilerOptions.types` to include `"vitest/globals"` (merge with existing array — don't replace other types).

- [ ] **Step 3: Add npm scripts**

Edit `frontend/package.json` `scripts` to add:

```json
"test": "vitest"
```

(keep existing `dev`, `build`, `preview`).

- [ ] **Step 4: Sanity-check the smoke test**

```bash
cd frontend && npm test -- --run
```

Expected: zero tests found or pass (Vite templates ship without tests).

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "chore(frontend): scaffold Vite React+TS with vitest"
```

### Task 10.2: Shared `types.ts`

**Files:**
- Create: `frontend/src/types.ts`

- [ ] **Step 1: Add type definitions**

`frontend/src/types.ts`:

```ts
export type ReadingLevel = "K" | "1" | "2" | "3" | "4" | "5";
export type Genre = "fiction" | "non-fiction";

export interface GenerateRequest {
  child_name: string;
  reading_level: ReadingLevel;
  genre: Genre;
  pages: number;
  include_drawing_box: boolean;
  topics: string[];
}

export interface StoryPayload {
  child_name: string;
  topic: string;
  genre: Genre;
  text: string;
  reading_level: ReadingLevel;
  pages: number;
  include_drawing_box: boolean;
}

export type SseEvent =
  | { type: "started"; story_id: string; topic: string }
  | { type: "attempt"; story_id: string; attempt: number }
  | {
      type: "done";
      story_id: string;
      text: string;
      predicted_grade: string | null;
      appropriate: boolean;
      attempts: number;
    }
  | { type: "error"; story_id: string | null; message: string }
  | { type: "complete" };

export type Presets = Record<string, string[]>;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat(frontend): add shared types mirroring backend schemas"
```

### Task 10.3: `lib/sse.ts` — POST + ReadableStream SSE parser

**Files:**
- Create: `frontend/src/lib/sse.ts`
- Create: `frontend/src/lib/sse.test.ts`

- [ ] **Step 1: Write failing test**

`frontend/src/lib/sse.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { streamSse } from "./sse";

function makeStream(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, {
    headers: { "content-type": "text/event-stream" },
  });
}

describe("streamSse", () => {
  it("yields parsed events from chunked input", async () => {
    const events: any[] = [];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeStream([
        'event: started\ndata: {"story_id":"a","topic":"Soccer"}\n\n',
        'event: done\ndata: {"story_id":"a","text":"hi","predicted_grade":"3","appropriate":true,"attempts":1}\n\n',
        "event: complete\ndata: {}\n\n",
      ]),
    );
    for await (const ev of streamSse("/api/generate", { foo: "bar" })) {
      events.push(ev);
    }
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ type: "started", topic: "Soccer" });
    expect(events[2].type).toBe("complete");
  });

  it("re-assembles events split across chunks", async () => {
    const events: any[] = [];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeStream([
        'event: started\ndata: {"story_id":"a","topic":"Soccer"',
        '}\n\nevent: complete\ndata: {}\n\n',
      ]),
    );
    for await (const ev of streamSse("/api/generate", {})) events.push(ev);
    expect(events.map((e) => e.type)).toEqual(["started", "complete"]);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd frontend && npm test -- --run sse`
Expected: import error on `./sse`.

- [ ] **Step 3: Implement `streamSse`**

`frontend/src/lib/sse.ts`:

```ts
import type { SseEvent } from "../types";

export async function* streamSse(
  url: string,
  body: unknown,
): AsyncGenerator<SseEvent> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.body) throw new Error("no response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const evMatch = raw.match(/^event:\s*(.+)$/m);
      const dataMatch = raw.match(/^data:\s*(.+)$/m);
      if (!evMatch) continue;
      const data = dataMatch ? JSON.parse(dataMatch[1]) : {};
      yield { type: evMatch[1], ...data } as SseEvent;
    }
  }
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd frontend && npm test -- --run sse`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib
git commit -m "feat(frontend): add SSE helper with chunk re-assembly"
```

---

## Phase 11 — RequestForm

### Task 11.1: RequestForm — render + fetch presets + validate + submit

**Files:**
- Create: `frontend/src/components/RequestForm.tsx`
- Create: `frontend/src/components/RequestForm.test.tsx`

- [ ] **Step 1: Write failing tests**

`frontend/src/components/RequestForm.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RequestForm from "./RequestForm";

const PRESETS = {
  Sports: ["Soccer", "Basketball"],
  Animals: ["Dogs", "Cats"],
};

function mockPresets() {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(PRESETS), {
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("RequestForm", () => {
  it("requires name, ≥1 topic, and pages ≥ 1", async () => {
    mockPresets();
    const onSubmit = vi.fn();
    render(<RequestForm onSubmit={onSubmit} />);
    await waitFor(() =>
      expect(screen.getByText(/Sports/)).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: /generate/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/name/i)).toBeInTheDocument();
  });

  it("submits flat topic list including expanded subtopic and custom topic", async () => {
    mockPresets();
    const onSubmit = vi.fn();
    render(<RequestForm onSubmit={onSubmit} />);
    await waitFor(() =>
      expect(screen.getByText(/Sports/)).toBeInTheDocument(),
    );

    await userEvent.type(screen.getByLabelText(/student.*name/i), "Maya");
    // expand Sports
    await userEvent.click(screen.getByRole("button", { name: /Sports/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Soccer" }));
    // add a custom subtopic under Sports
    await userEvent.type(
      screen.getByLabelText(/Add custom.*Sports/i),
      "Curling",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /add custom topic.*Sports/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.topics).toEqual(expect.arrayContaining(["Soccer", "Curling"]));
    expect(payload.child_name).toBe("Maya");
    expect(payload.include_drawing_box).toBe(false);
  });

  it("toggles include_drawing_box and shows the PDF-only helper text", async () => {
    mockPresets();
    const onSubmit = vi.fn();
    render(<RequestForm onSubmit={onSubmit} />);
    await waitFor(() =>
      expect(screen.getByText(/Sports/)).toBeInTheDocument(),
    );

    expect(
      screen.getByText(/drawing box appears only in PDF/i),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/student.*name/i), "Maya");
    await userEvent.click(screen.getByRole("button", { name: /Sports/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Soccer" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /drawing box/i }));
    await userEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].include_drawing_box).toBe(true);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd frontend && npm test -- --run RequestForm`
Expected: import error.

- [ ] **Step 3: Implement `RequestForm`**

`frontend/src/components/RequestForm.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { GenerateRequest, Presets, ReadingLevel, Genre } from "../types";

interface Props {
  onSubmit: (req: GenerateRequest) => void;
}

const LEVELS: ReadingLevel[] = ["K", "1", "2", "3", "4", "5"];

export default function RequestForm({ onSubmit }: Props) {
  const [presets, setPresets] = useState<Presets>({});
  const [childName, setChildName] = useState("");
  const [readingLevel, setReadingLevel] = useState<ReadingLevel>("3");
  const [genre, setGenre] = useState<Genre>("fiction");
  const [pages, setPages] = useState(2);
  const [includeBox, setIncludeBox] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/presets")
      .then((r) => r.json())
      .then(setPresets);
  }, []);

  function toggleSelected(t: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function toggleExpanded(c: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function addCustom(category: string) {
    const draft = (customDrafts[category] || "").trim();
    if (!draft) return;
    setSelected((prev) => new Set(prev).add(draft));
    setCustomDrafts((prev) => ({ ...prev, [category]: "" }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (!childName.trim()) errs.push("Student name is required.");
    if (selected.size === 0) errs.push("Pick at least one topic.");
    if (pages < 1) errs.push("Pages must be at least 1.");
    setErrors(errs);
    if (errs.length) return;
    onSubmit({
      child_name: childName.trim(),
      reading_level: readingLevel,
      genre,
      pages,
      include_drawing_box: includeBox,
      topics: Array.from(selected),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Student's name
        <input
          aria-label="Student's name"
          value={childName}
          onChange={(e) => setChildName(e.target.value)}
        />
      </label>

      <label>
        Reading level
        <select
          value={readingLevel}
          onChange={(e) => setReadingLevel(e.target.value as ReadingLevel)}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>Genre</legend>
        {(["fiction", "non-fiction"] as const).map((g) => (
          <label key={g}>
            <input
              type="radio"
              name="genre"
              value={g}
              checked={genre === g}
              onChange={() => setGenre(g)}
            />
            {g}
          </label>
        ))}
      </fieldset>

      <label>
        Pages
        <input
          type="number"
          min={1}
          value={pages}
          onChange={(e) => setPages(parseInt(e.target.value, 10) || 0)}
        />
      </label>

      <label>
        <input
          type="checkbox"
          checked={includeBox}
          onChange={(e) => setIncludeBox(e.target.checked)}
        />
        Add a blank box for the student to draw a picture
      </label>
      <p className="helper">
        The drawing box appears only in PDF downloads. Word downloads are plain text.
      </p>

      <div className="categories">
        {Object.entries(presets).map(([category, subtopics]) => (
          <div key={category}>
            <button type="button" onClick={() => toggleExpanded(category)}>
              {category}
            </button>
            {expanded.has(category) && (
              <div>
                {subtopics.map((sub) => (
                  <label key={sub}>
                    <input
                      type="checkbox"
                      name={sub}
                      checked={selected.has(sub)}
                      onChange={() => toggleSelected(sub)}
                    />
                    {sub}
                  </label>
                ))}
                <label>
                  Add custom topic to {category}
                  <input
                    value={customDrafts[category] || ""}
                    onChange={(e) =>
                      setCustomDrafts((p) => ({
                        ...p,
                        [category]: e.target.value,
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() => addCustom(category)}
                  aria-label={`Add custom topic to ${category}`}
                >
                  Add
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <ul className="errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <button type="submit">Generate</button>
    </form>
  );
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd frontend && npm test -- --run RequestForm`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RequestForm.tsx frontend/src/components/RequestForm.test.tsx
git commit -m "feat(frontend): add RequestForm with presets, custom topics, drawing-box helper"
```

---

## Phase 12 — StoryList + StoryCard

### Task 12.1: `StoryCard` — render skeleton/done/warning

**Files:**
- Create: `frontend/src/components/StoryCard.tsx`
- Create: `frontend/src/components/StoryCard.test.tsx`

- [ ] **Step 1: Write failing test**

`frontend/src/components/StoryCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StoryCard, { type StoryCardState } from "./StoryCard";

const baseState: StoryCardState = {
  story_id: "a",
  topic: "Soccer",
  status: "pending",
  attempts: 0,
};

describe("StoryCard", () => {
  it("shows skeleton when pending", () => {
    render(
      <StoryCard
        state={baseState}
        request={{
          child_name: "Maya",
          reading_level: "3",
          genre: "fiction",
          pages: 1,
          include_drawing_box: false,
        }}
        onPreviewPdf={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading")).toHaveTextContent(/Soccer/);
    expect(screen.getByText(/Generating/i)).toBeInTheDocument();
  });

  it("shows text and no warning when appropriate", () => {
    render(
      <StoryCard
        state={{
          ...baseState,
          status: "done",
          text: "Once upon a time.",
          appropriate: true,
          predicted_grade: "3",
          attempts: 1,
        }}
        request={{
          child_name: "Maya",
          reading_level: "3",
          genre: "fiction",
          pages: 1,
          include_drawing_box: false,
        }}
        onPreviewPdf={vi.fn()}
      />,
    );
    expect(screen.getByText("Once upon a time.")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't confirm/i)).not.toBeInTheDocument();
  });

  it("shows the warning badge when not appropriate", () => {
    render(
      <StoryCard
        state={{
          ...baseState,
          status: "done",
          text: "Body.",
          appropriate: false,
          predicted_grade: "5",
          attempts: 3,
        }}
        request={{
          child_name: "Maya",
          reading_level: "3",
          genre: "fiction",
          pages: 1,
          include_drawing_box: false,
        }}
        onPreviewPdf={vi.fn()}
      />,
    );
    expect(screen.getByText(/couldn't confirm/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd frontend && npm test -- --run StoryCard`
Expected: import error.

- [ ] **Step 3: Implement `StoryCard`**

`frontend/src/components/StoryCard.tsx`:

```tsx
import type { Genre, ReadingLevel } from "../types";

export interface StoryCardState {
  story_id: string;
  topic: string;
  status: "pending" | "done" | "error";
  attempts: number;
  text?: string;
  appropriate?: boolean;
  predicted_grade?: string | null;
  error?: string;
}

export interface StoryRequestContext {
  child_name: string;
  reading_level: ReadingLevel;
  genre: Genre;
  pages: number;
  include_drawing_box: boolean;
}

interface Props {
  state: StoryCardState;
  request: StoryRequestContext;
  onPreviewPdf: (state: StoryCardState) => void;
}

async function downloadDocx(state: StoryCardState, req: StoryRequestContext) {
  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      format: "docx",
      child_name: req.child_name,
      topic: state.topic,
      genre: req.genre,
      text: state.text ?? "",
      reading_level: req.reading_level,
      pages: req.pages,
      include_drawing_box: req.include_drawing_box,
    }),
  });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${req.child_name}_${state.topic}.docx`.replace(/\s+/g, "_");
  a.click();
  URL.revokeObjectURL(url);
}

export default function StoryCard({ state, request, onPreviewPdf }: Props) {
  return (
    <article className="story-card">
      <header>
        <h3>
          For {request.child_name} · {state.topic}
        </h3>
        {state.status === "done" && state.appropriate === false && (
          <span className="badge warning">
            Couldn't confirm reading level
          </span>
        )}
      </header>

      {state.status === "pending" && (
        <p>Generating (attempt {state.attempts || 1})…</p>
      )}
      {state.status === "error" && <p className="error">{state.error}</p>}
      {state.status === "done" && (
        <>
          <pre className="story-text">{state.text}</pre>
          <div className="actions">
            <button onClick={() => downloadDocx(state, request)}>
              Download as Word
            </button>
            <button onClick={() => onPreviewPdf(state)}>
              Download as PDF
            </button>
          </div>
          <p className="helper">
            PDFs are pre-formatted for printing. Word docs are plain text —
            apply your own formatting after download.
          </p>
        </>
      )}
    </article>
  );
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd frontend && npm test -- --run StoryCard`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StoryCard.tsx frontend/src/components/StoryCard.test.tsx
git commit -m "feat(frontend): add StoryCard with skeleton/done/warning states"
```

### Task 12.2: `StoryList` — keyed by story_id, applies SSE events

**Files:**
- Create: `frontend/src/components/StoryList.tsx`
- Create: `frontend/src/components/StoryList.test.tsx`

- [ ] **Step 1: Write failing test**

`frontend/src/components/StoryList.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StoryList from "./StoryList";
import type { SseEvent } from "../types";

const SCRIPT: SseEvent[] = [
  { type: "started", story_id: "a", topic: "Soccer" },
  { type: "attempt", story_id: "a", attempt: 1 },
  {
    type: "done",
    story_id: "a",
    text: "A body.",
    appropriate: true,
    predicted_grade: "3",
    attempts: 1,
  },
  { type: "started", story_id: "b", topic: "Dinosaurs" },
  {
    type: "done",
    story_id: "b",
    text: "B body.",
    appropriate: false,
    predicted_grade: "5",
    attempts: 3,
  },
  { type: "complete" },
];

function fakeStream(): AsyncGenerator<SseEvent> {
  let i = 0;
  return (async function* () {
    while (i < SCRIPT.length) yield SCRIPT[i++];
  })();
}

describe("StoryList", () => {
  it("renders cards from scripted SSE events", async () => {
    render(
      <StoryList
        events={fakeStream()}
        request={{
          child_name: "Maya",
          reading_level: "3",
          genre: "fiction",
          pages: 1,
          include_drawing_box: false,
        }}
        onPreviewPdf={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Soccer/)).toBeInTheDocument();
      expect(screen.getByText(/Dinosaurs/)).toBeInTheDocument();
    });
    expect(screen.getByText("A body.")).toBeInTheDocument();
    expect(screen.getByText("B body.")).toBeInTheDocument();
    expect(screen.getByText(/couldn't confirm/i)).toBeInTheDocument();
  });

  it("shows Download all buttons that hit the bundle endpoint", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(new Blob(["zip"])));
    render(
      <StoryList
        events={fakeStream()}
        request={{
          child_name: "Maya",
          reading_level: "3",
          genre: "fiction",
          pages: 1,
          include_drawing_box: false,
        }}
        onPreviewPdf={vi.fn()}
      />,
    );

    const wordBtn = await screen.findByRole("button", {
      name: /download all.*word/i,
    });
    wordBtn.click();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/export/bundle",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls.at(-1)?.[1] as RequestInit).body as string,
    );
    expect(body.format).toBe("docx");
    expect(body.stories).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd frontend && npm test -- --run StoryList`
Expected: import error.

- [ ] **Step 3: Implement `StoryList`**

`frontend/src/components/StoryList.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { SseEvent } from "../types";
import StoryCard, {
  type StoryCardState,
  type StoryRequestContext,
} from "./StoryCard";

interface Props {
  events: AsyncGenerator<SseEvent>;
  request: StoryRequestContext;
  onPreviewPdf: (state: StoryCardState) => void;
}

async function downloadBundle(
  format: "docx" | "pdf",
  stories: StoryCardState[],
  request: StoryRequestContext,
) {
  const response = await fetch("/api/export/bundle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      format,
      stories: stories
        .filter((s) => s.status === "done" && s.text)
        .map((s) => ({
          child_name: request.child_name,
          topic: s.topic,
          genre: request.genre,
          text: s.text!,
          reading_level: request.reading_level,
          pages: request.pages,
          include_drawing_box: request.include_drawing_box,
        })),
    }),
  });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${request.child_name}_stories.zip`.replace(/\s+/g, "_");
  a.click();
  URL.revokeObjectURL(url);
}

export default function StoryList({ events, request, onPreviewPdf }: Props) {
  const [stories, setStories] = useState<Record<string, StoryCardState>>({});
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      for await (const ev of events) {
        if (ev.type === "started") {
          setOrder((o) => [...o, ev.story_id]);
          setStories((s) => ({
            ...s,
            [ev.story_id]: {
              story_id: ev.story_id,
              topic: ev.topic,
              status: "pending",
              attempts: 0,
            },
          }));
        } else if (ev.type === "attempt") {
          setStories((s) => ({
            ...s,
            [ev.story_id]: { ...s[ev.story_id], attempts: ev.attempt },
          }));
        } else if (ev.type === "done") {
          setStories((s) => ({
            ...s,
            [ev.story_id]: {
              ...s[ev.story_id],
              status: "done",
              text: ev.text,
              appropriate: ev.appropriate,
              predicted_grade: ev.predicted_grade,
              attempts: ev.attempts,
            },
          }));
        } else if (ev.type === "error" && ev.story_id) {
          setStories((s) => ({
            ...s,
            [ev.story_id!]: {
              ...s[ev.story_id!],
              status: "error",
              error: ev.message,
            },
          }));
        }
      }
    })();
  }, [events]);

  const list = order.map((id) => stories[id]).filter(Boolean);
  const doneStories = list.filter((s) => s.status === "done");

  return (
    <section>
      <header className="bundle-actions">
        <button
          disabled={!doneStories.length}
          onClick={() => downloadBundle("docx", doneStories, request)}
        >
          Download all as Word
        </button>
        <button
          disabled={!doneStories.length}
          onClick={() => downloadBundle("pdf", doneStories, request)}
        >
          Download all as PDF
        </button>
      </header>
      <div className="story-list">
        {list.map((state) => (
          <StoryCard
            key={state.story_id}
            state={state}
            request={request}
            onPreviewPdf={onPreviewPdf}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd frontend && npm test -- --run StoryList`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StoryList.tsx frontend/src/components/StoryList.test.tsx
git commit -m "feat(frontend): add StoryList with bundle download buttons"
```

---

## Phase 13 — PdfPreviewModal

### Task 13.1: PdfPreviewModal component

**Files:**
- Create: `frontend/src/components/PdfPreviewModal.tsx`
- Create: `frontend/src/components/PdfPreviewModal.test.tsx`

- [ ] **Step 1: Write failing test**

`frontend/src/components/PdfPreviewModal.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import PdfPreviewModal from "./PdfPreviewModal";

const REQUEST = {
  child_name: "Maya",
  reading_level: "3" as const,
  genre: "fiction" as const,
  pages: 1,
  include_drawing_box: false,
};

const STATE = {
  story_id: "a",
  topic: "Soccer",
  status: "done" as const,
  text: "Body.",
  appropriate: true,
  attempts: 1,
};

function mockExportReturnsPdfBlob() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])])),
  );
}

beforeEach(() => {
  global.URL.createObjectURL = vi.fn(() => "blob:mock");
  global.URL.revokeObjectURL = vi.fn();
});

describe("PdfPreviewModal", () => {
  it("renders header with title and shows embed after fetch", async () => {
    mockExportReturnsPdfBlob();
    render(
      <PdfPreviewModal
        open
        story={STATE}
        request={REQUEST}
        onClose={vi.fn()}
      />,
    );
    expect(
      await screen.findByText(/For Maya · Soccer/),
    ).toBeInTheDocument();
    await waitFor(() => {
      const embed = document.querySelector("embed");
      expect(embed?.getAttribute("src")).toBe("blob:mock");
    });
  });

  it("Cancel closes and revokes the blob URL", async () => {
    mockExportReturnsPdfBlob();
    const onClose = vi.fn();
    render(
      <PdfPreviewModal open story={STATE} request={REQUEST} onClose={onClose} />,
    );
    await screen.findByText(/For Maya · Soccer/);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  it("Esc closes the modal", async () => {
    mockExportReturnsPdfBlob();
    const onClose = vi.fn();
    render(
      <PdfPreviewModal open story={STATE} request={REQUEST} onClose={onClose} />,
    );
    await screen.findByText(/For Maya · Soccer/);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("Download saves the same blob without a second fetch", async () => {
    const fetchSpy = mockExportReturnsPdfBlob();
    render(
      <PdfPreviewModal open story={STATE} request={REQUEST} onClose={vi.fn()} />,
    );
    await screen.findByText(/For Maya · Soccer/);
    await userEvent.click(screen.getByRole("button", { name: /download/i }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("shows fallback when embed has zero height", async () => {
    mockExportReturnsPdfBlob();
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => 0,
    });
    render(
      <PdfPreviewModal open story={STATE} request={REQUEST} onClose={vi.fn()} />,
    );
    expect(
      await screen.findByText(/can't preview PDFs inline/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd frontend && npm test -- --run PdfPreviewModal`
Expected: import error.

- [ ] **Step 3: Implement `PdfPreviewModal`**

`frontend/src/components/PdfPreviewModal.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import type { Genre, ReadingLevel } from "../types";
import type { StoryCardState } from "./StoryCard";

interface RequestContext {
  child_name: string;
  reading_level: ReadingLevel;
  genre: Genre;
  pages: number;
  include_drawing_box: boolean;
}

interface Props {
  open: boolean;
  story: StoryCardState;
  request: RequestContext;
  onClose: () => void;
}

export default function PdfPreviewModal({
  open,
  story,
  request,
  onClose,
}: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [embedFailed, setEmbedFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const embedRef = useRef<HTMLEmbedElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    fetch("/api/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        format: "pdf",
        child_name: request.child_name,
        topic: story.topic,
        genre: request.genre,
        text: story.text ?? "",
        reading_level: request.reading_level,
        pages: request.pages,
        include_drawing_box: request.include_drawing_box,
      }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("export failed");
        return r.blob();
      })
      .then((b) => {
        if (!active) return;
        setBlob(b);
        setBlobUrl(URL.createObjectURL(b));
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [open, story.story_id]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, blobUrl]);

  useEffect(() => {
    if (!blobUrl || !embedRef.current) return;
    const t = setTimeout(() => {
      if (embedRef.current && embedRef.current.clientHeight === 0) {
        setEmbedFailed(true);
      }
    }, 100);
    return () => clearTimeout(t);
  }, [blobUrl]);

  function close() {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setBlob(null);
    setEmbedFailed(false);
    onClose();
  }

  function download() {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${request.child_name}_${story.topic}.pdf`.replace(
      /\s+/g,
      "_",
    );
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-modal-title"
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal">
        <header>
          <h2 id="pdf-modal-title">
            For {request.child_name} · {story.topic}
          </h2>
          <button aria-label="Close" onClick={close}>
            ×
          </button>
        </header>
        <div className="modal-body">
          {error && <p className="error">Couldn't generate PDF. Try again.</p>}
          {!error && blobUrl && !embedFailed && (
            <embed
              ref={embedRef}
              type="application/pdf"
              src={blobUrl}
              width="100%"
              height="100%"
            />
          )}
          {!error && blobUrl && embedFailed && (
            <p>Your browser can't preview PDFs inline. Download to view.</p>
          )}
          {!error && !blobUrl && <p>Loading preview…</p>}
        </div>
        <footer>
          <button onClick={close}>Cancel</button>
          <button autoFocus onClick={download} disabled={!blob}>
            Download
          </button>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd frontend && npm test -- --run PdfPreviewModal`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PdfPreviewModal.tsx frontend/src/components/PdfPreviewModal.test.tsx
git commit -m "feat(frontend): add PdfPreviewModal with embed and inline-render fallback"
```

---

## Phase 14 — App wiring & manual smoke test

### Task 14.1: `App.tsx` — wire form → SSE → list → modal

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css` (optional minimal styles)

- [ ] **Step 1: Replace `App.tsx` with the wired shell**

`frontend/src/App.tsx`:

```tsx
import { useState } from "react";
import RequestForm from "./components/RequestForm";
import StoryList from "./components/StoryList";
import PdfPreviewModal from "./components/PdfPreviewModal";
import { streamSse } from "./lib/sse";
import type { GenerateRequest, SseEvent } from "./types";
import type { StoryCardState } from "./components/StoryCard";
import "./App.css";

export default function App() {
  const [request, setRequest] = useState<GenerateRequest | null>(null);
  const [events, setEvents] = useState<AsyncGenerator<SseEvent> | null>(null);
  const [previewStory, setPreviewStory] = useState<StoryCardState | null>(null);

  function handleSubmit(req: GenerateRequest) {
    setRequest(req);
    setEvents(streamSse("/api/generate", req));
  }

  return (
    <main>
      <h1>AI Learning Tools</h1>
      <RequestForm onSubmit={handleSubmit} />
      {request && events && (
        <StoryList
          events={events}
          request={request}
          onPreviewPdf={(s) => setPreviewStory(s)}
        />
      )}
      {previewStory && request && (
        <PdfPreviewModal
          open
          story={previewStory}
          request={request}
          onClose={() => setPreviewStory(null)}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Ensure the full test suite passes**

Run: `cd frontend && npm test -- --run`
Expected: all frontend tests pass.

Run: `cd backend && uv run pytest -q`
Expected: all backend tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(frontend): wire App.tsx — form, SSE, list, modal"
```

### Task 14.2: Manual smoke test in the browser

**Files:** (no edits)

- [ ] **Step 1: Start the backend**

In one terminal:

```bash
cd /Users/cassidycoombs/personal/ai-learning-tools
make backend-dev
```

Expected: uvicorn boots on `:8000`, logs no startup errors.

- [ ] **Step 2: Start the frontend**

In a second terminal:

```bash
make frontend-dev
```

Expected: Vite serves on `:5173`.

- [ ] **Step 3: Submit a real request and observe**

Open `http://localhost:5173`. Enter `Maya`, reading level `3`, fiction, 2 pages, drawing-box on. Expand Sports → check `Soccer`. Add a custom topic `Curling`. Click **Generate**.

Confirm in the browser:
- Two cards appear (Soccer, Curling) with "Generating…" skeletons.
- Each card finalizes with body text and either no badge or a "Couldn't confirm" badge.
- **Download as Word** saves a `.docx` file named `Maya_Soccer.docx`.
- **Download as PDF** opens the modal; the PDF preview embed renders; **Download** in the modal saves the PDF.
- **Download all as Word** and **Download all as PDF** in the header each save a `Maya_stories.zip` containing both stories.

- [ ] **Step 4: Update README with the verified flow**

Edit `README.md`: replace the `## Develop` section with a confirmed walkthrough (steps the reader can copy). Keep it short.

- [ ] **Step 5: Final commit**

```bash
git add README.md
git commit -m "docs: confirm end-to-end flow in README"
```

---

## Self-review notes (from the planner)

- **Spec coverage check:** every component from the spec maps to a task — Settings + retry caps (2.2 / `config.py`) and editorial constants (2.2 / `pedagogy.py`, grown by Tasks 4.1 and 8.2), schemas (2.3), generator + prompts (3.1/3.2), evaluator with v1 snapshot prompts + band-to-grade mapping + transport retries (1.1 + 4.1), pipeline + retries + evaluator-unavailable short-circuit (5.1), orchestrator + SSE (6.1/6.2), presets (6.2), docx (7.1), pdf with `split_into_pages` + drawing box + font sizes (8.1/8.2), single-file export route (8.3), bundle zip (9.1), RequestForm with drawing-box helper text (11.1), StoryList + bundle buttons (12.2), StoryCard with warning badge + helper text (12.1), PdfPreviewModal with embed/fallback/Esc/backdrop (13.1), App wiring (14.1), manual smoke (14.2).
- **Tests cover all spec testing-strategy bullets:** evaluator band-mapping + prompt-version selectability + transport retries + "evaluator unavailable" + revision-guidance-vs-scaffolding-needed audience separation (4.1); generator fiction-only-name and feedback-injection and word-count doubling (3.2); pipeline four key paths (5.1); api SSE event sequence and presets (6.2); docx round-trip + ignored layout fields (7.1); `split_into_pages` exact-count + sentence boundaries + balance (8.1); PDF page count + signature + drawing-box rectangle + font-size table (8.2); bundle zip filename + content (9.1); RequestForm validation + custom topics + drawing-box flag (11.1); StoryList feed + bundle calls (12.2); PdfPreviewModal flow + Esc + fallback + reuse-blob (13.1).
- **Sequencing:** the v1 rubric snapshot already lives at
  `backend/app/evaluator_prompts/grade-level/v1/{system,user}.txt`
  (committed during repo setup, byte-identical to upstream). Task 4.1
  reads from there directly. The vendor submodule remains read-only.
- **Cross-cutting refactors applied after the initial spec:** the
  evaluator was switched from OpenAI to Gemini 2.5 Pro (via
  `langchain-google-genai`) to match the upstream calibration. The
  Gemini judge returns rubric *bands* (`K-1, 2-3, ...`), so Task 4.1
  introduces a `GRADE_TO_BAND` mapping (added to `pedagogy.py` as
  Step 0 of that task). `EvalResult.matched` was renamed to
  `EvalResult.appropriate` everywhere it appears (schema, SSE wire,
  frontend types, story-card state). And `WORDS_PER_PAGE` /
  `FONT_SIZES` / `GRADE_TO_BAND` all live in `app/pedagogy.py` —
  consumer modules import them, never redeclare.
- **Evaluator JSON contract split into two audiences (Task 4.1):** the
  upstream Learning Commons rubric's `scaffolding_needed` field is
  narrowly defined as teacher-facing supports (pictures, pre-teaching,
  read-aloud) that let students at a *lower* `alternative_grade` band
  still engage with the text. Feeding that string back to Claude as
  "revise the next draft" was both wrong-audience (Claude can't show a
  picture) and asymmetric (empty when the text is too easy). The JSON
  footer in `evaluator.py` now also asks Gemini for a separate
  `revision_guidance` field — concrete suggestions for revising the
  text itself, symmetric in direction. `_build_feedback` composes the
  Claude-facing feedback string from `reasoning + alternative_grade +
  revision_guidance` and deliberately **excludes** `scaffolding_needed`,
  which is still parsed off the JSON for a future teacher-facing
  surface (see docs/v2-ideas.md "Scaffolding playbook"). The
  pipeline's contract is unchanged — it still treats `result.feedback`
  as opaque text and `"evaluator unavailable"` as the short-circuit
  sentinel — so no Phase 5+ code blocks need adaptation.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/specs/2026-05-30-learning-tools-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints.
