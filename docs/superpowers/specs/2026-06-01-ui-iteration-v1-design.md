# UI iteration v2 — Design

**Date:** 2026-06-01
**Status:** Draft, pending implementation plan
**Builds on:** [`2026-05-30-learning-tools-design.md`](./2026-05-30-learning-tools-design.md)

## Overview

A focused second pass on the v1 UI driven by hands-on feedback from a teacher
using the app. Eight items, mixing tight bug fixes (PDF paragraph breaks,
clearing checked topics after submit) with real feature work (multi-kid
session model, expandable + removable story cards) and a styling revisit
(crayon-bright marigold + indigo palette with a manual dark-mode toggle).

No new endpoints. No data-model changes. Bundle download semantics and SSE
event shapes are unchanged. Everything is in-place edits to existing files
plus a small amount of new local state.

## Goals

- Teacher can iterate on multiple students in one session without their
  earlier stories getting silently re-labeled with the new student's name.
- Generated PDFs preserve paragraph structure and breathe; the drawing box
  doesn't crowd the text below it.
- The form is reusable: after Generate, topics clear; custom topics added
  to a category appear as checkboxes that can be unchecked.
- Each story card can be collapsed to free vertical space and removed
  (with an X) when the teacher is done with it.
- The page reads warm and a little playful, not "calm in the way a
  spreadsheet is calm." Dark mode stays available but as a manual choice,
  not the default auto-flip.

## Non-goals (v2)

- True cancellation of an in-flight SSE stream when a card's X is clicked.
  The card disappears from the UI; the backend continues; results are
  discarded. Real cancellation requires `AbortController` plumbing through
  `streamSse` and is out of scope.
- Persistence of generated stories across page reloads. Sessions live in
  React state only.
- Cross-kid bundle downloads. Each kid's block has its own
  "Download all" buttons; the zip is per-kid.
- Deduping repeated submissions for the same kid + topic. Teacher can use
  the X to remove duplicates.
- A theme-aware logo / illustrative assets. The palette is the whole
  visual change; no new imagery.

## Item-by-item

### 1. PDF rendering fixes (`backend/app/export.py`)

Three coupled bugs in `render_pdf` + `_draw_wrapped`, plus the title's
em-dash.

**Paragraph breaks lost.** `_draw_wrapped` does `text.split()`, which
collapses `\n\n` into a single space. Fix: `render_pdf` splits each page
chunk on `\n\n` to get paragraph blocks, then calls a paragraph-aware
draw routine that wraps within each paragraph and emits a vertical gap
(`leading * 0.7`) between paragraphs. The existing `_draw_wrapped`
becomes the per-paragraph helper; the new orchestration code lives in
`render_pdf`.

**Tight line spacing.** Bump `LINE_SPACING` in `app/pedagogy.py`:

| Level | Old | New |
|-------|-----|-----|
| K     | 1.6 | 1.8 |
| 1     | 1.5 | 1.7 |
| 2     | 1.4 | 1.6 |
| 3     | 1.35| 1.55|
| 4     | 1.3 | 1.5 |
| 5     | 1.3 | 1.5 |

Existing `test_export.py` test that snapshots the table is updated in
the same commit.

**Drawing-box crowds the text.** Replace
`text_top = box_bottom - font_size` with
`text_top = box_bottom - leading * _BOX_GAP_LEADING` where
`_BOX_GAP_LEADING = 1.5` is a module-local constant in `export.py`.

**Em-dash in title.** `f'For {story.child_name} — "{story.topic}"'`
appears in both the PDF (`render_pdf`) and DOCX (`render_docx`). Swap
the em-dash for a colon: `f'For {story.child_name}: "{story.topic}"'`.
Project policy bans em-dashes in user-visible strings; this title slipped
through in v1.

### 2. RequestForm — clear-on-submit + visible custom topics (`components/RequestForm.tsx`)

Two behaviors a teacher relies on for repeat submissions.

**Clear checked + custom-topic state after submit.** After the parent's
`onSubmit(...)` call returns, reset:

```ts
setSelected(new Set());
setCustomDrafts({});
setCustomTopics({});
setErrors({});
```

The form stays mounted (so reading-level, genre, pages, drawing-box, and
child-name choices persist for quick reuse).

**Custom topics render as checkboxes.** Today's `addCustom(category)`
adds the draft string to `selected` but the UI only iterates
`presets[category]`, so the new topic is invisible (and can't be
unchecked). Introduce a new piece of state:

```ts
const [customTopics, setCustomTopics] =
  useState<Record<string, string[]>>({});
```

`addCustom(category)` appends to BOTH `customTopics[category]` and
`selected`. Inside the category's expanded panel, render
`presets[category].concat(customTopics[category] ?? [])` as checkboxes.
A teacher can now toggle a custom topic the same way as a preset.

### 3. Multi-kid session model (`App.tsx` + `StoryList.tsx`)

The v1 bug: `App.tsx` keeps one `request` state that gets overwritten on
each submit. Existing `StoryCard`s read `request.child_name` from that
live object, so submitting for "Liam" silently relabels Maya's earlier
cards.

Fix: introduce a `Session` per generation and append (newest at top, see
"Render order" below).

```ts
type Session = {
  id: string;                       // crypto.randomUUID()
  request: GenerateRequest;         // frozen at submit time
  events: AsyncGenerator<SseEvent>; // bound to this session
};
```

`App.tsx` state:

```ts
const [sessions, setSessions] = useState<Session[]>([]);
const [previewStory, setPreviewStory] = useState<{
  story: StoryCardState;
  request: GenerateRequest;
} | null>(null);
```

`handleSubmit` prepends (so newest appears at the top):

```ts
function handleSubmit(req: GenerateRequest) {
  setSessions(prev => [
    { id: crypto.randomUUID(), request: req, events: streamSse("/api/generate", req) },
    ...prev,
  ]);
}
```

**Render order: newest-at-top.** A teacher generating a fresh batch sees
it appear immediately above their previous batches without having to
scroll. The most common interaction pattern is "generate, look, maybe
download, generate again for the next kid" — keeping the active block
near the form matters more than chronological preservation.

`previewStory` carries its own request snapshot so the PDF modal hits
`/api/export` with the correct name/level/pages even after several more
sessions have been started.

Render flow:

```tsx
<main>
  <RequestForm onSubmit={handleSubmit} />
  {sessions.map(s => (
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
```

`StoryList`'s props don't change shape — it still takes one `events`
generator and one `request`. Bundle downloads stay inside `StoryList`
and naturally become per-kid.

### 4. Card UX — expand/collapse + remove (`StoryCard.tsx`, `StoryList.tsx`)

**Show/hide story body.** Each `StoryCard` gets local boolean state
`expanded`, default `true` (the teacher just generated it; they want to
see it). The card header gains a small text-label button — "Hide story" /
"Show story", not an icon, so the affordance is obvious. When collapsed:
header + badge + actions row + helper visible; story body and skeleton
both hidden. Collapse state is per-card and ephemeral (not persisted).

**Remove with X.** Each `StoryCard` header also gets an `<button
aria-label="Remove story" className="card-close">×</button>` (the same
`×` glyph the modal uses, for consistency). Clicking calls
`onDismiss(state.story_id)`, a new prop. `StoryList` handles it by
removing that id from both `order` and `stories`:

```ts
function dismiss(id: string) {
  setOrder(o => o.filter(x => x !== id));
  setStories(s => { const { [id]: _, ...rest } = s; return rest; });
}
```

**X on pending cards** is allowed — lets a teacher abandon a generation
without waiting. Backend SSE keeps streaming for that story; the
`useEffect` loop in `StoryList` will receive its `done` or `error` event,
try to look up the id in `stories`, find nothing, and silently drop it.
No leak beyond the in-flight HTTP connection itself.

**Empty-block behavior.** If a teacher removes every card in a kid's
block, the block's `<StoryList>` shows its empty-state placeholder
("Stories will appear here as they are generated."). The block itself
stays — removing the kid's block entirely is out of scope for v2.

### 5. Styling pass v2 — crayon-bright (`index.css`, `App.css`, `App.tsx`)

**Light mode tokens** (replaces the sage cream system from v1):

```
--bg:           #FDF8EA;
--surface:      #FFFFFF;
--surface-2:    #F4ECD6;
--border:       #ECDFB8;
--border-strong:#D9C58C;
--ink:          #1E1A14;
--ink-muted:    #5F574A;
--accent:       #DFA025;            /* marigold, decorative only */
--accent-strong:#B27A12;            /* marigold, CTA (passes WCAG AA) */
--accent-bg:    rgba(223,160,37,0.14);
--link-focus:   #4A5A8A;            /* indigo, focus rings + links */
--warning:      #C24D5B;            /* rosehip */
--warning-bg:   rgba(194,77,91,0.12);
--warning-border: rgba(194,77,91,0.42);
```

**Dark mode tokens:**

```
--bg:           #1F1B14;
--surface:      #2A241D;
--surface-2:    #34291F;
--border:       #4A3D2C;
--border-strong:#5C4A33;
--ink:          #F3EBD8;
--ink-muted:    #B6A98F;
--accent:       #F0B547;            /* lifted marigold */
--accent-strong:#FFCC6A;            /* lifted CTA */
--accent-bg:    rgba(240,181,71,0.16);
--link-focus:   #8FA1D8;            /* lifted indigo */
--warning:      #E48A93;            /* lifted rosehip */
--warning-bg:   rgba(228,138,147,0.16);
--warning-border: rgba(228,138,147,0.42);
```

**Mode application.** Switch from CSS media-query auto-flip to a
`data-theme` attribute on `<html>`:

```css
:root                { /* light tokens */ }
[data-theme="dark"]  { /* dark tokens */ }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) { /* dark tokens, same values */ }
}
```

The media-query block is the system-preference fallback when the user
hasn't picked manually. Once they click the toggle, `<html>` carries an
explicit `data-theme="light" | "dark"` attribute and the media query no
longer applies.

**Toggle.** A small button in `.app-header`, label text "Switch to dark"
/ "Switch to light" (text label, not an icon — same accessibility
reasoning as the card collapse button). On click:

```ts
function setTheme(next: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("lt-theme", next);
}
```

On `App` mount: read `localStorage["lt-theme"]` first; if missing, do
nothing (CSS media-query fallback handles it).

**Decoration.**

- Category chips in `RequestForm` get a soft per-category tint (very
  light fill, no border, ink text). Tint hue is hashed from the category
  name so it's stable across renders. No new content — the chips are
  the existing category toggle buttons.
- `StoryCard` header gets a 2px marigold underline
  (`border-bottom: 2px solid var(--accent)` in light mode,
  `border-bottom: 2px solid var(--accent-strong)` in dark) below the
  `<h3>` title — gives each card a friendly anchor without adding chrome.

**Contrast audit (re-done).** Marigold `#DFA025` on white = ~2.5:1,
fails WCAG AA for text. All CTAs use `--accent-strong` (`#B27A12` light,
`#FFCC6A` dark) which lands above 4.5:1 on its respective surface.
Rosehip `#C24D5B` text on `--warning-bg` over `--surface` traces to
~4.6:1 in light, ~5.0:1 in dark — both pass. Indigo `#4A5A8A` for focus
rings is decorative (focus is communicated by the outline shape, not
text contrast), but it also passes AA for link text on `--surface`.

## Data flow (summary)

```
┌─────────────────────────────────────────────────────────────────┐
│ App.tsx                                                         │
│  sessions: Session[]                                            │
│  previewStory: {story, request} | null                          │
│                                                                 │
│  RequestForm ──onSubmit──▶ prepend Session{id, req, streamSse()}│
│                                                                 │
│  sessions.map ─▶  <section> per kid                             │
│                     │                                           │
│                     ├─ StoryList(events, request, onDismiss)    │
│                     │    │                                      │
│                     │    └─ StoryCard per story                 │
│                     │         (state.expanded, onDismiss(id))   │
│                     │                                           │
│                     └─ bundle download buttons                  │
│                          (per-kid, named {child_name}_stories)  │
│                                                                 │
│  PdfPreviewModal(open, story, request, onClose)                 │
│    request comes from previewStory.request                      │
│      (the session's FROZEN snapshot, not App's latest)          │
└─────────────────────────────────────────────────────────────────┘
```

## Error handling

No new error surfaces. Existing patterns hold:

- Form validation errors render below their inputs (already in place).
- SSE `error` events become the card's "error" status (already in place).
- `/api/export` failure inside the PDF modal already shows
  "Couldn't generate PDF. Try again." Unchanged.
- The PDF paragraph-aware draw routine treats single-paragraph input as
  one paragraph (no empty gaps), and empty input as the current behavior
  (renders nothing — `split_into_pages` returns `""` chunks for under-fed
  inputs).

## Testing

**Backend (`backend/tests/test_export.py`)**

- Update the existing `LINE_SPACING` snapshot to the new values.
- New: render a PDF from a story with three `\n\n`-separated paragraphs
  and assert via a `c.drawString` mock that:
  - there is at least one `drawString` call per paragraph,
  - the y-coordinate decreases monotonically across calls,
  - the gap between the last call of paragraph N and the first call of
    paragraph N+1 is strictly greater than the intra-paragraph leading.
- New: assert title format swapped — render a story for `Maya / Soccer`
  and assert the DOCX title and PDF first-page drawString contain
  `For Maya: "Soccer"` (and do NOT contain `—`).
- New: assert the drawing-box gap — render a story with
  `include_drawing_box=True` and confirm the first text-body drawString
  y is `(box_bottom - leading * 1.5)`.

**Frontend (`frontend/src/components/`)**

- `RequestForm.test.tsx`:
  - "clears checked topics and custom drafts after submit": render,
    check a preset, click Generate, assert the checkbox is no longer
    checked.
  - "custom topic appears as a checkbox and can be unchecked": render,
    expand a category, type into the custom-topic input, click Add,
    assert the new topic appears as a checked checkbox inside the
    category, click it, assert it becomes unchecked.

- `StoryCard.test.tsx`:
  - "Hide story button toggles body visibility": render a done story,
    assert body visible, click "Hide story", assert body hidden, click
    "Show story", assert body visible again.
  - "Remove button calls onDismiss with story_id": render with a
    `vi.fn()` `onDismiss`, click the X, assert called with the right id.

- New `App.test.tsx` (minimal):
  - "Two submissions with different child_name produce two kid blocks":
    mock `streamSse` to return a generator emitting one `started` event
    per submit, render `App`, fill the form for Maya + click Generate,
    fill for Liam + click Generate, assert both
    "Stories for Maya" and "Stories for Liam" headings are in the
    document, with Liam's appearing first (newest-at-top).

## Sequencing

Five commits in order. Each is independently testable and the suite is
green at every point:

1. `fix(backend): preserve paragraph breaks in PDF, widen line spacing, add gap below drawing box, fix em-dash in title`
   - `backend/app/export.py`, `backend/app/pedagogy.py`,
     `backend/tests/test_export.py`.

2. `feat(frontend): RequestForm clears state on submit and shows custom topics as checkboxes`
   - `frontend/src/components/RequestForm.tsx`,
     `frontend/src/components/RequestForm.test.tsx`.

3. `feat(frontend): per-card show/hide and remove`
   - `frontend/src/components/StoryCard.tsx`,
     `frontend/src/components/StoryList.tsx`,
     `frontend/src/components/StoryCard.test.tsx`.

4. `feat(frontend): per-generation session blocks so each kid's name stays bound to their cards`
   - `frontend/src/App.tsx`,
     `frontend/src/components/StoryList.tsx` (minor — onDismiss already
     plumbed in step 3; this commit may not need to touch StoryList),
     new `frontend/src/App.test.tsx`.

5. `style(frontend): crayon-bright marigold/indigo palette with manual dark toggle`
   - `frontend/src/index.css`, `frontend/src/App.css`,
     `frontend/src/App.tsx` (header toggle).

## Pre-flight (taste-skill)

Re-running the relevant items from the v1 pass against this design:

- Em-dash sweep: zero in source code, including the PDF/DOCX title
  (now a colon). Spec file uses em-dashes in prose — design docs are
  not user-visible artifacts shipped to teachers, so the policy doesn't
  apply here.
- Page theme lock: one theme at a time; user toggles between light and
  dark explicitly. No section flips.
- Color consistency lock: marigold is the single CTA color used across
  RequestForm Generate, modal Download, and (planned) any future
  filled-button CTAs. Decorative category-chip tints are deliberately
  pale and used only for the chips.
- Shape consistency: same scale as v1 (`--radius-sm 6`, `--radius-md 10`,
  `--radius-lg 14`, `--radius-pill 999`). Unchanged.
- Contrast: traced above. All interactive surfaces pass WCAG AA in both
  modes.
- Motion: same low-intensity hover transitions, skeleton pulse, card-in
  fade. Reduced-motion overrides preserved.
