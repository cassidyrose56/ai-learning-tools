# AI Learning Tools

K–5 reading material generator. See
`docs/superpowers/specs/2026-05-30-learning-tools-design.md` for the design
spec.

## Setup

1. `git submodule update --init --recursive`
2. Copy `.env.example` → `.env` and fill in `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`.
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
