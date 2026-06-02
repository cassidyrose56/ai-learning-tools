# UI iteration v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the 9-item v2 design pass: fix the light-mode native-widget color-scheme bug, adapt to the eggshell + twilight-indigo + burnt-peach + muted-teal + apricot-cream palette, fix the Pages input UX, replace the Hide/Show button with a chevron that gives a 5-line preview when collapsed, consolidate per-kid story sections into one cross-kid list with one shared bundle download, fix the PDF sentence-regex quote dropout, drop the PDF title, indent PDF paragraphs, and expand leading to fill the page.

**Architecture:** No backend endpoints change and no schemas change. Backend changes are confined to `app/export.py` (regex tweak + PDF render rewrite) and matching tests. Frontend changes touch `index.css`, `App.css`, `App.tsx` (which lifts story state up), `RequestForm.tsx` (controlled pages-as-string), `StoryCard.tsx` (chevron + line-clamp), `StoryList.tsx` (now pure-presentational), and a new `SessionStreamer.tsx` render-less component that owns the per-session SSE effect.

**Tech Stack:** Backend = Python 3.12 + FastAPI + reportlab + python-docx, tests via `uv run pytest`. Frontend = React 19 + TypeScript + Vite, tests via Vitest 4 + jsdom 29 + Testing Library.

---

## Cross-cutting rules (read once before every task)

These apply to all seven commits. Internalize them - they are house style and reviewer gates.

### A. Em-dash and en-dash policy

No `—` (U+2014) and no `–` (U+2013) anywhere in user-visible strings, anywhere in code, anywhere in tests, anywhere in docstrings shipped to users. Hyphen-minus (`-`) and a colon (`:`) are the substitutes.

Before every commit run:

```bash
git diff --cached --name-only -z | xargs -0 grep -nP '[–—]' || echo "OK: no em/en dashes"
```

If the output is anything other than `OK: no em/en dashes`, fix the strings and re-stage.

### B. Vitest 4 + jsdom 29 Blob bug

`new Response(new Blob([...]))` throws `blob.stream is not a function` in our test environment. Use `new Response("string-literal")` or `new Response(JSON.stringify(obj), { headers })` instead. Precedent: `frontend/src/components/StoryList.test.tsx` and `frontend/src/components/PdfPreviewModal.test.tsx`.

### C. Commit boundaries

Each commit (1 through 7) must leave the repo with a green test suite:

```bash
cd backend && uv run pytest -q
cd frontend && npm test -- --run
```

Run only the side(s) the commit touches; running both is fine but not required.

### D. Where the dev servers are

Backend on `http://localhost:8000`, frontend on `http://localhost:5173`. Check first with `lsof -nP -iTCP:8000 -iTCP:5173 -sTCP:LISTEN` before spawning new ones.

---

## File Structure (where the changes land)

```
frontend/src/index.css                              (Commit 1, 2)
frontend/src/App.css                                (Commit 2, 4)
frontend/src/components/RequestForm.tsx             (Commit 3)
frontend/src/components/RequestForm.test.tsx        (Commit 3)
frontend/src/components/StoryCard.tsx               (Commit 4)
frontend/src/components/StoryCard.test.tsx          (Commit 4)
frontend/src/components/SessionStreamer.tsx         (Commit 5, new)
frontend/src/components/StoryList.tsx               (Commit 5)
frontend/src/components/StoryList.test.tsx          (Commit 5)
frontend/src/App.tsx                                (Commit 5)
frontend/src/App.test.tsx                           (Commit 5)
backend/app/export.py                               (Commit 6, 7)
backend/tests/test_export.py                        (Commit 6, 7)
```

---

## Commit 1: Fix color-scheme so light mode controls stay light

`fix(frontend): bind color-scheme to active theme so native widgets stay light in light mode`

**Files:**
- Modify: `frontend/src/index.css`

### Task 1.1: Bind `color-scheme` to the data-theme attribute

- [ ] **Step 1.1.1: Locate the `color-scheme` declaration in `frontend/src/index.css`**

The current `:root { ... }` block (around line 1-57) ends with:

```css
  color-scheme: light dark;
  font-family: var(--sans);
  ...
}
```

- [ ] **Step 1.1.2: Edit `frontend/src/index.css` - change `color-scheme: light dark;` to `color-scheme: light;`**

Find:

```css
  color-scheme: light dark;
```

Replace with:

```css
  color-scheme: light;
```

- [ ] **Step 1.1.3: Add `color-scheme: dark;` to the `[data-theme="dark"]` block**

Find the existing `[data-theme="dark"] { ... }` block. Inside it, immediately after the opening brace and before the existing token definitions, add:

```css
[data-theme="dark"] {
  color-scheme: dark;

  --bg: #1F1B14;
  ...
```

(Keep the rest of the block intact for now - the palette tokens themselves will be replaced in Commit 2.)

- [ ] **Step 1.1.4: Add `color-scheme: dark;` to the media-query fallback block**

Find:

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --bg: #1F1B14;
    ...
```

Add `color-scheme: dark;` at the top of the inner block:

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    color-scheme: dark;
    --bg: #1F1B14;
    ...
```

### Task 1.2: Manual verification + commit

- [ ] **Step 1.2.1: Start the dev server if not already running**

Check: `lsof -nP -iTCP:5173 -sTCP:LISTEN`
If nothing is listening, run: `cd frontend && npm run dev`

- [ ] **Step 1.2.2: Visual smoke check**

In a browser (with the OS in dark mode for the strongest test), open http://localhost:5173.
- If the page is in dark mode, click "Switch to light".
- Confirm the "Add a drawing box" checkbox renders as a light/white square with a thin border (not a solid black square).
- Confirm the Genre radio buttons render as light/white circles (with the selected one filled).
- Open DevTools and check `<html>` has `data-theme="light"`.
- Click "Switch to dark" and confirm the widgets correctly flip dark.

- [ ] **Step 1.2.3: Run the frontend suite as a sanity check**

```bash
cd frontend && npm test -- --run
```

Expected: all suites green. (Pure CSS change; no tests affected.)

- [ ] **Step 1.2.4: Em-dash sweep**

```bash
grep -nP '[–—]' frontend/src/index.css || echo "OK: no em/en dashes"
```

Expected: `OK: no em/en dashes`.

- [ ] **Step 1.2.5: Stage and commit**

```bash
git add frontend/src/index.css
git commit -m "$(cat <<'EOF'
fix(frontend): bind color-scheme to active theme so native widgets stay light in light mode

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit 2: Adapt eggshell + indigo + burnt-peach palette

`style(frontend): adapt eggshell + indigo + burnt-peach palette`

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/App.css`

### Task 2.1: Replace light-mode tokens in `:root`

- [ ] **Step 2.1.1: Edit `frontend/src/index.css` - replace the light tokens**

Find the `:root { ... }` block (the section that defines `--bg`, `--surface`, `--ink`, `--accent`, etc.).

Replace the token block (everything from `--sans: ...` through the shadows, but BEFORE the `color-scheme:` / font-family declarations) with:

```css
  --sans:
    system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial,
    sans-serif;
  --serif:
    "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia,
    serif;
  --mono: ui-monospace, "SF Mono", Consolas, monospace;

  --bg: #F4F1DE;
  --surface: #FFFFFF;
  --surface-2: #EAE3C7;
  --surface-warm: #F8E1B8;
  --border: #DCD4B0;
  --border-strong: #C2B788;

  --ink: #1E1D2C;
  --ink-muted: #4A4D66;
  --ink-soft: #7B7E8F;

  --accent: #E07A5F;
  --accent-strong: #C8654A;
  --accent-bg: rgba(224, 122, 95, 0.14);
  --accent-border: rgba(224, 122, 95, 0.45);
  --accent-on: #1E1A14;

  --indigo: #3D405B;
  --indigo-strong: #2A2D44;

  --success: #81B29A;
  --success-bg: rgba(129, 178, 154, 0.20);

  --link-focus: #3D405B;

  --warning: #B25E45;
  --warning-bg: rgba(178, 94, 69, 0.14);
  --warning-border: rgba(178, 94, 69, 0.42);

  --error: #B25E45;
  --error-bg: rgba(178, 94, 69, 0.14);

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-pill: 999px;

  --shadow-sm: 0 1px 0 rgba(30, 26, 20, 0.04),
    0 2px 6px rgba(30, 26, 20, 0.06);
  --shadow-md: 0 1px 0 rgba(30, 26, 20, 0.05),
    0 6px 24px rgba(30, 26, 20, 0.1);
  --shadow-lg: 0 24px 64px rgba(30, 26, 20, 0.22);
```

(The `color-scheme: light;`, font/typography declarations, and the closing brace are preserved below this block.)

### Task 2.2: Replace dark-mode tokens

- [ ] **Step 2.2.1: Edit the `[data-theme="dark"]` block**

Replace the token body (keep `color-scheme: dark;` at the top) with:

```css
[data-theme="dark"] {
  color-scheme: dark;

  --bg: #1F1F2E;
  --surface: #2A2A3E;
  --surface-2: #34344A;
  --surface-warm: #3F3225;
  --border: #46465E;
  --border-strong: #5C5C76;

  --ink: #F4F1DE;
  --ink-muted: #BCB9A8;
  --ink-soft: #8C8A7A;

  --accent: #F09578;
  --accent-strong: #F2A88E;
  --accent-bg: rgba(240, 149, 120, 0.18);
  --accent-border: rgba(240, 149, 120, 0.45);
  --accent-on: #1F1F2E;

  --indigo: #8FA1D8;
  --indigo-strong: #A5B4E0;

  --success: #A0CFB8;
  --success-bg: rgba(160, 207, 184, 0.20);

  --link-focus: #8FA1D8;

  --warning: #E8A48E;
  --warning-bg: rgba(232, 164, 142, 0.18);
  --warning-border: rgba(232, 164, 142, 0.42);

  --error: #E8A48E;
  --error-bg: rgba(232, 164, 142, 0.18);

  --shadow-sm: 0 1px 0 rgba(0, 0, 0, 0.4),
    0 2px 6px rgba(0, 0, 0, 0.32);
  --shadow-md: 0 1px 0 rgba(0, 0, 0, 0.4),
    0 8px 28px rgba(0, 0, 0, 0.42);
  --shadow-lg: 0 24px 64px rgba(0, 0, 0, 0.62);
}
```

- [ ] **Step 2.2.2: Mirror the same tokens into the media-query fallback block**

Replace the body of `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { ... } }` with the exact same token values as Task 2.2.1 (keep `color-scheme: dark;` at the top, omit the closing brace of the outer media query - that stays intact):

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    color-scheme: dark;

    --bg: #1F1F2E;
    --surface: #2A2A3E;
    --surface-2: #34344A;
    --surface-warm: #3F3225;
    --border: #46465E;
    --border-strong: #5C5C76;

    --ink: #F4F1DE;
    --ink-muted: #BCB9A8;
    --ink-soft: #8C8A7A;

    --accent: #F09578;
    --accent-strong: #F2A88E;
    --accent-bg: rgba(240, 149, 120, 0.18);
    --accent-border: rgba(240, 149, 120, 0.45);
    --accent-on: #1F1F2E;

    --indigo: #8FA1D8;
    --indigo-strong: #A5B4E0;

    --success: #A0CFB8;
    --success-bg: rgba(160, 207, 184, 0.20);

    --link-focus: #8FA1D8;

    --warning: #E8A48E;
    --warning-bg: rgba(232, 164, 142, 0.18);
    --warning-border: rgba(232, 164, 142, 0.42);

    --error: #E8A48E;
    --error-bg: rgba(232, 164, 142, 0.18);

    --shadow-sm: 0 1px 0 rgba(0, 0, 0, 0.4),
      0 2px 6px rgba(0, 0, 0, 0.32);
    --shadow-md: 0 1px 0 rgba(0, 0, 0, 0.4),
      0 8px 28px rgba(0, 0, 0, 0.42);
    --shadow-lg: 0 24px 64px rgba(0, 0, 0, 0.62);
  }
}
```

### Task 2.3: Wire the new tokens through App.css

- [ ] **Step 2.3.1: Edit `frontend/src/App.css` - update the link color**

The current top-level `a { color: var(--accent-strong); ... }` rule lives in `index.css`. Change it from `--accent-strong` to `--indigo`:

Find in `frontend/src/index.css`:

```css
a {
  color: var(--accent-strong);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}
```

Replace with:

```css
a {
  color: var(--indigo);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}
```

- [ ] **Step 2.3.2: Edit `frontend/src/App.css` - hover state on Generate / modal Download**

Find in `App.css`:

```css
button[type="submit"]:hover:not(:disabled) {
  background: var(--ink);
  border-color: var(--ink);
}
```

Replace with:

```css
button[type="submit"]:hover:not(:disabled) {
  background: var(--accent-strong);
  border-color: var(--accent-strong);
}
```

And, for the modal's last footer button:

Find:

```css
.modal > footer > button:last-child:hover:not(:disabled) {
  background: var(--ink);
  border-color: var(--ink);
}
```

Replace with:

```css
.modal > footer > button:last-child:hover:not(:disabled) {
  background: var(--accent-strong);
  border-color: var(--accent-strong);
}
```

(Rationale: hovering a peach CTA into ink produces a near-black button that loses its identity. Hovering into the darker peach reads as a tonal step and keeps the peach identity.)

- [ ] **Step 2.3.3: Update the category-button hover**

Find:

```css
.categories > div > button:hover {
  color: var(--accent-strong);
  background: transparent;
}
```

Replace with:

```css
.categories > div > button:hover {
  color: var(--indigo);
  background: transparent;
}
```

(Indigo on cream reads as a clean text link.)

### Task 2.4: Visual verification + commit

- [ ] **Step 2.4.1: Start the dev servers if not already running**

```bash
lsof -nP -iTCP:8000 -iTCP:5173 -sTCP:LISTEN
```

If nothing on 8000 / 5173, run `cd backend && uv run uvicorn app.main:app --reload &` and `cd frontend && npm run dev &`.

- [ ] **Step 2.4.2: Visual smoke check**

Open http://localhost:5173. Confirm:
- Page background is the eggshell cream (slightly cooler than the previous marigold-cream).
- The Generate button is burnt peach with near-black ink.
- Focus rings (Tab through the form) are indigo.
- Switch to dark mode: background is deep indigo, ink is eggshell, the CTA is the lifted peach.
- Hover over the Generate button: it goes a step darker (peach-strong), not black.

- [ ] **Step 2.4.3: Run the frontend suite**

```bash
cd frontend && npm test -- --run
```

Expected: all suites green.

- [ ] **Step 2.4.4: Em-dash sweep**

```bash
grep -nP '[–—]' frontend/src/index.css frontend/src/App.css || echo "OK: no em/en dashes"
```

- [ ] **Step 2.4.5: Stage and commit**

```bash
git add frontend/src/index.css frontend/src/App.css
git commit -m "$(cat <<'EOF'
style(frontend): adapt eggshell + indigo + burnt-peach palette

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit 3: Pages input allows empty intermediate state

`fix(frontend): pages input allows empty intermediate state`

**Files:**
- Modify: `frontend/src/components/RequestForm.tsx`
- Modify: `frontend/src/components/RequestForm.test.tsx`

### Task 3.1: Failing test - empty + retyped value

- [ ] **Step 3.1.1: Add the failing test to `frontend/src/components/RequestForm.test.tsx`**

Append inside the `describe("RequestForm", ...)` block, before its closing `});`:

```tsx
it("pages input allows empty intermediate state and retyped digits do not pad", async () => {
  mockPresets();
  const onSubmit = vi.fn();
  render(<RequestForm onSubmit={onSubmit} />);
  await waitFor(() =>
    expect(screen.getByText(/Sports/)).toBeInTheDocument(),
  );

  const pagesInput = screen.getByLabelText(/pages/i) as HTMLInputElement;
  expect(pagesInput.value).toBe("2");

  // Backspace the default; input should be empty (not "0").
  await userEvent.clear(pagesInput);
  expect(pagesInput.value).toBe("");

  // Type a single digit; should not show "0" prefix.
  await userEvent.type(pagesInput, "5");
  expect(pagesInput.value).toBe("5");

  // Fill the rest of the form and submit; payload carries 5.
  await userEvent.type(screen.getByLabelText(/student.*name/i), "Maya");
  await userEvent.click(screen.getByRole("button", { name: /Sports/ }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Soccer" }));
  await userEvent.click(screen.getByRole("button", { name: /generate/i }));

  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit.mock.calls[0][0].pages).toBe(5);
});

it("pages input rejects submission when empty", async () => {
  mockPresets();
  const onSubmit = vi.fn();
  render(<RequestForm onSubmit={onSubmit} />);
  await waitFor(() =>
    expect(screen.getByText(/Sports/)).toBeInTheDocument(),
  );

  await userEvent.type(screen.getByLabelText(/student.*name/i), "Maya");
  await userEvent.click(screen.getByRole("button", { name: /Sports/ }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Soccer" }));
  await userEvent.clear(screen.getByLabelText(/pages/i));

  await userEvent.click(screen.getByRole("button", { name: /generate/i }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText(/pages must be at least 1/i)).toBeInTheDocument();
});
```

- [ ] **Step 3.1.2: Run to confirm failure**

```bash
cd frontend && npm test -- --run RequestForm
```

Expected: the two new tests FAIL (the `value` checks see `"0"` instead of `""`/`"5"`).

### Task 3.2: Implementation

- [ ] **Step 3.2.1: Edit `frontend/src/components/RequestForm.tsx` - widen the pages state type**

Find:

```tsx
  const [pages, setPages] = useState(2);
```

Replace with:

```tsx
  const [pages, setPages] = useState<number | "">(2);
```

- [ ] **Step 3.2.2: Edit the pages input - controlled onChange that accepts empty**

Find:

```tsx
      <label>
        Pages
        <input
          type="number"
          min={1}
          aria-invalid={errors.pages ? true : undefined}
          aria-describedby={errors.pages ? "err-pages" : undefined}
          value={pages}
          onChange={(e) => setPages(parseInt(e.target.value, 10) || 0)}
        />
      </label>
```

Replace with:

```tsx
      <label htmlFor="pages-input">
        Pages
        <input
          id="pages-input"
          type="number"
          min={1}
          aria-invalid={errors.pages ? true : undefined}
          aria-describedby={errors.pages ? "err-pages" : undefined}
          value={pages}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") return setPages("");
            const n = parseInt(v, 10);
            if (Number.isNaN(n)) return;
            setPages(n);
          }}
        />
      </label>
```

(The `htmlFor`/`id` pairing is what makes `screen.getByLabelText(/pages/i)` resolve to the input itself. Today the form's `<label>` wraps the input, which Testing Library also accepts, but the explicit pairing is sturdier and unambiguous.)

- [ ] **Step 3.2.3: Update the submit validation**

Find:

```tsx
    if (pages < 1) next.pages = "Pages must be at least 1.";
```

Replace with:

```tsx
    if (pages === "" || pages < 1) next.pages = "Pages must be at least 1.";
```

- [ ] **Step 3.2.4: Update the request payload to cast pages**

Find:

```tsx
    onSubmit({
      child_name: childName.trim(),
      reading_level: readingLevel,
      genre,
      pages,
      include_drawing_box: includeBox,
      topics: Array.from(selected),
    });
```

Replace with:

```tsx
    onSubmit({
      child_name: childName.trim(),
      reading_level: readingLevel,
      genre,
      pages: pages as number,
      include_drawing_box: includeBox,
      topics: Array.from(selected),
    });
```

(The validation above gates this cast: if we reach the `onSubmit` call, `pages` is a positive integer.)

- [ ] **Step 3.2.5: Re-run RequestForm tests**

```bash
cd frontend && npm test -- --run RequestForm
```

Expected: all RequestForm tests pass (the two new tests plus the existing five).

### Task 3.3: Em-dash sweep + commit

- [ ] **Step 3.3.1: Sweep**

```bash
grep -nP '[–—]' frontend/src/components/RequestForm.tsx frontend/src/components/RequestForm.test.tsx || echo "OK: no em/en dashes"
```

- [ ] **Step 3.3.2: Stage and commit**

```bash
git add frontend/src/components/RequestForm.tsx frontend/src/components/RequestForm.test.tsx
git commit -m "$(cat <<'EOF'
fix(frontend): pages input allows empty intermediate state

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit 4: Chevron toggle with 5-line collapsed preview

`feat(frontend): chevron toggle with 5-line collapsed preview`

**Files:**
- Modify: `frontend/src/components/StoryCard.tsx`
- Modify: `frontend/src/components/StoryCard.test.tsx`
- Modify: `frontend/src/App.css`

### Task 4.1: Failing test - body stays in the DOM but is clamped

- [ ] **Step 4.1.1: Update the existing toggle test in `frontend/src/components/StoryCard.test.tsx`**

Find the test `"toggles the story body with the Hide/Show button"` and replace its entire body with:

```tsx
it("collapses the story body to a 5-line preview and re-expands via the chevron", async () => {
  const userEvent = (await import("@testing-library/user-event")).default;
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
      onDismiss={vi.fn()}
    />,
  );

  const body = screen.getByText("Once upon a time.");
  expect(body).toBeInTheDocument();
  expect(body).not.toHaveClass("story-text--collapsed");

  // Default state is expanded; the button collapses.
  const collapseBtn = screen.getByRole("button", { name: /collapse story/i });
  await userEvent.click(collapseBtn);

  // Body is still in the DOM (so the bundle / actions still work) but is
  // visually clamped via the modifier class.
  const bodyAfter = screen.getByText("Once upon a time.");
  expect(bodyAfter).toHaveClass("story-text--collapsed");

  // The chevron flips to expand.
  const expandBtn = screen.getByRole("button", { name: /expand story/i });
  await userEvent.click(expandBtn);
  expect(screen.getByText("Once upon a time.")).not.toHaveClass(
    "story-text--collapsed",
  );
});
```

- [ ] **Step 4.1.2: Run to confirm failure**

```bash
cd frontend && npm test -- --run StoryCard
```

Expected: this test FAILS - the current implementation hides the body entirely when collapsed; `screen.getByText("Once upon a time.")` either throws or matches an element without the new modifier class.

### Task 4.2: Implementation in StoryCard

- [ ] **Step 4.2.1: Edit `frontend/src/components/StoryCard.tsx` - replace the toggle button + body rendering**

Replace the entire component body with this version (the imports, types, and `downloadDocx` helper above the component are unchanged):

```tsx
export default function StoryCard({ state, request, onPreviewPdf, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(true);
  return (
    <article className="story-card">
      <header>
        <h3>
          For {request.child_name} · {state.topic}
        </h3>
        <div className="card-header-actions">
          {state.status === "done" && state.appropriate === false && (
            <span className="badge warning">
              Couldn't confirm reading level
            </span>
          )}
          {state.status === "done" && (
            <button
              type="button"
              className="card-chevron"
              aria-label={expanded ? "Collapse story" : "Expand story"}
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "▾" : "▸"}
            </button>
          )}
          <button
            type="button"
            aria-label="Remove story"
            className="card-close"
            onClick={() => onDismiss(state.story_id)}
          >
            ×
          </button>
        </div>
      </header>

      {state.status === "pending" && (
        <div
          className="story-skeleton"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="sr-only">
            Generating story (attempt {state.attempts || 1}).
          </span>
          <div className="skeleton-line" aria-hidden="true" />
          <div className="skeleton-line" aria-hidden="true" />
          <div className="skeleton-line skeleton-line--short" aria-hidden="true" />
        </div>
      )}
      {state.status === "error" && <p className="error">{state.error}</p>}
      {state.status === "done" && (
        <>
          <div
            className={
              expanded
                ? "story-text"
                : "story-text story-text--collapsed"
            }
            style={{ whiteSpace: "pre-wrap" }}
          >
            {state.text}
          </div>
          <div className="actions">
            <button onClick={() => downloadDocx(state, request)}>
              Download as Word
            </button>
            <button onClick={() => onPreviewPdf(state)}>
              Download as PDF
            </button>
          </div>
          <p className="helper">
            PDFs are pre-formatted for printing. Word docs are plain text.
            Apply your own formatting after download.
          </p>
        </>
      )}
    </article>
  );
}
```

Changes vs. v1:
- The text toggle (`Hide story` / `Show story`) is replaced with a chevron button (`▾` / `▸`) with `aria-label="Collapse story"` / `"Expand story"` and `aria-expanded`.
- The body is always rendered when `status === "done"`; collapsed state is conveyed by the `story-text--collapsed` modifier class, not by removal.
- The skeleton (pending state) is no longer gated on `expanded` - it should always show during generation, otherwise the teacher cannot tell something is happening.

- [ ] **Step 4.2.2: Edit `frontend/src/App.css` - add the chevron + clamp styles**

Find the `.card-toggle` block in `App.css` and rename it to `.card-chevron`, swapping border-button styling for a tighter icon button:

Find:

```css
.card-toggle {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--ink-muted);
  padding: 4px 10px;
  font-size: 0.85rem;
  border-radius: var(--radius-sm);
}

.card-toggle:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--ink);
}
```

Replace with:

```css
.card-chevron {
  background: transparent;
  border: none;
  color: var(--ink-muted);
  font-size: 1.05rem;
  line-height: 1;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.card-chevron:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.story-text--collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 5;
  line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

- [ ] **Step 4.2.3: Re-run StoryCard tests**

```bash
cd frontend && npm test -- --run StoryCard
```

Expected: all StoryCard tests pass.

- [ ] **Step 4.2.4: Run the full frontend suite as a sanity check**

```bash
cd frontend && npm test -- --run
```

Expected: all suites green. The existing StoryList tests do not touch the toggle and remain green.

### Task 4.3: Em-dash sweep + commit

- [ ] **Step 4.3.1: Sweep**

```bash
grep -nP '[–—]' frontend/src/components/StoryCard.tsx frontend/src/components/StoryCard.test.tsx frontend/src/App.css || echo "OK: no em/en dashes"
```

- [ ] **Step 4.3.2: Stage and commit**

```bash
git add frontend/src/components/StoryCard.tsx frontend/src/components/StoryCard.test.tsx frontend/src/App.css
git commit -m "$(cat <<'EOF'
feat(frontend): chevron toggle with 5-line collapsed preview

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit 5: Consolidate stories into one cross-kid list with shared bundle

`feat(frontend): consolidate stories into one cross-kid list with shared bundle`

**Files:**
- Create: `frontend/src/components/SessionStreamer.tsx`
- Modify: `frontend/src/components/StoryList.tsx`
- Modify: `frontend/src/components/StoryList.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

### Task 5.1: Create SessionStreamer

- [ ] **Step 5.1.1: Create `frontend/src/components/SessionStreamer.tsx`**

Full file content:

```tsx
import { useEffect } from "react";
import type { GenerateRequest, SseEvent } from "../types";
import type { StoryCardState } from "./StoryCard";

export interface SessionLike {
  id: string;
  request: GenerateRequest;
  events: AsyncGenerator<SseEvent>;
}

interface Props {
  session: SessionLike;
  onUpsert: (
    sessionId: string,
    request: GenerateRequest,
    state: StoryCardState,
  ) => void;
  onPatch: (story_id: string, patch: Partial<StoryCardState>) => void;
}

export default function SessionStreamer({
  session,
  onUpsert,
  onPatch,
}: Props) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for await (const ev of session.events) {
        if (cancelled) return;
        if (ev.type === "started") {
          onUpsert(session.id, session.request, {
            story_id: ev.story_id,
            topic: ev.topic,
            status: "pending",
            attempts: 0,
          });
        } else if (ev.type === "attempt") {
          onPatch(ev.story_id, { attempts: ev.attempt });
        } else if (ev.type === "done") {
          onPatch(ev.story_id, {
            status: "done",
            text: ev.text,
            appropriate: ev.appropriate,
            predicted_grade: ev.predicted_grade,
            attempts: ev.attempts,
          });
        } else if (ev.type === "error" && ev.story_id) {
          onPatch(ev.story_id, {
            status: "error",
            error: ev.message,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  return null;
}
```

(The `eslint-disable` comment is needed because the callbacks are intentionally not in the deps array; they are stable references from App's render scope and including them would re-run the effect on every render. If the local eslint config does not enforce `exhaustive-deps`, you may delete the comment.)

### Task 5.2: Rewrite StoryList as a pure render

- [ ] **Step 5.2.1: Replace `frontend/src/components/StoryList.tsx`**

Full file content:

```tsx
import type { GenerateRequest } from "../types";
import StoryCard, {
  type StoryCardState,
  type StoryRequestContext,
} from "./StoryCard";

export interface CardEntry {
  state: StoryCardState;
  request: GenerateRequest;
  sessionId: string;
}

interface Props {
  entries: CardEntry[];
  onPreviewPdf: (state: StoryCardState, request: GenerateRequest) => void;
  onDismiss: (story_id: string) => void;
}

async function downloadBundle(
  format: "docx" | "pdf",
  entries: CardEntry[],
) {
  const stories = entries
    .filter((e) => e.state.status === "done" && e.state.text)
    .map((e) => ({
      child_name: e.request.child_name,
      topic: e.state.topic,
      genre: e.request.genre,
      text: e.state.text!,
      reading_level: e.request.reading_level,
      pages: e.request.pages,
      include_drawing_box: e.request.include_drawing_box,
    }));
  if (stories.length === 0) return;
  const response = await fetch("/api/export/bundle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ format, stories }),
  });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `learning_stories.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function StoryList({
  entries,
  onPreviewPdf,
  onDismiss,
}: Props) {
  const doneCount = entries.filter((e) => e.state.status === "done").length;

  return (
    <section>
      <header className="bundle-actions">
        <button
          disabled={!doneCount}
          onClick={() => downloadBundle("docx", entries)}
        >
          Download all as Word
        </button>
        <button
          disabled={!doneCount}
          onClick={() => downloadBundle("pdf", entries)}
        >
          Download all as PDF
        </button>
      </header>
      <div className="story-list">
        {entries.length === 0 ? (
          <p className="empty">
            Stories will appear here as they are generated.
          </p>
        ) : (
          entries.map((e) => {
            const ctx: StoryRequestContext = {
              child_name: e.request.child_name,
              reading_level: e.request.reading_level,
              genre: e.request.genre,
              pages: e.request.pages,
              include_drawing_box: e.request.include_drawing_box,
            };
            return (
              <StoryCard
                key={e.state.story_id}
                state={e.state}
                request={ctx}
                onPreviewPdf={(s) => onPreviewPdf(s, e.request)}
                onDismiss={onDismiss}
              />
            );
          })
        )}
      </div>
    </section>
  );
}
```

### Task 5.3: Rewrite StoryList tests for the new prop shape

- [ ] **Step 5.3.1: Replace `frontend/src/components/StoryList.test.tsx`**

Full file content:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StoryList, { type CardEntry } from "./StoryList";

function makeEntry(over: Partial<CardEntry["state"]> & { child_name?: string }): CardEntry {
  const { child_name = "Maya", ...stateOver } = over;
  return {
    sessionId: "sess-1",
    request: {
      child_name,
      reading_level: "3",
      genre: "fiction",
      pages: 1,
      include_drawing_box: false,
      topics: [stateOver.topic ?? "Soccer"],
    },
    state: {
      story_id: stateOver.story_id ?? `id-${Math.random().toString(36).slice(2)}`,
      topic: stateOver.topic ?? "Soccer",
      status: stateOver.status ?? "done",
      attempts: stateOver.attempts ?? 1,
      text: stateOver.text ?? "Body.",
      appropriate: stateOver.appropriate ?? true,
      predicted_grade: stateOver.predicted_grade ?? "3",
    },
  };
}

describe("StoryList", () => {
  it("renders an empty placeholder with no entries", () => {
    render(
      <StoryList entries={[]} onPreviewPdf={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(screen.getByText(/Stories will appear here/)).toBeInTheDocument();
  });

  it("disables bundle buttons until at least one story is done", () => {
    render(
      <StoryList
        entries={[makeEntry({ status: "pending", text: undefined })]}
        onPreviewPdf={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Download all as Word/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Download all as PDF/i })).toBeDisabled();
  });

  it("posts a flat list of stories across kids when bundling", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("zip", {
        headers: { "content-type": "application/zip" },
      }),
    );
    URL.createObjectURL = vi.fn(() => "blob:url");
    URL.revokeObjectURL = vi.fn();

    render(
      <StoryList
        entries={[
          makeEntry({ child_name: "Maya", topic: "Soccer" }),
          makeEntry({ child_name: "Liam", topic: "Dinosaurs" }),
        ]}
        onPreviewPdf={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Download all as PDF/i }),
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe("/api/export/bundle");
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.format).toBe("pdf");
    expect(body.stories).toHaveLength(2);
    const names = body.stories.map((s: { child_name: string }) => s.child_name);
    expect(names).toEqual(expect.arrayContaining(["Maya", "Liam"]));
  });
});
```

### Task 5.4: Rewrite App.tsx to lift story state up

- [ ] **Step 5.4.1: Replace `frontend/src/App.tsx`**

Full file content:

```tsx
import { useEffect, useState } from "react";
import RequestForm from "./components/RequestForm";
import StoryList, { type CardEntry } from "./components/StoryList";
import SessionStreamer, {
  type SessionLike,
} from "./components/SessionStreamer";
import PdfPreviewModal from "./components/PdfPreviewModal";
import { streamSse } from "./lib/sse";
import type { GenerateRequest } from "./types";
import type { StoryCardState } from "./components/StoryCard";
import "./App.css";

type Theme = "light" | "dark";

function getInitialTheme(): Theme | null {
  if (typeof document === "undefined") return null;
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  try {
    const saved = localStorage.getItem("lt-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* localStorage may be unavailable */
  }
  return null;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function App() {
  const [sessions, setSessions] = useState<SessionLike[]>([]);
  const [stories, setStories] = useState<Record<string, CardEntry>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [previewStory, setPreviewStory] = useState<{
    story: StoryCardState;
    request: GenerateRequest;
  } | null>(null);
  const [theme, setThemeState] = useState<Theme | null>(getInitialTheme);

  useEffect(() => {
    if (theme === null) return;
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("lt-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  function toggleTheme() {
    setThemeState((prev) => {
      const current =
        prev ??
        (window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light");
      return current === "dark" ? "light" : "dark";
    });
  }

  function handleSubmit(req: GenerateRequest) {
    setSessions((prev) => [
      { id: newId(), request: req, events: streamSse("/api/generate", req) },
      ...prev,
    ]);
  }

  function upsertStory(
    sessionId: string,
    request: GenerateRequest,
    state: StoryCardState,
  ) {
    setStories((s) => ({
      ...s,
      [state.story_id]: { state, request, sessionId },
    }));
    setOrder((o) =>
      o.includes(state.story_id) ? o : [state.story_id, ...o],
    );
  }

  function patchStory(story_id: string, patch: Partial<StoryCardState>) {
    setStories((s) => {
      const cur = s[story_id];
      if (!cur) return s;
      return {
        ...s,
        [story_id]: { ...cur, state: { ...cur.state, ...patch } },
      };
    });
  }

  function dismissStory(story_id: string) {
    setOrder((o) => o.filter((x) => x !== story_id));
    setStories((s) => {
      if (!(story_id in s)) return s;
      const rest = { ...s };
      delete rest[story_id];
      return rest;
    });
  }

  const entries: CardEntry[] = order
    .map((id) => stories[id])
    .filter((e): e is CardEntry => Boolean(e));

  const effectiveTheme: Theme =
    theme ??
    (typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light");

  return (
    <main className="page">
      <header className="app-header">
        <div className="app-header-text">
          <h1>AI Learning Tools</h1>
          <p className="tagline">
            Short reading-practice stories for kids who are learning to read.
          </p>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={
            effectiveTheme === "dark"
              ? "Switch to light theme"
              : "Switch to dark theme"
          }
        >
          {effectiveTheme === "dark" ? "Switch to light" : "Switch to dark"}
        </button>
      </header>

      <RequestForm onSubmit={handleSubmit} />

      {sessions.map((s) => (
        <SessionStreamer
          key={s.id}
          session={s}
          onUpsert={upsertStory}
          onPatch={patchStory}
        />
      ))}

      <StoryList
        entries={entries}
        onPreviewPdf={(story, request) =>
          setPreviewStory({ story, request })
        }
        onDismiss={dismissStory}
      />

      {previewStory && (
        <PdfPreviewModal
          open
          story={previewStory.story}
          request={previewStory.request}
          onClose={() => setPreviewStory(null)}
        />
      )}
    </main>
  );
}
```

Notes:
- The session-block `<section><h2>Stories for X</h2></section>` is gone. The kid name remains visible in each card's heading ("For Maya · Soccer") via `StoryCard`.
- One `<StoryList>` renders below all `<SessionStreamer>` children; `SessionStreamer` has no DOM output, only effects.
- `previewStory` carries `request` directly (not a session reference), so the modal continues to PDF the per-card request snapshot even after the underlying session is otherwise idle.

### Task 5.5: Update App.test.tsx for the consolidated layout

- [ ] **Step 5.5.1: Replace `frontend/src/App.test.tsx`**

Full file content:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import type { SseEvent } from "./types";

vi.mock("./lib/sse", () => {
  let counter = 0;
  return {
    streamSse: vi.fn(() => {
      counter += 1;
      const id = `s${counter}`;
      const topic = counter === 1 ? "Soccer" : "Dinosaurs";
      const script: SseEvent[] = [
        { type: "started", story_id: id, topic },
        {
          type: "done",
          story_id: id,
          text: "body",
          appropriate: true,
          predicted_grade: "3",
          attempts: 1,
        },
        { type: "complete" },
      ];
      return (async function* () {
        for (const ev of script) yield ev;
      })();
    }),
  };
});

const PRESETS = { Sports: ["Soccer"], Animals: ["Dinosaurs"] };

function mockPresets() {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(PRESETS), {
      headers: { "content-type": "application/json" },
    }),
  );
}

async function submitFor(name: string, topic: string) {
  await userEvent.clear(screen.getByLabelText(/student.*name/i));
  await userEvent.type(screen.getByLabelText(/student.*name/i), name);
  const categoryBtn =
    topic === "Soccer"
      ? screen.getByRole("button", { name: /^Sports$/ })
      : screen.getByRole("button", { name: /^Animals$/ });
  await userEvent.click(categoryBtn);
  await userEvent.click(screen.getByRole("checkbox", { name: topic }));
  await userEvent.click(screen.getByRole("button", { name: /generate/i }));
}

describe("App consolidated story list", () => {
  it("renders one card per submission across kids, newest first, and a single bundle", async () => {
    mockPresets();
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Sports$/ })).toBeInTheDocument(),
    );

    await submitFor("Maya", "Soccer");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /For Maya/i })).toBeInTheDocument(),
    );

    await submitFor("Liam", "Dinosaurs");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /For Liam/i })).toBeInTheDocument(),
    );

    // Both card headings present; no per-kid section headings remain.
    expect(screen.queryByRole("heading", { name: /Stories for Maya/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Stories for Liam/i })).not.toBeInTheDocument();

    const mayaCard = screen.getByRole("heading", { name: /For Maya/i });
    const liamCard = screen.getByRole("heading", { name: /For Liam/i });
    const order = liamCard.compareDocumentPosition(mayaCard);
    // 4 = DOCUMENT_POSITION_FOLLOWING (liam comes before maya)
    expect(order & 4).toBeTruthy();

    // Exactly one "Download all as PDF" button on the page.
    expect(
      screen.getAllByRole("button", { name: /Download all as PDF/i }),
    ).toHaveLength(1);
  });

  it("removing a card calls dismiss; that card is gone", async () => {
    mockPresets();
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Sports$/ })).toBeInTheDocument(),
    );

    await submitFor("Maya", "Soccer");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /For Maya/i })).toBeInTheDocument(),
    );

    await submitFor("Liam", "Dinosaurs");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /For Liam/i })).toBeInTheDocument(),
    );

    // Remove Maya's card.
    const removeButtons = screen.getAllByRole("button", { name: /Remove story/i });
    // The first Remove button belongs to the card at the top (Liam, newest).
    // Find Maya's by walking the article ancestor.
    const mayaArticle = screen
      .getByRole("heading", { name: /For Maya/i })
      .closest("article")!;
    const removeMaya = mayaArticle.querySelector('button[aria-label="Remove story"]') as HTMLButtonElement;
    await userEvent.click(removeMaya);

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /For Maya/i })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: /For Liam/i })).toBeInTheDocument();
    // The unused removeButtons reference is intentional - kept for clarity.
    void removeButtons;
  });
});
```

### Task 5.6: Run the full frontend suite

- [ ] **Step 5.6.1: Run all frontend tests**

```bash
cd frontend && npm test -- --run
```

Expected: every suite green - RequestForm (unchanged from Commit 3), StoryCard (Commit 4), StoryList (rewritten), App (rewritten), PdfPreviewModal (unchanged).

- [ ] **Step 5.6.2: Visual smoke check**

Open http://localhost:5173, generate stories for two different kid names, confirm:
- Both kids' cards land in a single list, newest first.
- No "Stories for X" headings.
- A single "Download all as Word" + "Download all as PDF" pair at the top.
- Clicking "Download all as PDF" downloads `learning_stories.zip` containing both kids' files (filenames disambiguated by `safe_filename`).
- The chevron and X work per card.

### Task 5.7: Em-dash sweep + commit

- [ ] **Step 5.7.1: Sweep**

```bash
grep -nP '[–—]' frontend/src/App.tsx frontend/src/App.test.tsx frontend/src/components/SessionStreamer.tsx frontend/src/components/StoryList.tsx frontend/src/components/StoryList.test.tsx || echo "OK: no em/en dashes"
```

- [ ] **Step 5.7.2: Stage and commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx frontend/src/components/SessionStreamer.tsx frontend/src/components/StoryList.tsx frontend/src/components/StoryList.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): consolidate stories into one cross-kid list with shared bundle

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit 6: Sentence regex preserves closing quotation marks

`fix(backend): sentence regex preserves closing quotation marks`

**Files:**
- Modify: `backend/app/export.py`
- Modify: `backend/tests/test_export.py`

### Task 6.1: Failing test - dialog sentence with closing quote survives tokenization

- [ ] **Step 6.1.1: Append to `backend/tests/test_export.py`**

Append:

```python
def test_split_into_pages_preserves_closing_quotes():
    # All three sentences (including the one that ends with `."`) must
    # survive sentence tokenization and end up in the page output.
    text = (
        '"Hi," she said. "I am Maya. We just moved here." '
        '"Did you ride all the way in that truck?" Avi asked.'
    )
    chunks = split_into_pages(text, 1)
    page = chunks[0]
    assert '"Hi," she said.' in page
    assert '"I am Maya.' in page
    assert 'We just moved here."' in page
    assert '"Did you ride all the way in that truck?" Avi asked.' in page or (
        '"Did you ride all the way in that truck?"' in page
        and "Avi asked." in page
    )
```

- [ ] **Step 6.1.2: Run to confirm failure**

```bash
cd backend && uv run pytest tests/test_export.py::test_split_into_pages_preserves_closing_quotes -q
```

Expected: FAIL - the assertion `'We just moved here."' in page` does not hold because the v1 regex skips that sentence.

### Task 6.2: Implementation - widen the regex

- [ ] **Step 6.2.1: Edit `backend/app/export.py` - relax `_SENTENCE_RE`**

Find:

```python
_SENTENCE_RE = re.compile(r"[^.!?]+[.!?]+(?:\s|$)")
```

Replace with:

```python
_SENTENCE_RE = re.compile(r"[^.!?]+[.!?]+[\"”’')\]]*(?:\s|$)")
```

Character class breakdown: `"` (ASCII double), `”` (right curly double `”`), `’` (right curly single `’`), `'` (ASCII single), `)`, `]`. All are legitimate close-punctuation that can follow `.!?` inside a single sentence.

- [ ] **Step 6.2.2: Re-run the failing test**

```bash
cd backend && uv run pytest tests/test_export.py::test_split_into_pages_preserves_closing_quotes -q
```

Expected: PASS.

- [ ] **Step 6.2.3: Run the full export test suite**

```bash
cd backend && uv run pytest tests/test_export.py -q
```

Expected: all existing tests still pass (the regex is strictly more permissive; existing sentences without trailing quotes still match identically).

### Task 6.3: Em-dash sweep + commit

- [ ] **Step 6.3.1: Sweep**

```bash
grep -nP '[–—]' backend/app/export.py backend/tests/test_export.py || echo "OK: no em/en dashes"
```

- [ ] **Step 6.3.2: Stage and commit**

```bash
git add backend/app/export.py backend/tests/test_export.py
git commit -m "$(cat <<'EOF'
fix(backend): sentence regex preserves closing quotation marks

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit 7: Drop PDF title, indent paragraphs, fill the page

`feat(backend): drop PDF title, indent paragraphs, expand leading to fill page`

**Files:**
- Modify: `backend/app/export.py`
- Modify: `backend/tests/test_export.py`

### Task 7.1: Failing tests - title gone, indent applied, leading stretched

- [ ] **Step 7.1.1: Update `test_title_uses_colon_not_em_dash` to keep only the DOCX assertion**

Find the existing test `test_title_uses_colon_not_em_dash` in `backend/tests/test_export.py`. Replace its body with:

```python
def test_docx_title_uses_colon_not_em_dash():
    blob = render_docx(make_story(child_name="Maya", topic="Soccer"))
    doc = Document(io.BytesIO(blob))
    titles = [p.text for p in doc.paragraphs if p.text]
    assert any('For Maya: "Soccer"' in t for t in titles)
    assert not any("—" in t for t in titles)
```

(Also rename the function to `test_docx_title_uses_colon_not_em_dash` for clarity - it now only covers DOCX. Update any references; there are none in the codebase besides this definition.)

- [ ] **Step 7.1.2: Append the new "no PDF title" test**

```python
def test_pdf_has_no_title(monkeypatch):
    from reportlab.pdfgen import canvas as canvas_mod

    drawn: list[str] = []
    real_draw = canvas_mod.Canvas.drawString

    def spy_draw(self, x, y, text, *args, **kwargs):
        drawn.append(text)
        return real_draw(self, x, y, text, *args, **kwargs)

    monkeypatch.setattr(canvas_mod.Canvas, "drawString", spy_draw)
    render_pdf(make_story(child_name="Maya", topic="Soccer", pages=1))
    assert not any(s.startswith("For ") for s in drawn)
    assert not any("Maya" in s for s in drawn)
```

- [ ] **Step 7.1.3: Append the paragraph-indent test**

```python
def test_pdf_paragraph_indent(monkeypatch):
    from reportlab.pdfgen import canvas as canvas_mod
    from app.export import _MARGIN, _INDENT

    calls: list[tuple[float, float, str]] = []
    real_draw = canvas_mod.Canvas.drawString

    def spy_draw(self, x, y, text, *args, **kwargs):
        calls.append((x, y, text))
        return real_draw(self, x, y, text, *args, **kwargs)

    monkeypatch.setattr(canvas_mod.Canvas, "drawString", spy_draw)

    para_a = "Alpha one. Alpha two. Alpha three. Alpha four."
    para_b = "Bravo one. Bravo two. Bravo three. Bravo four."
    text = f"{para_a}\n\n{para_b}"
    render_pdf(make_story(reading_level="3", pages=1, text=text))

    # First line of each paragraph at x = _MARGIN + _INDENT.
    # Locate by the leading token.
    alpha_first = next(c for c in calls if "Alpha" in c[2])
    bravo_first = next(c for c in calls if "Bravo" in c[2])
    assert abs(alpha_first[0] - (_MARGIN + _INDENT)) < 0.5
    assert abs(bravo_first[0] - (_MARGIN + _INDENT)) < 0.5

    # Subsequent lines (if Alpha wraps) start at x = _MARGIN.
    alpha_lines = [c for c in calls if "Alpha" in c[2]]
    if len(alpha_lines) > 1:
        for c in alpha_lines[1:]:
            assert abs(c[0] - _MARGIN) < 0.5
```

- [ ] **Step 7.1.4: Append the "fill page" test**

```python
def test_pdf_fills_page_by_scaling_leading(monkeypatch):
    from reportlab.pdfgen import canvas as canvas_mod
    from reportlab.lib.pagesizes import LETTER
    from app.export import _MARGIN
    from app.pedagogy import FONT_SIZES, LINE_SPACING

    calls: list[tuple[float, str]] = []
    real_draw = canvas_mod.Canvas.drawString

    def spy_draw(self, x, y, text, *args, **kwargs):
        calls.append((y, text))
        return real_draw(self, x, y, text, *args, **kwargs)

    monkeypatch.setattr(canvas_mod.Canvas, "drawString", spy_draw)

    # Three short sentences across two paragraphs; should stretch.
    text = "Alpha one. Alpha two.\n\nBravo one."
    render_pdf(make_story(reading_level="3", pages=1, text=text))

    ys = [y for (y, _t) in calls]
    assert len(ys) >= 2, ys

    base_leading = FONT_SIZES["3"] * LINE_SPACING["3"]
    # Each consecutive y-delta inside a paragraph should be >= base_leading
    # (the stretch is monotonic - we never shrink below baseline).
    for a, b in zip(ys, ys[1:]):
        delta = a - b
        assert delta + 0.01 >= base_leading, (a, b, delta, base_leading)

    # At least one delta should be strictly greater than base_leading -
    # otherwise we did not stretch at all and the page is not filled.
    deltas = [a - b for a, b in zip(ys, ys[1:])]
    assert any(d > base_leading + 0.1 for d in deltas), deltas

    # The first body line is near the top margin (no title above it).
    width, height = LETTER
    assert ys[0] > height - _MARGIN - base_leading * 3
```

- [ ] **Step 7.1.5: Update `test_pdf_drawing_box_leaves_leading_times_1_5_gap`**

The drawing-box geometry shifts up by `font_size * 2` because the title is gone. Update the expected calculation. Find:

```python
def test_pdf_drawing_box_leaves_leading_times_1_5_gap(monkeypatch):
    ...
    text_top_before_box = height - _MARGIN - (font_size * 2)
    box_bottom = text_top_before_box - (height - 2 * _MARGIN) * _BOX_FRACTION
    expected_first_y = box_bottom - leading * 1.5
```

Replace with:

```python
def test_pdf_drawing_box_leaves_leading_times_1_5_gap(monkeypatch):
    ...
    text_top_before_box = height - _MARGIN
    box_bottom = text_top_before_box - (height - 2 * _MARGIN) * _BOX_FRACTION
    expected_first_y = box_bottom - leading * 1.5
```

Also remove the `if "For Maya" not in t` filter from this test - the body list is now just `drawn` directly:

```python
    body = drawn   # no title to filter out
```

(If the test currently reads `body = [(y, t) for (y, t) in drawn if "For Maya" not in t]`, replace that line with `body = drawn`.)

Note: the `expected_first_y` assertion may need tolerance loosening because the leading is now scaled by the fill pass. To keep the test deterministic, change the test input to one that does NOT stretch: use a story that already fills the page (or assert only that `first_y <= expected_first_y` so a stretched leading still satisfies the test). Simplest tweak: change the assertion from equality (`abs(first_y - expected_first_y) < 0.01`) to inequality:

```python
    first_y = body[0][0]
    # The first body line sits at or below (box_bottom - leading * 1.5).
    # With fill-scaling it may sit lower; never above.
    assert first_y <= expected_first_y + 0.01, (first_y, expected_first_y)
```

- [ ] **Step 7.1.6: Update `test_pdf_preserves_paragraph_breaks`**

The "drop title" filter is no longer needed; the y-monotonicity assertion still works. Find:

```python
    body = [(y, t) for (y, t) in calls if "For Maya" not in t]
```

Replace with:

```python
    body = calls
```

Also the paragraph-gap assertion compares to intra-paragraph leading; with the fill pass scaling leading, the leading inside a paragraph may itself be > base_leading. The relative `gap_a_to_b > leading` assertion still holds because the paragraph gap is `leading * 0.7 * scale` where `leading` here is the per-line stretched leading, and ... actually wait: paragraph gap is `leading * 0.7` AT THE STRETCHED scale, vs intra-paragraph step which is `leading` at the same scale. So paragraph gap (`0.7 * stretched_leading`) is SMALLER than the intra-paragraph step. The v1 assertion `gap_a_to_b > leading` would now be `0.7 * stretched > stretched` which is FALSE.

Update the gap comparison: the paragraph break inserts an EXTRA `0.7 * leading` ON TOP of one normal `leading` step. So the gap between the last line of paragraph A and the first line of paragraph B is `1.7 * stretched_leading`, vs the intra-paragraph step which is `1.0 * stretched_leading`.

The v1 implementation of `_draw_paragraphs` did exactly this: `_draw_wrapped` advanced by `leading` past the last line, then `_draw_paragraphs` subtracted another `leading * 0.7`. So gap = `1.7 * leading`. The v1 assertion was right.

In v2's implementation (see Task 7.2 below), we keep the same accounting: after drawing a paragraph's last line at `y = some_y`, the cursor advances to `some_y - leading`. Before drawing the next paragraph's first line, we subtract another `leading * 0.7`. So the next first-line y is `some_y - leading - leading * 0.7 = some_y - 1.7 * leading`. Gap (delta between consecutive drawString y values) = `1.7 * leading`. The v1 assertion holds.

No change needed to the gap-comparison logic. Just remove the title filter.

### Task 7.2: Implementation - title removal + indent + fill-leading

- [ ] **Step 7.2.1: Edit `backend/app/export.py` - add the indent constant and fill-cap constant**

Find the constants block:

```python
_MARGIN = 0.75 * inch
_BOX_FRACTION = 0.45  # drawing box occupies top 45% of page
_BOX_GAP_LEADING = 1.5
```

Replace with:

```python
_MARGIN = 0.75 * inch
_BOX_FRACTION = 0.45  # drawing box occupies top 45% of page
_BOX_GAP_LEADING = 1.5
_INDENT = 18.0  # first-line paragraph indent in points (~0.25 inch)
_PARA_GAP_FRAC = 0.7  # paragraph gap as a fraction of leading
_FILL_MAX_SCALE = 2.0  # cap leading stretch to 2x baseline
```

- [ ] **Step 7.2.2: Replace `_draw_wrapped` with a pure-layout helper**

Replace the existing `_draw_wrapped` function with:

```python
def _layout_paragraph(
    text: str, max_width: float, font_size: float, indent: float
) -> list[str]:
    """Wrap a single paragraph into lines. The first line has `indent`
    fewer pixels available; subsequent lines use the full max_width.
    Indent is applied at draw time (this function returns the line
    strings only).
    """
    from reportlab.pdfbase.pdfmetrics import stringWidth

    font_name = "Helvetica"
    words = text.split()
    lines: list[str] = []
    current: list[str] = []
    is_first_line = True

    def width_of(buf: list[str]) -> float:
        return stringWidth(" ".join(buf), font_name, font_size)

    for w in words:
        current.append(w)
        line_max = (max_width - indent) if is_first_line else max_width
        if width_of(current) > line_max:
            current.pop()
            if current:
                lines.append(" ".join(current))
                is_first_line = False
            current = [w]
    if current:
        lines.append(" ".join(current))
    return lines
```

- [ ] **Step 7.2.3: Replace `_draw_paragraphs` with a layout + scale + draw pipeline**

Replace the existing `_draw_paragraphs` function with:

```python
def _layout_chunk(
    text: str, max_width: float, font_size: float, indent: float
) -> list[list[str]]:
    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    return [_layout_paragraph(p, max_width, font_size, indent) for p in paragraphs]


def _compute_fill_scale(
    lines_per_para: list[list[str]],
    available_height: float,
    base_leading: float,
) -> float:
    # Last-baseline lands at: y_top - (N-1) * leading - para_breaks * gap.
    # We pick leading so that delta matches available_height.
    total_lines = sum(len(lp) for lp in lines_per_para)
    if total_lines <= 1:
        return 1.0
    para_breaks = max(0, len(lines_per_para) - 1)
    denom = (total_lines - 1) + para_breaks * _PARA_GAP_FRAC
    if denom <= 0:
        return 1.0
    raw_scale = available_height / (base_leading * denom)
    # Never shrink below baseline; never stretch beyond cap.
    return max(1.0, min(_FILL_MAX_SCALE, raw_scale))


def _draw_chunk(
    c,
    lines_per_para: list[list[str]],
    x: float,
    y_top: float,
    leading: float,
    para_gap: float,
    indent: float,
) -> None:
    cursor_y = y_top
    for p_idx, lines in enumerate(lines_per_para):
        for l_idx, line in enumerate(lines):
            line_x = x + indent if l_idx == 0 else x
            c.drawString(line_x, cursor_y, line)
            cursor_y -= leading
        if p_idx < len(lines_per_para) - 1:
            cursor_y -= para_gap
```

- [ ] **Step 7.2.4: Rewrite `render_pdf` to drop the title, lay out per-page, and stretch to fill**

Replace `render_pdf` with:

```python
def render_pdf(story: StoryInput) -> bytes:
    buf = io.BytesIO()
    width, height = LETTER
    c = _canvas.Canvas(buf, pagesize=LETTER)
    font_size = FONT_SIZES[story.reading_level]
    base_leading = font_size * LINE_SPACING[story.reading_level]

    chunks = split_into_pages(story.text, story.pages)
    text_x = _MARGIN
    text_width = width - 2 * _MARGIN

    for idx, chunk in enumerate(chunks):
        text_top = height - _MARGIN

        if story.include_drawing_box:
            box_top = text_top
            box_bottom = box_top - (height - 2 * _MARGIN) * _BOX_FRACTION
            box_height = box_top - box_bottom
            c.rect(_MARGIN, box_bottom, width - 2 * _MARGIN, box_height, stroke=1, fill=0)
            text_top = box_bottom - base_leading * _BOX_GAP_LEADING

        c.setFont("Helvetica", font_size)
        lines_per_para = _layout_chunk(chunk, text_width, font_size, _INDENT)

        available_height = text_top - _MARGIN
        scale = _compute_fill_scale(lines_per_para, available_height, base_leading)
        leading = base_leading * scale
        para_gap = base_leading * _PARA_GAP_FRAC * scale

        _draw_chunk(c, lines_per_para, text_x, text_top, leading, para_gap, _INDENT)

        if idx < len(chunks) - 1:
            c.showPage()

    c.showPage()  # close final page
    c.save()
    return buf.getvalue()
```

Notes:
- Title block (the `c.setFont("Helvetica-Bold", ...)` + `c.drawString(title)` + `text_top = ... - (font_size * 2)`) is removed.
- `text_top` starts at `height - _MARGIN` directly; if a drawing box is present, it shifts to below the box minus the gap.
- The `title` local is gone.
- The body font is set once per page (Helvetica at the level's `font_size`).

- [ ] **Step 7.2.5: Run the export tests**

```bash
cd backend && uv run pytest tests/test_export.py -q
```

Expected: every test passes - the new four (title gone, indent, fill, regex from Commit 6) plus all existing ones (some updated for the new geometry).

If `test_pdf_preserves_paragraph_breaks` regresses because of the fill-scale interaction with single-line paragraphs, loosen its inner threshold to `body_leading * 0.95` (since fill can scale paragraph_gap by up to 2x, but the BASE intra-paragraph step is fixed). Re-read the test before tweaking; usually no change is needed.

- [ ] **Step 7.2.6: Run the full backend suite**

```bash
cd backend && uv run pytest -q
```

Expected: all green.

### Task 7.3: Visual verification

- [ ] **Step 7.3.1: Generate a fresh PDF and inspect**

Open http://localhost:5173, generate a 1-page 3rd-grade story for a kid with quotation-heavy dialog (use a topic like "Maya meets a new friend"), preview the PDF.

Confirm:
- No title at the top - body text starts at the top margin.
- First line of each paragraph is indented.
- The text fills the page (top to bottom; only the bottom margin is empty).
- Sentences ending with `."` or `?"` are preserved.

Repeat with `include_drawing_box=True`: the drawing box sits at the top, body fills the space below it.

### Task 7.4: Em-dash sweep + commit

- [ ] **Step 7.4.1: Sweep**

```bash
grep -nP '[–—]' backend/app/export.py backend/tests/test_export.py || echo "OK: no em/en dashes"
```

- [ ] **Step 7.4.2: Stage and commit**

```bash
git add backend/app/export.py backend/tests/test_export.py
git commit -m "$(cat <<'EOF'
feat(backend): drop PDF title, indent paragraphs, expand leading to fill page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## After all seven commits

- Run the full suite one last time:

```bash
cd backend && uv run pytest -q
cd frontend && npm test -- --run
```

- Repo-wide em-dash sweep (only source/test files; skip the spec):

```bash
grep -nrP '[–—]' backend/app backend/tests frontend/src || echo "OK: no em/en dashes"
```

- Confirm `git log --oneline -n 8` shows exactly the seven new commits at the top:

```
<sha> feat(backend): drop PDF title, indent paragraphs, expand leading to fill page
<sha> fix(backend): sentence regex preserves closing quotation marks
<sha> feat(frontend): consolidate stories into one cross-kid list with shared bundle
<sha> feat(frontend): chevron toggle with 5-line collapsed preview
<sha> fix(frontend): pages input allows empty intermediate state
<sha> style(frontend): adapt eggshell + indigo + burnt-peach palette
<sha> fix(frontend): bind color-scheme to active theme so native widgets stay light in light mode
<previous head> ...
```

Ready for review.
