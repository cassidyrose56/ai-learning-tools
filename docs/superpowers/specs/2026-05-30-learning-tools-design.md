# AI Learning Tools — Design

**Date:** 2026-05-30
**Status:** Draft, pending implementation plan

## Overview

A web app that generates K–5 reading material for teachers. The teacher enters a
student's name and reading level, picks one or more topics from preset categories
(with the option to add custom topics), chooses fiction or non-fiction, and
specifies how many pages they want. The backend generates one story per topic
using Claude, then uses the Learning Commons grade-level evaluator as a
background quality check, retrying up to 3 times if the evaluator says the
generated text doesn't match the requested reading level. Results stream into
the UI as each story finishes. Stories can be downloaded individually (Word
or PDF) or as a zip for the whole batch.

No persistence, no accounts. Each generation is ephemeral.

## Goals

- Teachers get on-grade-level reading material in seconds, personalized to a student.
- Reading level matches the requested target, verified by an independent judge.
- Topic variety: each selected topic produces its own story.
- Output is easy to take into the classroom (Word or PDF download).

## Non-goals (v1)

- Authentication / per-user accounts.
- Persistence or generation history.
- Streaming the *text* of a single story token-by-token (we stream story-by-story).
- A prompt-tuning UI; rubric and templates are file-based.
- Production deployment configuration.

## Architecture

```
┌─────────────────┐      HTTP/SSE       ┌──────────────────────────────┐
│  React frontend │  ◀──────────────▶   │  FastAPI backend             │
│  (Vite)         │                     │                              │
│                 │                     │  ┌─ /api/generate (SSE) ──┐  │
│  - Input form   │                     │  │   orchestrator         │  │
│  - Live list    │                     │  │   ├─ generator (Claude)│  │
│  - Story cards  │                     │  │   └─ evaluator (Gemini)│  │
│  - Export btns  │                     │  └────────────────────────┘  │
└─────────────────┘                     │  ┌─ /api/export ──────────┐  │
                                        │  │   docx / pdf renderers │  │
                                        │  └────────────────────────┘  │
                                        │  vendor/evaluators (submod)  │
                                        └──────────────────────────────┘
```

- **Frontend**: Vite + React + TypeScript. Single page, no routing.
- **Backend**: FastAPI, async. One SSE route for generation, two endpoints for export.
- **Evaluator integration**: `learning-commons-org/evaluators` is vendored as
  a git submodule at `vendor/evaluators` (read-only — we never mutate the
  submodule's tree). The grade-level rubric prompts (`system.txt` and
  `user.txt`) are *snapshotted* into our own tree at
  `backend/app/evaluator_prompts/grade-level/v1/`. `backend/app/evaluator.py`
  reads the prompts from there (versioned subdirectory selected by
  `Settings.evaluator_prompt_version`) and calls Gemini 2.5 Pro per the
  upstream notebook's pattern. Trade-off: we can iterate on the prompts
  (a future `v2/` sibling) without polluting the submodule, but picking up
  an upstream rubric improvement is a manual sync (re-copy from the
  submodule after `git submodule update --remote`). Same act of judgment as
  bumping the submodule, just made explicit.
- **No DB.** State lives in the user's browser for the lifetime of the session.

## Inputs (UI form)

> **Note — Drawing box is PDF-only.** The drawing-box layout is a
> reportlab feature of the PDF renderer. Word downloads are plain text
> by design (see the Export section) and do **not** include the
> drawing box, even if the teacher has the box checkbox enabled. The
> form's drawing-box checkbox should display this caveat as helper
> text directly under the field so the teacher isn't surprised when
> they open a Word file later.


- **Student's name** — free text, required.
- **Reading level** — dropdown, `K | 1 | 2 | 3 | 4 | 5`. Label framed as
  *reading level*, not enrolled grade, so it accommodates students reading
  above or below their grade.
- **Genre** — radio, `fiction | non-fiction`.
- **Pages** — number, required, ≥ 1.
- **Drawing box** — checkbox, *"Add a blank box for the student to draw
  a picture"*. PDF-only (see note above). The toggle also affects the
  per-page word count the backend targets (see Words-per-page table
  below). Helper text under the checkbox: *"The drawing box appears
  only in PDF downloads. Word downloads are plain text."*
- **Topics** — preset categories that expand to ~6 subtopic chips each, plus
  an "Add custom" input per category. The flat list of selected subtopics
  (preset + custom) is what's sent to the backend. One story per subtopic.

Preset catalog (served from `GET /api/presets` so it lives backend-side):

```python
PRESETS = {
  "Sports":   ["Soccer","Basketball","Baseball","Football","Tennis","Swimming"],
  "Animals":  ["Dogs","Cats","Dinosaurs","Sharks","Birds","Insects"],
  "Space":    ["Planets","Stars","Astronauts","The Moon","Black Holes","Rockets"],
  "History":  ["Ancient Egypt","Vikings","Wild West","Knights","Pirates","Inventors"],
  "Nature":   ["Forests","Oceans","Mountains","Weather","Plants","Rivers"],
  "Vehicles": ["Cars","Trains","Airplanes","Boats","Construction","Spaceships"],
}
```

## Components

### Backend (`backend/app/`)

- **`main.py`** — FastAPI app, CORS, routes: `POST /api/generate` (SSE),
  `GET /api/presets`, `POST /api/export`, `POST /api/export/bundle`.
- **`schemas.py`** — Pydantic models for request/response/events.
- **`config.py`** — Reads `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`,
  `EVALUATOR_PROMPT_VERSION` (defaults to `"v1"`), retry caps, Claude model
  ID (default `claude-sonnet-4-6`), Gemini model ID (default
  `gemini-2.5-pro`), and the words-per-page lookup. The values are split
  by drawing-box state
  because the "box on" numbers match conventional leveled-reader page
  counts (which already include illustration space) and the "box off"
  numbers are ~2× larger to fill the freed-up page area:

  ```python
  WORDS_PER_PAGE = {
      # (reading_level, include_drawing_box): words per page
      ("K", True):  20,  ("K", False):  40,
      ("1", True):  40,  ("1", False):  80,
      ("2", True):  70,  ("2", False): 140,
      ("3", True): 100,  ("3", False): 200,
      ("4", True): 150,  ("4", False): 300,
      ("5", True): 200,  ("5", False): 400,
  }
  MAX_RETRIES = 3
  EVALUATOR_TRANSPORT_RETRIES = 3
  ```

  This is the single source of truth — no UI override in v1. The
  backend computes
  `target_words = pages × WORDS_PER_PAGE[(reading_level, include_drawing_box)]`.
  The drawing-box flag also flows to the PDF renderer to draw the box.

- **`generator.py`** — `generate_story(topic, reading_level, target_words,
  genre, child_name, feedback=None) -> str`. Wraps the Anthropic SDK. Prompt
  assembled from a Jinja2 template (`prompts/fiction.j2` or
  `prompts/non_fiction.j2`). For fiction the `child_name` is injected into the
  system prompt as the protagonist's name; for non-fiction it is *not* sent.
  Prior-attempt evaluator feedback, when present, is appended as a revision
  instruction.
- **`evaluator.py`** — `evaluate_grade_level(text, target_reading_level) ->
  EvalResult(matched: bool, predicted_grade: str | None, feedback: str)`.
  Loads the system + user prompts from
  `backend/app/evaluator_prompts/grade-level/<Settings.evaluator_prompt_version>/`
  at startup. Calls Gemini 2.5 Pro via `langchain-google-genai`
  (`ChatGoogleGenerativeAI(model="gemini-2.5-pro", temperature=0.25,
  timeout=120)`), mirroring the upstream notebook. The judge returns
  structured JSON `{reasoning, grade, alternative_grade,
  scaffolding_needed}` where `grade` and `alternative_grade` are **grade
  *bands*** (`K-1, 2-3, 4-5, 6-8, 9-10, 11-CCR`), not single grades.

  Band-to-grade mapping for `matched`: we expand the teacher's single-grade
  target (`K|1|2|3|4|5`) to the band the rubric uses for that grade
  (`K → K-1`, `1 → K-1`, `2 → 2-3`, `3 → 2-3`, `4 → 4-5`, `5 → 4-5`) and
  set `matched = (predicted_band == expected_band)`. `predicted_grade` on
  the wire carries the returned band string (e.g. `"2-3"`) — we kept the
  field name for back-compat with SSE events but the value is a band, not
  a single grade. On a mismatch, `feedback` is built from
  `reasoning + alternative_grade + scaffolding_needed` so the revision
  prompt to Claude has actionable diagnosis, not just chain-of-thought.

  Transport behavior unchanged: retries the Gemini call up to
  `EVALUATOR_TRANSPORT_RETRIES` times with exponential backoff (0.5s, 1s,
  2s) on transient errors (network failures, 5xx, rate-limit, malformed
  JSON). If all retries fail, returns `EvalResult(matched=False,
  predicted_grade=None, feedback="evaluator unavailable")`.
- **`pipeline.py`** — `run_topic(topic, params, queue)`. For each topic:

  ```
  emit "started"
  wpp = WORDS_PER_PAGE[(reading_level, include_drawing_box)]
  target_words = pages * wpp
  feedback = None
  for attempt in 1..MAX_RETRIES:
      emit "attempt"
      text = await generator.generate_story(..., feedback=feedback)
      eval_result = await evaluator.evaluate_grade_level(text, reading_level)
      if eval_result.matched:
          emit "done"(matched=True, attempts=attempt); return
      if eval_result.feedback == "evaluator unavailable":
          break    # don't burn more generations on a dead judge
      feedback = eval_result.feedback
  emit "done"(matched=False, attempts=attempt, text=last_text)
  ```

- **`orchestrator.py`** — Fans out N topics with `asyncio.gather`. Each
  `run_topic` writes into a shared `asyncio.Queue`. The SSE handler drains
  the queue, so the fastest-finishing story shows up first regardless of
  topic order.
- **`export.py`** — two renderers with different ambitions:
  - **`render_docx(story) -> bytes`** (python-docx): plain Word document.
    Title line (`"For <child_name>"` plus the topic), then paragraphs. No
    page-fill logic, no drawing box, no font-size tuning. We rely on
    Word's defaults. Rationale: python-docx can't measure rendered layout,
    so any "pre-formatting" we do is guess-work that the teacher would
    have to redo anyway.
  - **`render_pdf(story, layout) -> bytes`** (reportlab): pre-formatted
    PDF designed to be printed and handed to a student. Layout
    parameters:
    - Body font size derived from reading level:
      `K:24pt, 1:20pt, 2:18pt, 3:16pt, 4:14pt, 5:14pt`.
    - Page margins ~0.75".
    - Story split into `pages` chunks by `split_into_pages(text, n)`,
      one chunk per page with a page break between. Each chunk packs
      as many whole sentences as possible toward an even
      `total_words / pages` target; cuts are only allowed at sentence
      boundaries, so a chunk is **a group of consecutive sentences**,
      never a single sentence and never a mid-sentence break.
    - If `include_drawing_box` is true, each page renders a bordered
      rectangle in the top ~45% of the page; text fills the bottom ~55%.
      Otherwise text uses the full page area.

### Frontend (`frontend/src/`)

- **`App.tsx`** — Page shell.
- **`components/RequestForm.tsx`** — Form: student name, reading level (K–5
  dropdown), genre radio, pages number, collapsible category groups with
  subtopic chips and per-category "Add custom" input. Submit POSTs to
  `/api/generate` and opens the SSE stream.
- **`components/StoryList.tsx`** — Scrolling list, keyed by `story_id`. One
  `StoryCard` per topic, appearing as `started` events arrive. Header
  contains **Download all as Word** and **Download all as PDF** buttons
  (each calls `/api/export/bundle` and downloads a `.zip` of the
  individual files).
- **`components/StoryCard.tsx`** — Skeleton on `started`, final text on
  `done`, small warning badge if `matched: false`. Two buttons:
  **Download as Word** (direct download, plain text) and **Download as
  PDF** (opens the PDF preview modal — see below). Small explanatory
  line below the buttons: *"PDFs are pre-formatted for printing. Word
  docs are plain text — apply your own formatting after download."*

- **`components/PdfPreviewModal.tsx`** — Centered modal that lets the
  teacher review a story's pre-formatted PDF before downloading it.

  **Flow**
  1. Click **Download as PDF** on a card.
  2. Button enters a loading state (spinner + "Loading preview…"), disabled.
  3. `POST /api/export` returns the PDF bytes; the modal opens.

  **Layout** (~85vw × 90vh, centered over a dark backdrop, body scroll locked):

  ```
  ┌──────────────────────────────────────────────────────────┐
  │  For Maya · "Soccer"                                   ×  │  header
  ├──────────────────────────────────────────────────────────┤
  │                                                          │
  │   ┌────────────────────────────────────────────┐         │
  │   │ native browser PDF viewer                  │         │
  │   │ (scroll, zoom, page nav, print, keyboard   │         │  body
  │   │  shortcuts come for free via <embed>)      │         │
  │   └────────────────────────────────────────────┘         │
  │                                                          │
  ├──────────────────────────────────────────────────────────┤
  │                            [ Cancel ]   [ Download ]      │  footer
  └──────────────────────────────────────────────────────────┘
  ```

  - **Header**: title (`"For <child_name> · <topic>"`) + close (×) button.
  - **Body**: `<embed type="application/pdf" src=blob:…>` over the
    fetched blob URL. We rely on the browser's native PDF viewer
    rather than building our own.
  - **Footer**:
    - **Cancel** → closes the modal, revokes the blob URL.
    - **Download** → saves the same blob as
      `<student_name>_<topic>.pdf` (no second backend request).
  - **Dismiss** via ×, Cancel, Esc, or backdrop click.
  - **Focus**: first focus = Download (primary action); focus is
    trapped inside the modal; closing restores focus to the
    originating button.

  **Edge cases**
  - **Browser can't render PDFs inline** (common on mobile): after the
    `<embed>` mounts, if its rendered height is zero, replace the body
    with *"Your browser can't preview PDFs inline. Download to view."*
    and leave the Download button active.
  - **Fetch error**: button returns to idle, inline error on the card
    (*"Couldn't generate PDF. Try again."*).
  - **Reopen**: no caching across opens — closing revokes the blob,
    reopening triggers a fresh `POST /api/export`. Simpler state.

  **A11y**: `role="dialog"`, `aria-modal="true"`,
  `aria-labelledby` pointing at the header title. Esc closes; Tab
  cycles within the modal only.
- **`lib/sse.ts`** — `fetch`-plus-`ReadableStream` helper, because native
  `EventSource` doesn't support POST bodies.
- **`types.ts`** — Shared types mirroring `schemas.py`.

### Vendored evaluator (`vendor/evaluators/`)

Git submodule pointing at `https://github.com/learning-commons-org/evaluators`.
Our adapter in `backend/app/evaluator.py` is the only code that reads from this
path; the rest of the backend treats grade-level checking as a single function
call.

## Data flow

### Generate request

`POST /api/generate`

```json
{
  "child_name": "Maya",
  "reading_level": "3",
  "genre": "fiction",
  "pages": 2,
  "include_drawing_box": true,
  "topics": ["Soccer", "Dinosaurs", "The Moon"]
}
```

`include_drawing_box` defaults to `false`. The per-page word count is
not part of the request in v1 — it's looked up from `WORDS_PER_PAGE`
using `(reading_level, include_drawing_box)`.

Response: `text/event-stream`. Each event is `event: <type>\ndata: <json>\n\n`.

| event       | data                                                                   | when                          |
|-------------|------------------------------------------------------------------------|-------------------------------|
| `started`   | `{ story_id, topic }`                                                  | each topic begins             |
| `attempt`   | `{ story_id, attempt }`                                                | each generate+evaluate cycle  |
| `done`      | `{ story_id, text, predicted_grade, matched, attempts }`               | topic finished                |
| `error`     | `{ story_id, message }`                                                | unrecoverable error for one topic; others continue |
| `complete`  | `{}`                                                                   | all topics finished           |

`story_id` is a server-issued UUID, used by the frontend to key cards and
update them as events arrive.

### Error handling

- **Generator API error**: one immediate retry; if it still fails, emit
  `error` for that `story_id` only — the rest of the batch continues.
- **Evaluator API error**: 3 transport retries with backoff inside
  `evaluator.evaluate_grade_level` itself. If all 3 fail, that attempt is
  treated as "unconfirmed" with `feedback="evaluator unavailable"`, and the
  pipeline breaks out of the outer retry loop (no point burning more Claude
  calls on a dead judge). The story still goes out with the warning badge.
- **Stream-level error**: emit `error` with `story_id: null`, close the stream.

### Personalization rule

- `genre == "fiction"`: child's name is in the prompt; story features them
  as a character.
- `genre == "non-fiction"`: name is *not* sent to the generator. The
  frontend renders "For Maya" as a card header for context only.

### Export

- `POST /api/export` — body:
  `{ format: "docx" | "pdf", child_name, topic, genre, text,
     reading_level, pages, include_drawing_box }`.
  Returns the file with filename `<student_name>_<topic>.<ext>`.
  - For `format: "docx"`: a plain Word file. Layout fields
    (`reading_level`, `pages`, `include_drawing_box`) are ignored.
  - For `format: "pdf"`: pre-formatted per `render_pdf`. Same endpoint
    is used by the in-app **PDF preview** — the frontend fetches the
    PDF bytes once, displays them inline (e.g., `<embed type="application/pdf">`
    or `<iframe>` over an object URL), and reuses the same blob for
    the "Download" action so there's no second request.
- `POST /api/export/bundle` — body:
  `{ format: "docx" | "pdf", stories: [{ child_name, topic, genre, text,
     reading_level, pages, include_drawing_box }, ...] }`.
  Returns a `.zip` containing one file per story in the chosen format,
  each named `<student_name>_<topic>.<ext>`. No preview for bundles —
  the per-story preview is the place to verify layout before fanning
  out.

**UI note on formats:** below the download buttons on each card, a small
explanatory line: *"PDFs are pre-formatted for printing. Word docs are
plain text — apply your own formatting after download."*

## Project layout

```
ai-learning-tools/
├── backend/
│   ├── pyproject.toml          # uv-managed: fastapi, uvicorn, anthropic,
│   │                           #   langchain-google-genai, jinja2, httpx,
│   │                           #   pydantic, python-docx, reportlab
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── schemas.py
│   │   ├── generator.py
│   │   ├── evaluator.py
│   │   ├── pipeline.py
│   │   ├── orchestrator.py
│   │   ├── export.py
│   │   ├── prompts/
│   │   │   ├── fiction.j2
│   │   │   └── non_fiction.j2
│   │   └── evaluator_prompts/
│   │       └── grade-level/
│   │           └── v1/
│   │               ├── system.txt   # snapshot from upstream
│   │               └── user.txt
│   └── tests/
│       ├── test_generator.py
│       ├── test_evaluator.py
│       ├── test_pipeline.py
│       ├── test_export.py
│       └── test_api.py
├── frontend/
│   ├── package.json            # vite, react, typescript, vitest, RTL
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/{RequestForm,StoryList,StoryCard}.tsx
│   │   ├── lib/sse.ts
│   │   └── types.ts
│   └── tests/{RequestForm,StoryList}.test.tsx
├── vendor/
│   └── evaluators/             # git submodule
├── docs/
│   └── superpowers/specs/2026-05-30-learning-tools-design.md
├── .env.example                # ANTHROPIC_API_KEY, GOOGLE_API_KEY,
│                               #   OPENAI_API_KEY (reserved for v2)
├── Makefile                    # make dev / make test / make lint
└── README.md
```

## Testing strategy

TDD: write tests first for each module.

- **`test_evaluator.py`** — Mock `ChatGoogleGenerativeAI`. Verifies: parses
  well-formed judge JSON (`{reasoning, grade, alternative_grade,
  scaffolding_needed}`) into `EvalResult`; band-to-grade mapping
  (`K|1 → K-1`, `2|3 → 2-3`, `4|5 → 4-5`) determines `matched`; revision
  feedback string contains `alternative_grade` + `scaffolding_needed`, not
  just `reasoning`; retries 3× on transient errors with backoff; returns
  `"evaluator unavailable"` after exhausting transport retries; reads the
  system + user prompts from
  `backend/app/evaluator_prompts/grade-level/<version>/` (default `v1`).
- **`test_generator.py`** — Mock Anthropic client. Verifies: fiction prompt
  includes `child_name`; non-fiction prompt does *not*; prior evaluator
  `feedback` appears in the next-attempt prompt; word-count target derived
  from `pages × WORDS_PER_PAGE[(reading_level, include_drawing_box)]`
  (test both box-on and box-off rows to confirm the doubling).
- **`test_pipeline.py`** — Inject fake generator/evaluator. Four key paths:
  matched on attempt 1; matched on attempt 3 after two mismatches; capped at
  3 with `matched=False`; evaluator-unavailable short-circuits the outer
  loop.
- **`test_api.py`** — FastAPI `TestClient`. Verifies: `POST /api/generate`
  returns `text/event-stream`; emits `started`/`attempt`/`done`/`complete`
  for a 2-topic batch; an `error` for one topic doesn't terminate the
  stream; `GET /api/presets` returns the catalog.
- **`test_export.py`** —
  - Word: a generated `.docx` opens via python-docx round-trip and
    contains the title block + body paragraphs. Layout fields
    (`include_drawing_box`, etc.) are ignored without error.
  - PDF: a generated `.pdf` parses (PDF signature + non-trivial length);
    `pages=3` produces 3 PDF pages; `include_drawing_box=true` renders
    a drawing rectangle on each page (verified by inspecting the PDF
    content stream for the rect operator); body font size matches the
    reading-level table.
  - `split_into_pages(text, n)` returns exactly `n` chunks, each a
    group of consecutive whole sentences (never a single sentence per
    chunk, never a mid-sentence break); chunk word counts are roughly
    balanced toward `total_words / n`.
  - Bundle zip contains exactly N files in the chosen format, named
    `<student_name>_<topic>.<ext>`. Filename helper sanitizes whitespace
    to underscores and strips characters unsafe for filesystems.
- **Frontend `RequestForm.test.tsx`** — RTL: form validates (name + ≥1
  topic + pages ≥ 1); category expansion reveals subtopic chips; custom
  topic input appends to the flat `topics` list; the drawing-box
  checkbox toggles the `include_drawing_box` flag in the submitted
  payload.
- **Frontend `StoryList.test.tsx`** — Feed a scripted SSE event sequence;
  verify a card appears on `started`, updates on `attempt`, finalizes on
  `done`, shows the warning badge when `matched: false`, and that the
  download buttons call the right endpoints.
- **Frontend `PdfPreviewModal.test.tsx`** — RTL: clicking "Download as
  PDF" puts the button in a loading state and calls `POST /api/export`
  once; the modal opens with the header title `"For <name> · <topic>"`;
  the in-modal **Download** button saves the same blob without a
  second backend request; Cancel, ×, Esc, and backdrop click all
  close the modal; the inline-render fallback message appears when
  the embed reports zero height; focus returns to the originating
  card button on close.

## Open dependencies

- Anthropic API key and Google API key (both via `.env`). An
  `OPENAI_API_KEY` slot is kept in `.env.example` and marked unused in
  v1 — it's reserved for the additional Learning Commons evaluators
  documented in `docs/v2-ideas.md`.
- Submodule URL pinned to `learning-commons-org/evaluators` `main` at the
  time of first init; documented in `README.md`. The submodule is read-only
  in our workflow — runtime prompts are read from
  `backend/app/evaluator_prompts/grade-level/<version>/`, snapshotted from
  the submodule manually.

## Risks & mitigations

- **Evaluator drift**: their rubric prompt may change. Because our
  snapshot lives in `backend/app/evaluator_prompts/grade-level/v1/`, an
  upstream improvement requires two explicit steps: bump the submodule
  (`git submodule update --remote`) and re-copy `system.txt` / `user.txt`
  into our v1 directory. This is intentional — keeps prompt changes
  reviewable in our diff.
- **Band-vs-grade resolution**: Gemini judges into bands (`K-1, 2-3,
  4-5, ...`) but our UI offers single grades. A grade-3 target is
  effectively "anywhere in 2-3" — the warning badge is less sensitive
  than a single-grade comparison would imply. Acceptable for v1; v2 may
  surface the band directly on the card.
- **Claude prompt + evaluator agreement**: the generator and judge use
  different model families (Anthropic Claude vs Google Gemini). If they
  systematically disagree on certain grades, the retry budget of 3 may
  not be enough. Mitigation: warning badge is honest about "couldn't
  confirm" rather than pretending success. If a real disagreement
  pattern emerges in testing, we tune the generator prompt — not the
  cap.
- **Long batches**: a teacher asking for 12 subtopics × 3 attempts is
  ~36 LLM calls plus ~36 evaluator calls. SSE streaming keeps the UX
  bearable; per-topic cap and bounded concurrency in the orchestrator
  prevent runaway cost. We may add a soft cap on `len(topics)` in the UI
  during implementation if needed.
