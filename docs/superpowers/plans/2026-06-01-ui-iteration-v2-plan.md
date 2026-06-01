# UI iteration v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the 8-item v2 design pass — fix PDF rendering bugs, make the form reusable, add per-card expand/remove, support multi-kid sessions, and swap to a crayon-bright marigold + indigo palette with a manual dark-mode toggle.

**Architecture:** No backend endpoints change and no schemas change. Backend changes are confined to `app/export.py` + `app/pedagogy.py` constants. Frontend changes are local-state additions in existing components (`RequestForm`, `StoryCard`, `StoryList`), one structural change in `App.tsx` to hold a `Session[]` instead of one live request, and a CSS-token swap in `index.css` + `App.css` driven by a `data-theme` attribute.

**Tech Stack:** Backend = Python 3.12 + FastAPI + reportlab + python-docx, tests via `uv run pytest`. Frontend = React 19 + TypeScript + Vite, tests via Vitest 4 + jsdom 29 + Testing Library.

---

## Cross-cutting rules (read once before every task)

These apply to all five commits. The implementer must internalize them — they are house style and reviewer gates.

### A. Em-dash and en-dash policy

No `—` (U+2014) and no `–` (U+2013) anywhere in user-visible strings, anywhere in code, anywhere in tests, anywhere in docstrings shipped to users. Hyphen-minus (`-`) and a colon (`:`) are the substitutes.

Before every commit the implementer MUST run:

```bash
git diff --cached --name-only -z | xargs -0 grep -nP '[–—]' || echo "OK: no em/en dashes"
```

If the output is anything other than `OK: no em/en dashes`, fix the strings and re-stage before committing. Apply the same check to JSX text nodes, attribute strings, and ARIA labels.

### B. Vitest 4 + jsdom 29 Blob bug

`new Response(new Blob([...]))` throws `blob.stream is not a function` in our test environment. Use `new Response("string-literal")` or `new Response(JSON.stringify(obj), { headers })` instead. Precedent: `frontend/src/components/StoryList.test.tsx` (mocks `new Response("zip")`) and `frontend/src/components/PdfPreviewModal.test.tsx`.

### C. Commit boundaries

Each commit (1 through 5) must leave the repo with a green test suite. Implementers MUST run the relevant tests after editing and BEFORE staging:

```bash
cd backend && uv run pytest -q
cd frontend && npm test -- --run
```

Run only the side(s) the commit touches; running both is fine but not required.

### D. Where the dev servers are

Backend on `http://localhost:8000`, frontend on `http://localhost:5173`. They may already be running from a prior session. Check first with `lsof -nP -iTCP:8000 -iTCP:5173 -sTCP:LISTEN` before spawning new ones.

---

## File Structure (where the changes land)

```
backend/app/export.py                    (Commit 1)
backend/app/pedagogy.py                  (Commit 1)
backend/tests/test_export.py             (Commit 1)
frontend/src/components/RequestForm.tsx  (Commit 2)
frontend/src/components/RequestForm.test.tsx (Commit 2)
frontend/src/components/StoryCard.tsx    (Commit 3)
frontend/src/components/StoryCard.test.tsx (Commit 3)
frontend/src/components/StoryList.tsx    (Commit 3, minor in 4)
frontend/src/App.tsx                     (Commit 4, 5)
frontend/src/App.test.tsx                (Commit 4, new file)
frontend/src/index.css                   (Commit 5)
frontend/src/App.css                     (Commit 5)
```

Each commit is independently shippable; the suite must be green at every commit.

---

## Commit 1: Backend PDF rendering fixes

`fix(backend): preserve paragraph breaks in PDF, widen line spacing, add gap below drawing box, fix em-dash in title`

**Files:**
- Modify: `backend/app/export.py`
- Modify: `backend/app/pedagogy.py`
- Modify: `backend/tests/test_export.py`

### Task 1.1: Widen LINE_SPACING

- [ ] **Step 1.1.1: Update the existing snapshot test in `backend/tests/test_export.py`**

Find the existing test:

```python
def test_pdf_line_spacing_per_reading_level():
    assert LINE_SPACING == {
        "K": 1.6, "1": 1.5, "2": 1.4, "3": 1.35, "4": 1.3, "5": 1.3,
    }
```

Replace its body with the new expected values:

```python
def test_pdf_line_spacing_per_reading_level():
    assert LINE_SPACING == {
        "K": 1.8, "1": 1.7, "2": 1.6, "3": 1.55, "4": 1.5, "5": 1.5,
    }
```

- [ ] **Step 1.1.2: Run the test and confirm it fails**

Run: `cd backend && uv run pytest tests/test_export.py::test_pdf_line_spacing_per_reading_level -q`
Expected: FAIL with `AssertionError` showing the dict mismatch.

- [ ] **Step 1.1.3: Update `backend/app/pedagogy.py`**

Find:

```python
LINE_SPACING: dict[str, float] = {
    # Per-grade leading multiplier (line height = font_size * multiplier).
    # Early readers benefit from extra vertical space between lines -
    # easier to track from one line to the next without losing place.
    # Tapers to standard 1.3x by grade 4.
    "K": 1.6, "1": 1.5, "2": 1.4, "3": 1.35, "4": 1.3, "5": 1.3,
}
```

Replace with:

```python
LINE_SPACING: dict[str, float] = {
    # Per-grade leading multiplier (line height = font_size * multiplier).
    # Early readers benefit from extra vertical space between lines -
    # easier to track from one line to the next without losing place.
    # Tapers down through grade 4 but stays generous; teachers reported
    # the v1 spacing felt cramped on printed PDFs.
    "K": 1.8, "1": 1.7, "2": 1.6, "3": 1.55, "4": 1.5, "5": 1.5,
}
```

(If the existing block uses an em-dash where this block uses a hyphen, replace it; do not reintroduce the em-dash. The original file's comments already use plain hyphens.)

- [ ] **Step 1.1.4: Re-run the test and confirm it passes**

Run: `cd backend && uv run pytest tests/test_export.py::test_pdf_line_spacing_per_reading_level -q`
Expected: PASS.

### Task 1.2: Em-dash to colon in PDF + DOCX title

- [ ] **Step 1.2.1: Add the title-format assertion test to `backend/tests/test_export.py`**

Append:

```python
def test_title_uses_colon_not_em_dash(monkeypatch):
    # DOCX: title paragraph contains "For Maya: \"Soccer\"" and no em-dash.
    blob = render_docx(make_story(child_name="Maya", topic="Soccer"))
    doc = Document(io.BytesIO(blob))
    titles = [p.text for p in doc.paragraphs if p.text]
    assert any('For Maya: "Soccer"' in t for t in titles)
    assert not any("—" in t for t in titles)

    # PDF: spy on drawString to inspect the rendered title.
    from reportlab.pdfgen import canvas as canvas_mod

    drawn: list[str] = []
    real_draw = canvas_mod.Canvas.drawString

    def spy_draw(self, x, y, text, *args, **kwargs):
        drawn.append(text)
        return real_draw(self, x, y, text, *args, **kwargs)

    monkeypatch.setattr(canvas_mod.Canvas, "drawString", spy_draw)
    render_pdf(make_story(child_name="Maya", topic="Soccer", pages=1))
    assert any('For Maya: "Soccer"' in s for s in drawn)
    assert not any("—" in s for s in drawn)
```

- [ ] **Step 1.2.2: Run it to confirm it fails**

Run: `cd backend && uv run pytest tests/test_export.py::test_title_uses_colon_not_em_dash -q`
Expected: FAIL (current code emits the em-dash).

- [ ] **Step 1.2.3: Fix `backend/app/export.py`**

In `render_docx`, change:

```python
doc.add_heading(f'For {story.child_name} — "{story.topic}"', level=1)
```

to:

```python
doc.add_heading(f'For {story.child_name}: "{story.topic}"', level=1)
```

In `render_pdf`, change:

```python
title = f'For {story.child_name} — "{story.topic}"'
```

to:

```python
title = f'For {story.child_name}: "{story.topic}"'
```

- [ ] **Step 1.2.4: Re-run and confirm pass**

Run: `cd backend && uv run pytest tests/test_export.py::test_title_uses_colon_not_em_dash -q`
Expected: PASS.

### Task 1.3: Paragraph-aware PDF wrapping

- [ ] **Step 1.3.1: Add the paragraph-break test to `backend/tests/test_export.py`**

Append:

```python
def test_pdf_preserves_paragraph_breaks(monkeypatch):
    # Render a 1-page story whose text has three paragraphs. The drawn
    # y-coordinates must drop monotonically across body lines, and the
    # gap at each paragraph boundary must be strictly larger than the
    # gap inside a paragraph.
    from reportlab.pdfgen import canvas as canvas_mod

    calls: list[tuple[float, str]] = []
    real_draw = canvas_mod.Canvas.drawString

    def spy_draw(self, x, y, text, *args, **kwargs):
        calls.append((y, text))
        return real_draw(self, x, y, text, *args, **kwargs)

    monkeypatch.setattr(canvas_mod.Canvas, "drawString", spy_draw)

    para_a = "Alpha one. Alpha two. Alpha three."
    para_b = "Bravo one. Bravo two. Bravo three."
    para_c = "Charlie one. Charlie two. Charlie three."
    text = f"{para_a}\n\n{para_b}\n\n{para_c}"

    render_pdf(make_story(reading_level="3", pages=1, text=text))

    # Drop the title call; everything after is body.
    body = [(y, t) for (y, t) in calls if "For Maya" not in t]
    ys = [y for (y, _) in body]
    # monotonically decreasing
    assert all(ys[i] > ys[i + 1] for i in range(len(ys) - 1)), ys

    # Locate the first drawString that contains text from each paragraph.
    def first_idx(token: str) -> int:
        return next(i for i, (_, t) in enumerate(body) if token in t)

    a_first = first_idx("Alpha")
    b_first = first_idx("Bravo")
    c_first = first_idx("Charlie")

    # intra-paragraph leading: gap inside Alpha (if Alpha spans multiple lines
    # at this font size it will; if not, fall back to comparing the gap right
    # before each paragraph break instead).
    leading = ys[a_first] - ys[a_first + 1] if (b_first - a_first) > 1 else None

    gap_a_to_b = ys[b_first - 1] - ys[b_first]
    gap_b_to_c = ys[c_first - 1] - ys[c_first]

    if leading is not None:
        assert gap_a_to_b > leading, (gap_a_to_b, leading)
        assert gap_b_to_c > leading, (gap_b_to_c, leading)
    else:
        # Single-line paragraphs: the paragraph gaps must at least exceed the
        # body leading we know we are using.
        from app.pedagogy import FONT_SIZES, LINE_SPACING
        body_leading = FONT_SIZES["3"] * LINE_SPACING["3"]
        assert gap_a_to_b > body_leading
        assert gap_b_to_c > body_leading
```

- [ ] **Step 1.3.2: Run it to confirm failure**

Run: `cd backend && uv run pytest tests/test_export.py::test_pdf_preserves_paragraph_breaks -q`
Expected: FAIL — current `_draw_wrapped` does `text.split()` which collapses `\n\n`.

- [ ] **Step 1.3.3: Edit `backend/app/export.py` to be paragraph-aware**

Replace the body of `render_pdf` (the `for idx, chunk in enumerate(chunks):` loop) and add a helper. The new logic:

1. Splits each page chunk on `\n\n` into paragraph blocks.
2. Calls the existing `_draw_wrapped` once per paragraph, tracking the cursor across paragraphs.
3. Emits a `leading * 0.7` vertical gap between paragraphs.

Find and replace the body of `render_pdf` so it reads as follows (keep the existing module-level imports and constants; only the function body changes):

```python
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
```

Add a module-level constant just above `render_pdf` (next to `_BOX_FRACTION`):

```python
_BOX_GAP_LEADING = 1.5
```

Add a new helper function below `_draw_wrapped`:

```python
def _draw_paragraphs(
    c, text: str, x: float, y: float, max_width: float, leading: float
) -> float:
    """Wrap each `\\n\\n`-separated paragraph in `text` independently,
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
```

Then update `_draw_wrapped` to (a) split on whitespace within its single paragraph, (b) advance the cursor for the LAST line drawn instead of leaving it at the same y, and (c) return the cursor's new y so `_draw_paragraphs` can keep going. Replace the existing function with:

```python
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
```

Note: `_draw_wrapped` previously returned `None` and left the cursor on the last drawn line; the new version advances it past the last line (this matches what `_draw_paragraphs` expects). Existing tests that count `drawString` calls or check y-monotonicity still pass because the number of `drawString` calls per line is unchanged.

- [ ] **Step 1.3.4: Run the paragraph test and confirm pass**

Run: `cd backend && uv run pytest tests/test_export.py::test_pdf_preserves_paragraph_breaks -q`
Expected: PASS.

### Task 1.4: Drawing-box gap

- [ ] **Step 1.4.1: Add the drawing-box gap test to `backend/tests/test_export.py`**

Append:

```python
def test_pdf_drawing_box_leaves_leading_times_1_5_gap(monkeypatch):
    # When include_drawing_box=True, the first body drawString's y should
    # equal (box_bottom - leading * 1.5). We compute box_bottom from the
    # module constants and the page size, then compare.
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.units import inch
    from reportlab.pdfgen import canvas as canvas_mod
    from app.export import _MARGIN, _BOX_FRACTION
    from app.pedagogy import FONT_SIZES, LINE_SPACING

    width, height = LETTER
    font_size = FONT_SIZES["3"]
    leading = font_size * LINE_SPACING["3"]
    text_top_before_box = height - _MARGIN - (font_size * 2)
    box_bottom = text_top_before_box - (height - 2 * _MARGIN) * _BOX_FRACTION
    expected_first_y = box_bottom - leading * 1.5

    drawn: list[tuple[float, str]] = []
    real_draw = canvas_mod.Canvas.drawString

    def spy_draw(self, x, y, text, *args, **kwargs):
        drawn.append((y, text))
        return real_draw(self, x, y, text, *args, **kwargs)

    monkeypatch.setattr(canvas_mod.Canvas, "drawString", spy_draw)
    render_pdf(make_story(reading_level="3", pages=1, include_drawing_box=True, text="Body."))

    # First non-title drawString is the body's first line.
    body = [(y, t) for (y, t) in drawn if "For Maya" not in t]
    assert body, "expected at least one body line"
    first_y = body[0][0]
    assert abs(first_y - expected_first_y) < 0.01, (first_y, expected_first_y)
```

- [ ] **Step 1.4.2: Run to confirm failure**

Run: `cd backend && uv run pytest tests/test_export.py::test_pdf_drawing_box_leaves_leading_times_1_5_gap -q`
Expected: FAIL because the current code uses `text_top = box_bottom - font_size`. The fix is already included in the body rewrite from Step 1.3.3 (`text_top = box_bottom - leading * _BOX_GAP_LEADING`); if Step 1.3.3 was applied first the test passes after Step 1.4.1 with no further code change.

- [ ] **Step 1.4.3: If 1.3.3 was applied, re-run; if not, apply it now**

Run: `cd backend && uv run pytest tests/test_export.py::test_pdf_drawing_box_leaves_leading_times_1_5_gap -q`
Expected: PASS.

### Task 1.5: Full suite + em-dash sweep + commit

- [ ] **Step 1.5.1: Run the full backend suite**

Run: `cd backend && uv run pytest -q`
Expected: all tests pass.

- [ ] **Step 1.5.2: Em-dash sweep across touched files**

Run:

```bash
grep -nP '[–—]' backend/app/export.py backend/app/pedagogy.py backend/tests/test_export.py || echo "OK: no em/en dashes"
```

Expected: `OK: no em/en dashes`. If anything else, fix it.

- [ ] **Step 1.5.3: Stage and commit**

```bash
git add backend/app/export.py backend/app/pedagogy.py backend/tests/test_export.py
git commit -m "$(cat <<'EOF'
fix(backend): preserve paragraph breaks in PDF, widen line spacing, add gap below drawing box, fix em-dash in title

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit 2: RequestForm clear-on-submit + visible custom topics

`feat(frontend): RequestForm clears state on submit and shows custom topics as checkboxes`

**Files:**
- Modify: `frontend/src/components/RequestForm.tsx`
- Modify: `frontend/src/components/RequestForm.test.tsx`

### Task 2.1: Clear checked + custom topic state on submit

- [ ] **Step 2.1.1: Add the failing test to `frontend/src/components/RequestForm.test.tsx`**

Append inside the `describe("RequestForm", ...)` block, before its closing `});`:

```tsx
it("clears checked topics and custom drafts after submit", async () => {
  mockPresets();
  const onSubmit = vi.fn();
  render(<RequestForm onSubmit={onSubmit} />);
  await waitFor(() =>
    expect(screen.getByText(/Sports/)).toBeInTheDocument(),
  );

  await userEvent.type(screen.getByLabelText(/student.*name/i), "Maya");
  await userEvent.click(screen.getByRole("button", { name: /Sports/ }));
  const soccer = screen.getByRole("checkbox", { name: "Soccer" });
  await userEvent.click(soccer);
  expect(soccer).toBeChecked();

  await userEvent.click(screen.getByRole("button", { name: /generate/i }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

  // After submit, Soccer should no longer be checked.
  const soccerAfter = screen.getByRole("checkbox", { name: "Soccer" });
  expect(soccerAfter).not.toBeChecked();
});
```

- [ ] **Step 2.1.2: Run to confirm failure**

Run: `cd frontend && npm test -- --run RequestForm`
Expected: the new test fails because `Soccer` remains checked after submit.

- [ ] **Step 2.1.3: Update `frontend/src/components/RequestForm.tsx`**

Inside `handleSubmit`, immediately after the `onSubmit({...})` call, reset:

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
  }
```

Replace with:

```tsx
    onSubmit({
      child_name: childName.trim(),
      reading_level: readingLevel,
      genre,
      pages,
      include_drawing_box: includeBox,
      topics: Array.from(selected),
    });
    setSelected(new Set());
    setCustomDrafts({});
    setCustomTopics({});
    setErrors({});
  }
```

(`setCustomTopics` is added in Task 2.2; if you reach this step first, declare the state hook as part of this edit so the file compiles. The full hook addition is in Step 2.2.2.)

### Task 2.2: Custom topics render as checkboxes

- [ ] **Step 2.2.1: Add the failing test to `frontend/src/components/RequestForm.test.tsx`**

Append inside the `describe`:

```tsx
it("renders a custom topic as a toggleable checkbox under its category", async () => {
  mockPresets();
  const onSubmit = vi.fn();
  render(<RequestForm onSubmit={onSubmit} />);
  await waitFor(() =>
    expect(screen.getByText(/Sports/)).toBeInTheDocument(),
  );

  await userEvent.click(screen.getByRole("button", { name: /Sports/ }));
  await userEvent.type(
    screen.getByLabelText(/Add custom.*Sports/i),
    "Curling",
  );
  await userEvent.click(
    screen.getByRole("button", { name: /add Sports topic/i }),
  );

  // The custom topic now appears as a checked checkbox.
  const curling = screen.getByRole("checkbox", { name: "Curling" });
  expect(curling).toBeChecked();

  // It can be unchecked.
  await userEvent.click(curling);
  expect(curling).not.toBeChecked();
});
```

- [ ] **Step 2.2.2: Run to confirm failure**

Run: `cd frontend && npm test -- --run RequestForm`
Expected: this test fails because `Curling` does not appear as a checkbox.

- [ ] **Step 2.2.3: Update `frontend/src/components/RequestForm.tsx`**

Add a new state hook next to the existing ones:

Find:

```tsx
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
```

Add a new line between them:

```tsx
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({});
  const [customTopics, setCustomTopics] = useState<Record<string, string[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
```

Update `addCustom` to append to both `customTopics[category]` and `selected`:

Find:

```tsx
  function addCustom(category: string) {
    const draft = (customDrafts[category] || "").trim();
    if (!draft) return;
    setSelected((prev) => new Set(prev).add(draft));
    setCustomDrafts((prev) => ({ ...prev, [category]: "" }));
  }
```

Replace with:

```tsx
  function addCustom(category: string) {
    const draft = (customDrafts[category] || "").trim();
    if (!draft) return;
    setSelected((prev) => new Set(prev).add(draft));
    setCustomTopics((prev) => {
      const existing = prev[category] ?? [];
      if (existing.includes(draft)) return prev;
      return { ...prev, [category]: [...existing, draft] };
    });
    setCustomDrafts((prev) => ({ ...prev, [category]: "" }));
  }
```

Inside the expanded category panel, render the union of presets and customTopics. Find:

```tsx
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
```

Replace the inner block (the `subtopics.map(...)` call only) with:

```tsx
            {expanded.has(category) && (
              <div>
                {subtopics.concat(customTopics[category] ?? []).map((sub) => (
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
```

- [ ] **Step 2.2.4: Re-run RequestForm tests**

Run: `cd frontend && npm test -- --run RequestForm`
Expected: all RequestForm tests pass (clears-on-submit + custom-as-checkbox + existing 3).

### Task 2.3: Em-dash sweep + commit

- [ ] **Step 2.3.1: Em-dash sweep**

```bash
grep -nP '[–—]' frontend/src/components/RequestForm.tsx frontend/src/components/RequestForm.test.tsx || echo "OK: no em/en dashes"
```

Expected: `OK: no em/en dashes`.

- [ ] **Step 2.3.2: Run the full frontend suite as a sanity check**

Run: `cd frontend && npm test -- --run`
Expected: all suites green.

- [ ] **Step 2.3.3: Stage and commit**

```bash
git add frontend/src/components/RequestForm.tsx frontend/src/components/RequestForm.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): RequestForm clears state on submit and shows custom topics as checkboxes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit 3: Per-card show/hide and remove

`feat(frontend): per-card show/hide and remove`

**Files:**
- Modify: `frontend/src/components/StoryCard.tsx`
- Modify: `frontend/src/components/StoryCard.test.tsx`
- Modify: `frontend/src/components/StoryList.tsx`

### Task 3.1: Hide/Show story button on StoryCard

- [ ] **Step 3.1.1: Add the failing test to `frontend/src/components/StoryCard.test.tsx`**

Append inside the `describe("StoryCard", ...)` block, before its closing `});`:

```tsx
it("toggles the story body with the Hide/Show button", async () => {
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
  expect(screen.getByText("Once upon a time.")).toBeInTheDocument();
  const hideBtn = screen.getByRole("button", { name: /hide story/i });
  await userEvent.click(hideBtn);
  expect(screen.queryByText("Once upon a time.")).not.toBeInTheDocument();
  const showBtn = screen.getByRole("button", { name: /show story/i });
  await userEvent.click(showBtn);
  expect(screen.getByText("Once upon a time.")).toBeInTheDocument();
});
```

(The `onDismiss` prop will be added in Step 3.2 below; passing it now keeps the type contract consistent once both steps land. If the file does not yet have userEvent imported globally, the inline `await import(...)` above is fine — the existing test file does not import userEvent.)

- [ ] **Step 3.1.2: Run to confirm failure**

Run: `cd frontend && npm test -- --run StoryCard`
Expected: FAIL — `Hide story` button does not exist.

- [ ] **Step 3.1.3: Update `frontend/src/components/StoryCard.tsx`**

Add a `useState` import at the top:

```tsx
import { useState } from "react";
```

Add `onDismiss` to the `Props` interface (this prop is required and is also used in Task 3.2):

```tsx
interface Props {
  state: StoryCardState;
  request: StoryRequestContext;
  onPreviewPdf: (state: StoryCardState) => void;
  onDismiss: (story_id: string) => void;
}
```

Update the component signature:

```tsx
export default function StoryCard({ state, request, onPreviewPdf, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(true);
```

Replace the `<header>` block:

Find:

```tsx
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
```

Replace with:

```tsx
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
              className="card-toggle"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Hide story" : "Show story"}
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
```

Gate the body and skeleton on `expanded`:

Find:

```tsx
      {state.status === "pending" && (
        <div
          className="story-skeleton"
```

Wrap that whole block (the pending skeleton AND the `state.status === "done"` block, but NOT the error block, since errors should always be visible) with `expanded`:

```tsx
      {expanded && state.status === "pending" && (
        <div
          className="story-skeleton"
```

And for the done branch:

```tsx
      {expanded && state.status === "done" && (
```

The error branch stays unguarded — the error message must remain visible regardless of expanded state.

- [ ] **Step 3.1.4: Re-run StoryCard tests**

Run: `cd frontend && npm test -- --run StoryCard`
Expected: PASS for hide/show. Other StoryCard tests must also still pass (the existing tests don't pass `onDismiss`; they will TypeScript-fail unless updated. Update each existing `render(<StoryCard ... />)` call in the file to add `onDismiss={vi.fn()}`).

### Task 3.2: Remove button calls onDismiss

- [ ] **Step 3.2.1: Add the dismiss test inside the same describe**

```tsx
it("calls onDismiss with the story_id when the remove button is clicked", async () => {
  const userEvent = (await import("@testing-library/user-event")).default;
  const onDismiss = vi.fn();
  render(
    <StoryCard
      state={{
        ...baseState,
        story_id: "abc-123",
        status: "done",
        text: "Body.",
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
      onDismiss={onDismiss}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: /remove story/i }));
  expect(onDismiss).toHaveBeenCalledWith("abc-123");
});
```

- [ ] **Step 3.2.2: Run — should already pass**

Because Step 3.1.3 already adds the X button wired to `onDismiss`. Confirm:

Run: `cd frontend && npm test -- --run StoryCard`
Expected: PASS.

### Task 3.3: Wire StoryList.dismiss(id)

- [ ] **Step 3.3.1: Update `frontend/src/components/StoryList.tsx` to track dismissals**

Add the dismiss handler and pass it to each `StoryCard`. Find:

```tsx
export default function StoryList({ events, request, onPreviewPdf }: Props) {
  const [stories, setStories] = useState<Record<string, StoryCardState>>({});
  const [order, setOrder] = useState<string[]>([]);
```

Just below that, add:

```tsx
  function dismiss(id: string) {
    setOrder((o) => o.filter((x) => x !== id));
    setStories((s) => {
      const { [id]: _drop, ...rest } = s;
      return rest;
    });
  }
```

Then in the `list.map(...)` JSX, pass `onDismiss`:

Find:

```tsx
          list.map((state) => (
            <StoryCard
              key={state.story_id}
              state={state}
              request={request}
              onPreviewPdf={onPreviewPdf}
            />
          ))
```

Replace with:

```tsx
          list.map((state) => (
            <StoryCard
              key={state.story_id}
              state={state}
              request={request}
              onPreviewPdf={onPreviewPdf}
              onDismiss={dismiss}
            />
          ))
```

Inside the SSE event loop, the existing `s[ev.story_id]` lookups will return `undefined` for dismissed stories. Guard the spread updates so they don't reinsert a dismissed story:

Find each `setStories((s) => ({ ...s, [ev.story_id]: { ...s[ev.story_id], ... } }))` pattern. Replace each with a guarded version. Concretely, change:

```tsx
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
```

to:

```tsx
        } else if (ev.type === "attempt") {
          setStories((s) => {
            if (!s[ev.story_id]) return s;
            return { ...s, [ev.story_id]: { ...s[ev.story_id], attempts: ev.attempt } };
          });
        } else if (ev.type === "done") {
          setStories((s) => {
            if (!s[ev.story_id]) return s;
            return {
              ...s,
              [ev.story_id]: {
                ...s[ev.story_id],
                status: "done",
                text: ev.text,
                appropriate: ev.appropriate,
                predicted_grade: ev.predicted_grade,
                attempts: ev.attempts,
              },
            };
          });
        } else if (ev.type === "error" && ev.story_id) {
          setStories((s) => {
            if (!s[ev.story_id!]) return s;
            return {
              ...s,
              [ev.story_id!]: {
                ...s[ev.story_id!],
                status: "error",
                error: ev.message,
              },
            };
          });
        }
```

(The `started` event remains unguarded — it's the event that inserts the story.)

- [ ] **Step 3.3.2: Run the full frontend suite**

Run: `cd frontend && npm test -- --run`
Expected: all suites green, including the existing StoryList tests (which never dismiss anything).

### Task 3.4: Em-dash sweep + commit

- [ ] **Step 3.4.1: Sweep**

```bash
grep -nP '[–—]' frontend/src/components/StoryCard.tsx frontend/src/components/StoryCard.test.tsx frontend/src/components/StoryList.tsx || echo "OK: no em/en dashes"
```

- [ ] **Step 3.4.2: Stage and commit**

```bash
git add frontend/src/components/StoryCard.tsx frontend/src/components/StoryCard.test.tsx frontend/src/components/StoryList.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): per-card show/hide and remove

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit 4: Multi-kid session blocks

`feat(frontend): per-generation session blocks so each kid's name stays bound to their cards`

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/App.test.tsx`

### Task 4.1: Failing App test for two kid blocks

- [ ] **Step 4.1.1: Create `frontend/src/App.test.tsx`**

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
  // Open the category, check the topic, generate.
  const categoryBtn =
    topic === "Soccer"
      ? screen.getByRole("button", { name: /^Sports$/ })
      : screen.getByRole("button", { name: /^Animals$/ });
  await userEvent.click(categoryBtn);
  await userEvent.click(screen.getByRole("checkbox", { name: topic }));
  await userEvent.click(screen.getByRole("button", { name: /generate/i }));
}

describe("App multi-kid sessions", () => {
  it("renders one block per submission with newest at top", async () => {
    mockPresets();
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Sports$/ })).toBeInTheDocument(),
    );

    await submitFor("Maya", "Soccer");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Stories for Maya/i })).toBeInTheDocument(),
    );

    await submitFor("Liam", "Dinosaurs");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Stories for Liam/i })).toBeInTheDocument(),
    );

    // Both headings present.
    expect(screen.getByRole("heading", { name: /Stories for Maya/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Stories for Liam/i })).toBeInTheDocument();

    // Liam's block (newest) appears before Maya's in document order.
    const liam = screen.getByRole("heading", { name: /Stories for Liam/i });
    const maya = screen.getByRole("heading", { name: /Stories for Maya/i });
    const order = liam.compareDocumentPosition(maya);
    // 4 = DOCUMENT_POSITION_FOLLOWING
    expect(order & 4).toBeTruthy();
  });
});
```

- [ ] **Step 4.1.2: Run to confirm failure**

Run: `cd frontend && npm test -- --run App.test`
Expected: FAIL (current `App.tsx` only renders one block; the second submission overwrites the first).

### Task 4.2: Convert App to Session[] model

- [ ] **Step 4.2.1: Rewrite `frontend/src/App.tsx`**

Replace the entire file with:

```tsx
import { useState } from "react";
import RequestForm from "./components/RequestForm";
import StoryList from "./components/StoryList";
import PdfPreviewModal from "./components/PdfPreviewModal";
import { streamSse } from "./lib/sse";
import type { GenerateRequest, SseEvent } from "./types";
import type { StoryCardState } from "./components/StoryCard";
import "./App.css";

interface Session {
  id: string;
  request: GenerateRequest;
  events: AsyncGenerator<SseEvent>;
}

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [previewStory, setPreviewStory] = useState<{
    story: StoryCardState;
    request: GenerateRequest;
  } | null>(null);

  function handleSubmit(req: GenerateRequest) {
    setSessions((prev) => [
      {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        request: req,
        events: streamSse("/api/generate", req),
      },
      ...prev,
    ]);
  }

  return (
    <main className="page">
      <header className="app-header">
        <h1>AI Learning Tools</h1>
        <p className="tagline">
          Short reading-practice stories for kids who are learning to read.
        </p>
      </header>
      <RequestForm onSubmit={handleSubmit} />
      {sessions.map((s) => (
        <section key={s.id} className="kid-block">
          <h2>Stories for {s.request.child_name}</h2>
          <StoryList
            events={s.events}
            request={s.request}
            onPreviewPdf={(story) =>
              setPreviewStory({ story, request: s.request })
            }
          />
        </section>
      ))}
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
- `StoryList`'s prop shape doesn't change. `request` is the per-session snapshot.
- `previewStory` carries its own `request` snapshot so the PDF modal hits `/api/export` with the correct name/level/pages even after more sessions exist.
- `crypto.randomUUID` is the primary id source; the fallback exists only for the jsdom environment if it lacks `randomUUID`. (Vitest 4 / jsdom 29 has `crypto.randomUUID`; the fallback is dead code in practice but harmless.)

- [ ] **Step 4.2.2: Re-run App test**

Run: `cd frontend && npm test -- --run App.test`
Expected: PASS.

- [ ] **Step 4.2.3: Run the full frontend suite as a sanity check**

Run: `cd frontend && npm test -- --run`
Expected: all suites green.

### Task 4.3: Em-dash sweep + commit

- [ ] **Step 4.3.1: Sweep**

```bash
grep -nP '[–—]' frontend/src/App.tsx frontend/src/App.test.tsx || echo "OK: no em/en dashes"
```

- [ ] **Step 4.3.2: Stage and commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): per-generation session blocks so each kid's name stays bound to their cards

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit 5: Styling pass — crayon-bright palette + manual dark toggle

`style(frontend): crayon-bright marigold/indigo palette with manual dark toggle`

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/App.css`
- Modify: `frontend/src/App.tsx`

**Governing reference:** `skills/taste-skill/skills/taste-skill/SKILL.md`. Run its §14 Final Pre-Flight Check (mentally) before staging. The relevant items for this commit are: zero em-dashes, page theme lock (user-toggled, not auto-flipping mid-page), color consistency lock (marigold is THE accent everywhere), shape consistency (existing radius scale stays), CTA contrast (use `--accent-strong`, not `--accent`), form contrast, dark-mode parity.

### Task 5.1: Token swap in index.css

- [ ] **Step 5.1.1: Replace the `:root { ... }` and the `@media (prefers-color-scheme: dark)` block in `frontend/src/index.css`**

The new system uses a `data-theme` attribute on `<html>` as the explicit switch, with the media query as the system-preference fallback when no attribute is set.

Replace the existing `:root { ... }` block (the one with the sage tokens — `--accent: #6f9384;` etc.) with:

```css
:root {
  --sans:
    system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial,
    sans-serif;
  --serif:
    "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia,
    serif;
  --mono: ui-monospace, "SF Mono", Consolas, monospace;

  --bg: #FDF8EA;
  --surface: #FFFFFF;
  --surface-2: #F4ECD6;
  --border: #ECDFB8;
  --border-strong: #D9C58C;

  --ink: #1E1A14;
  --ink-muted: #5F574A;
  --ink-soft: #8A8170;

  --accent: #DFA025;
  --accent-strong: #B27A12;
  --accent-bg: rgba(223, 160, 37, 0.14);
  --accent-border: rgba(223, 160, 37, 0.45);
  --accent-on: #FFFFFF;

  --link-focus: #4A5A8A;

  --warning: #C24D5B;
  --warning-bg: rgba(194, 77, 91, 0.12);
  --warning-border: rgba(194, 77, 91, 0.42);

  --error: #C24D5B;
  --error-bg: rgba(194, 77, 91, 0.12);

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-pill: 999px;

  --shadow-sm: 0 1px 0 rgba(30, 26, 20, 0.04),
    0 2px 6px rgba(30, 26, 20, 0.06);
  --shadow-md: 0 1px 0 rgba(30, 26, 20, 0.05),
    0 6px 24px rgba(30, 26, 20, 0.1);
  --shadow-lg: 0 24px 64px rgba(30, 26, 20, 0.22);

  color-scheme: light dark;
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.55;
  letter-spacing: 0.005em;
  color: var(--ink);
  background: var(--bg);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

Replace the existing `@media (prefers-color-scheme: dark) { :root { ... } }` block with TWO blocks (an explicit `[data-theme="dark"]` selector plus a system-fallback that only applies when no `data-theme` attribute is set):

```css
[data-theme="dark"] {
  --bg: #1F1B14;
  --surface: #2A241D;
  --surface-2: #34291F;
  --border: #4A3D2C;
  --border-strong: #5C4A33;

  --ink: #F3EBD8;
  --ink-muted: #B6A98F;
  --ink-soft: #8C7E65;

  --accent: #F0B547;
  --accent-strong: #FFCC6A;
  --accent-bg: rgba(240, 181, 71, 0.16);
  --accent-border: rgba(240, 181, 71, 0.45);
  --accent-on: #1F1B14;

  --link-focus: #8FA1D8;

  --warning: #E48A93;
  --warning-bg: rgba(228, 138, 147, 0.16);
  --warning-border: rgba(228, 138, 147, 0.42);

  --error: #E48A93;
  --error-bg: rgba(228, 138, 147, 0.16);

  --shadow-sm: 0 1px 0 rgba(0, 0, 0, 0.4),
    0 2px 6px rgba(0, 0, 0, 0.32);
  --shadow-md: 0 1px 0 rgba(0, 0, 0, 0.4),
    0 8px 28px rgba(0, 0, 0, 0.42);
  --shadow-lg: 0 24px 64px rgba(0, 0, 0, 0.62);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --bg: #1F1B14;
    --surface: #2A241D;
    --surface-2: #34291F;
    --border: #4A3D2C;
    --border-strong: #5C4A33;

    --ink: #F3EBD8;
    --ink-muted: #B6A98F;
    --ink-soft: #8C7E65;

    --accent: #F0B547;
    --accent-strong: #FFCC6A;
    --accent-bg: rgba(240, 181, 71, 0.16);
    --accent-border: rgba(240, 181, 71, 0.45);
    --accent-on: #1F1B14;

    --link-focus: #8FA1D8;

    --warning: #E48A93;
    --warning-bg: rgba(228, 138, 147, 0.16);
    --warning-border: rgba(228, 138, 147, 0.42);

    --error: #E48A93;
    --error-bg: rgba(228, 138, 147, 0.16);

    --shadow-sm: 0 1px 0 rgba(0, 0, 0, 0.4),
      0 2px 6px rgba(0, 0, 0, 0.32);
    --shadow-md: 0 1px 0 rgba(0, 0, 0, 0.4),
      0 8px 28px rgba(0, 0, 0, 0.42);
    --shadow-lg: 0 24px 64px rgba(0, 0, 0, 0.62);
  }
}
```

Update the `:focus-visible` rule to use the new indigo accent for focus rings (better contrast against the marigold accent):

Find:

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```

Replace with:

```css
:focus-visible {
  outline: 2px solid var(--link-focus);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```

### Task 5.2: App.css updates for the new palette

- [ ] **Step 5.2.1: Add styles for the new components introduced in Commits 3 and 4**

Append at the end of `frontend/src/App.css`:

```css
/* ============================================================
   v2 additions
   ============================================================ */

.kid-block {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.kid-block h2 {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--ink);
}

.card-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

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

.card-close {
  background: transparent;
  border: none;
  font-size: 1.4rem;
  line-height: 1;
  color: var(--ink-muted);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.card-close:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.story-card > header h3 {
  border-bottom: 2px solid var(--accent);
  padding-bottom: 6px;
}

[data-theme="dark"] .story-card > header h3 {
  border-bottom-color: var(--accent-strong);
}

.theme-toggle {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--ink-muted);
  padding: 6px 12px;
  font-size: 0.9rem;
  border-radius: var(--radius-pill);
}

.theme-toggle:hover {
  color: var(--ink);
  background: var(--surface-2);
}

.app-header {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.app-header > div.app-header-text {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
```

The previous `.app-header` rule (a column-flex container) is overridden by this block. If the existing `.app-header` rule conflicts, leave both in place — the later rule wins. Verify by reading the resulting CSS or by visual check at the end.

### Task 5.3: Toggle button in App.tsx header

- [ ] **Step 5.3.1: Add the theme toggle to `frontend/src/App.tsx`**

Update the `App.tsx` you wrote in Commit 4 to include theme initialization on mount + a toggle button. Replace the file with:

```tsx
import { useEffect, useState } from "react";
import RequestForm from "./components/RequestForm";
import StoryList from "./components/StoryList";
import PdfPreviewModal from "./components/PdfPreviewModal";
import { streamSse } from "./lib/sse";
import type { GenerateRequest, SseEvent } from "./types";
import type { StoryCardState } from "./components/StoryCard";
import "./App.css";

interface Session {
  id: string;
  request: GenerateRequest;
  events: AsyncGenerator<SseEvent>;
}

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

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
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
      {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        request: req,
        events: streamSse("/api/generate", req),
      },
      ...prev,
    ]);
  }

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
        <section key={s.id} className="kid-block">
          <h2>Stories for {s.request.child_name}</h2>
          <StoryList
            events={s.events}
            request={s.request}
            onPreviewPdf={(story) =>
              setPreviewStory({ story, request: s.request })
            }
          />
        </section>
      ))}
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

### Task 5.4: Suite check, manual visual check, sweep + commit

- [ ] **Step 5.4.1: Run the full frontend suite**

Run: `cd frontend && npm test -- --run`
Expected: all suites green. The `App.test.tsx` from Commit 4 should still pass — the toggle button does not interfere with the kid-block headings the test asserts on.

- [ ] **Step 5.4.2: Visual smoke check in the browser**

Verify the dev servers are running (`lsof -nP -iTCP:8000 -iTCP:5173 -sTCP:LISTEN`). If not:

```bash
cd backend && uv run uvicorn app.main:app --reload &  # or `make backend`
cd frontend && npm run dev &                          # or `make frontend`
```

Open http://localhost:5173. Confirm:
- The page reads warm marigold + cream (not sage green).
- Clicking "Switch to dark" flips the page to the dark palette; clicking again flips back. The label text updates each time.
- `<html data-theme="dark">` is present after toggling (verify in DevTools).
- `localStorage.lt-theme` reflects the active choice.
- The "Generate" CTA and "Download" CTA both use the same marigold (`--accent-strong`).

Capture nothing — this is a sanity check, not a test.

- [ ] **Step 5.4.3: Run the taste-skill §14 pre-flight check mentally**

Walk through `skills/taste-skill/skills/taste-skill/SKILL.md` §14 against the diff. The boxes that apply to this small-app context:

- Zero em-dashes anywhere on the page. ✓ (verified by sweep below)
- Page Theme Lock: one theme at a time, no section flips. ✓
- Color Consistency Lock: marigold is THE accent everywhere. ✓
- Shape Consistency Lock: existing `--radius-sm/-md/-lg/-pill` unchanged. ✓
- Button Contrast Check: CTAs use `--accent-strong` (B27A12 light, FFCC6A dark), both pass WCAG AA. ✓
- Form Contrast Check: inputs, placeholders, focus rings on the new palette. ✓
- Reduced motion: existing `prefers-reduced-motion` overrides preserved (skeleton, card-in, backdrop-in). ✓
- Dark mode tokens defined and tested in both modes. ✓

- [ ] **Step 5.4.4: Em-dash sweep**

```bash
grep -nP '[–—]' frontend/src/index.css frontend/src/App.css frontend/src/App.tsx || echo "OK: no em/en dashes"
```

- [ ] **Step 5.4.5: Stage and commit**

```bash
git add frontend/src/index.css frontend/src/App.css frontend/src/App.tsx
git commit -m "$(cat <<'EOF'
style(frontend): crayon-bright marigold/indigo palette with manual dark toggle

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## After all five commits

- Run the full suite one last time:

```bash
cd backend && uv run pytest -q
cd frontend && npm test -- --run
```

- Repo-wide em-dash sweep (only source/test files; skip the spec):

```bash
grep -nrP '[–—]' backend/app backend/tests frontend/src || echo "OK: no em/en dashes"
```

- Confirm `git log --oneline -n 6` shows exactly the five new commits at the top:

```
<sha> style(frontend): crayon-bright marigold/indigo palette with manual dark toggle
<sha> feat(frontend): per-generation session blocks so each kid's name stays bound to their cards
<sha> feat(frontend): per-card show/hide and remove
<sha> feat(frontend): RequestForm clears state on submit and shows custom topics as checkboxes
<sha> fix(backend): preserve paragraph breaks in PDF, widen line spacing, add gap below drawing box, fix em-dash in title
313a63d docs: add UI iteration v2 design spec
```

Then it is ready for review.
