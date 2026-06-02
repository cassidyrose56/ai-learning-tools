# AI Learning Tools

K-5 reading material generator. See
`docs/superpowers/specs/2026-05-30-learning-tools-design.md` for the design
spec.

## Setup

1. `git submodule update --init --recursive`
2. Copy `.env.example` to `.env` and fill in `ANTHROPIC_API_KEY` and
   `GEMINI_API_KEY`. (`OPENAI_API_KEY` is unused in v1; leave the
   placeholder. It is reserved for v2 evaluators. See `docs/v2-ideas.md`.)
3. Backend: `cd backend && uv sync`
4. Frontend: `cd frontend && npm install`

## Develop

In two terminals:

```bash
make backend-dev    # uvicorn on http://localhost:8000
make frontend-dev   # vite on http://localhost:5173
```

End-to-end walkthrough (verified against the live stack):

1. Open `http://localhost:5173`.
2. Enter a student name (e.g. `Maya`), pick a reading level, fiction or
   non-fiction, page count, and toggle the drawing-box if you want one in
   the PDF.
3. Expand a category in the topic picker, check one or more presets, and
   optionally add a custom topic.
4. Click **Generate**. Each topic appears as a card with a skeleton, then
   resolves to the finished story. Cards that the evaluator could not
   confirm at the target reading level get a soft amber "Couldn't confirm
   reading level" badge; the story is still usable.
5. Per-story: **Download as Word** saves `{name}_{topic}.docx`. **Download
   as PDF** opens a preview modal; its **Download** button saves
   `{name}_{topic}.pdf`.
6. Bundle: **Download all as Word** / **Download all as PDF** save
   `{name}_stories.zip` containing one file per finished story.

## Test

- `make test` runs backend + frontend test suites.

## Updating the evaluator rubric

The runtime grade-level prompts live at
`backend/app/evaluator_prompts/grade-level/v1/{system,user}.txt`. They are a
byte-for-byte snapshot of the upstream Learning Commons submodule, kept
under our control so we can edit them (a future `v2/` sibling) without
mutating the submodule's working tree.

To pull an upstream prompt improvement:

```bash
git submodule update --remote vendor/evaluators
cp vendor/evaluators/evals/prompts/grade-level-appropriateness/system.txt \
   backend/app/evaluator_prompts/grade-level/v1/system.txt
cp vendor/evaluators/evals/prompts/grade-level-appropriateness/user.txt \
   backend/app/evaluator_prompts/grade-level/v1/user.txt
git add vendor/evaluators backend/app/evaluator_prompts
git commit -m "chore: bump evaluators submodule and refresh v1 snapshot"
```

To run with a different prompt version, set
`EVALUATOR_PROMPT_VERSION=v2` (or whatever) in your `.env`.
