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
