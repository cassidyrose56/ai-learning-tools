# AI Learning Tools

K–5 reading material generator. See
`docs/superpowers/specs/2026-05-30-learning-tools-design.md` for the design
spec.

## Setup

1. `git submodule update --init --recursive`
2. Copy `.env.example` → `.env` and fill in `ANTHROPIC_API_KEY` and `GOOGLE_API_KEY`. (`OPENAI_API_KEY` is unused in v1 — leave the placeholder; it's reserved for v2 evaluators. See `docs/v2-ideas.md`.)
3. Backend: `cd backend && uv sync`
4. Frontend: `cd frontend && npm install`

## Develop

- `make backend-dev` (http://localhost:8000)
- `make frontend-dev` (http://localhost:5173)

## Test

- `make test` runs backend + frontend test suites.

## Updating the evaluator rubric

The runtime grade-level prompts live at
`backend/app/evaluator_prompts/grade-level/v1/{system,user}.txt`. They're a
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
