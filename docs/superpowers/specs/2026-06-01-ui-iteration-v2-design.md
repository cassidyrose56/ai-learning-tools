# UI iteration v2 - Design

**Date:** 2026-06-01
**Status:** Draft, pending implementation plan
**Builds on:** [`2026-06-01-ui-iteration-v1-design.md`](./2026-06-01-ui-iteration-v1-design.md)

## Overview

A second teacher-driven pass on the v1 UI. Nine items, grouped: two
styling fixes (native-control color-scheme bug in light mode, palette
adaptation to the eggshell + twilight-indigo + burnt-peach + muted-teal
+ apricot-cream system the teacher attached), three UI changes
(consolidate the per-kid "Stories for X" sections into one global list
with one cross-kid bundle download, replace the text Hide/Show button
with a chevron that gives a 5-line preview when collapsed, fix the
Pages number-input UX), and four PDF fixes (sentence regex preserves
closing quotation marks, body text expands to fill the page, drop the
title from the PDF, indent the first line of each paragraph).

No new endpoints. No schema changes. Bundle download semantics shift
from per-kid zips to a single cross-kid zip. SSE event shapes are
unchanged. Everything else is in-place edits.

## Goals

- Light-mode form controls (radios, checkboxes) render with light
  swatches even when the user's OS is in dark mode but they have
  toggled the app to light.
- Palette feels like the teacher's reference: warm cream eggshell base,
  twilight indigo as the anchor ink + focus color, burnt peach as the
  warm CTA, muted teal as the secondary decorative tone, apricot cream
  for soft warm tints. Contrast still passes WCAG AA on all interactive
  surfaces.
- Generated stories for multiple kids land in one shared list and can
  be downloaded together as one zip.
- A teacher can see at a glance which story is which without having to
  expand them: collapsed cards show the first five lines.
- The pages-count input behaves like every other text input: backspace
  empties it, the next typed digit replaces (does not pad) the value.
- Generated PDFs preserve every sentence (no quoted-line dropouts),
  fill the page vertically, drop the redundant title, and indent
  paragraph first lines like a book.

## Non-goals (v2)

- Reorganizing the zip into per-kid subfolders. The zip is flat;
  filenames already disambiguate via `safe_filename(child, topic)`.
- A theme-aware accent picker / multiple palettes. Single palette.
- Resizing the font dynamically to fill the page. Only the vertical
  spacing (leading + paragraph gap) is stretched, capped at 2x the base.
- Removing the page-count concept entirely. Teachers can still ask for
  N pages; we just make each page visually full.
- True cancellation of in-flight SSE streams. Card removal still drops
  results on receipt (unchanged from v1).
- Persistence across reloads. Story list is React state.

## Item-by-item

### 1. Color-scheme bug in light mode (`frontend/src/index.css`)

**Symptom.** In light mode, the "Add a drawing box" checkbox and the
unselected Genre radio render as solid dark squares / dots. The
screenshot shows it clearly: the page chrome is cream + indigo, but the
native form widgets are pulling their dark-mode swatches from the
underlying OS scheme.

**Cause.** `:root { color-scheme: light dark; }` declares both schemes
as supported. Native form controls in Chrome/Safari then pick the
swatch matching the OS preference, ignoring our `data-theme` attribute.
A user whose OS is in dark mode but who clicks our "Switch to light"
toggle gets light app chrome with dark native widgets.

**Fix.** Bind `color-scheme` to the active theme, not "either":

```css
:root             { color-scheme: light; }
[data-theme="dark"] { color-scheme: dark; }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) { color-scheme: dark; }
}
```

That is: the explicit attribute wins, otherwise the system fallback
applies, but neither is "both." Native checkboxes, radios, scrollbars,
date pickers all follow the page's actual theme now.

Add an explicit `background: var(--surface); color: var(--ink);` on
`input[type="checkbox"]` and `input[type="radio"]` via accent-color
only - we already do that. No widget-styling change beyond color-scheme
itself.

### 2. Palette adaptation (`index.css`, `App.css`)

**Reference colors** (teacher's screenshot):

| Name           | Hex      | Role in spec                       |
|----------------|----------|------------------------------------|
| Eggshell       | #F4F1DE  | Page background                    |
| Twilight Indigo| #3D405B  | Ink / focus rings / link color     |
| Burnt Peach    | #E07A5F  | CTA fill (warm primary)            |
| Muted Teal     | #81B29A  | Secondary decorative (success tone)|
| Apricot Cream  | #F2CC8F  | Soft warm tint (surface accents)   |

The previous palette used marigold + cream. We swap to indigo-anchored
text with peach CTAs and teal/apricot as decorative warm tones.
Marigold/sage tokens are gone.

**Light tokens** (new):

```
--bg:            #F4F1DE   /* eggshell */
--surface:       #FFFFFF
--surface-2:     #EAE3C7   /* light eggshell tint for hover/chips */
--surface-warm:  #F8E1B8   /* apricot tint - decorative */
--border:        #DCD4B0
--border-strong: #C2B788

--ink:           #1E1D2C   /* near-indigo, ~17:1 on bg */
--ink-muted:     #4A4D66
--ink-soft:      #7B7E8F

--accent:        #E07A5F   /* burnt peach - CTA fill */
--accent-strong: #C8654A   /* darker peach for hover */
--accent-bg:     rgba(224, 122, 95, 0.14)
--accent-border: rgba(224, 122, 95, 0.45)
--accent-on:     #1E1A14   /* near-black ink on peach passes AA */

--indigo:        #3D405B   /* link + focus + secondary ink */
--indigo-strong: #2A2D44

--success:       #81B29A   /* muted teal */
--success-bg:    rgba(129, 178, 154, 0.20)

--link-focus:    #3D405B

--warning:       #B25E45
--warning-bg:    rgba(178, 94, 69, 0.14)
--warning-border:rgba(178, 94, 69, 0.42)

--error:         #B25E45
--error-bg:      rgba(178, 94, 69, 0.14)
```

**Dark tokens** (new):

```
--bg:            #1F1F2E   /* deep indigo */
--surface:       #2A2A3E
--surface-2:     #34344A
--surface-warm:  #3F3225
--border:        #46465E
--border-strong: #5C5C76

--ink:           #F4F1DE   /* eggshell on dark */
--ink-muted:     #BCB9A8
--ink-soft:      #8C8A7A

--accent:        #F09578   /* lifted peach */
--accent-strong: #F2A88E
--accent-bg:     rgba(240, 149, 120, 0.18)
--accent-border: rgba(240, 149, 120, 0.45)
--accent-on:     #1F1F2E

--indigo:        #8FA1D8   /* lifted indigo for visibility */
--indigo-strong: #A5B4E0

--success:       #A0CFB8
--success-bg:    rgba(160, 207, 184, 0.20)

--link-focus:    #8FA1D8

--warning:       #E8A48E
--warning-bg:    rgba(232, 164, 142, 0.18)
--warning-border:rgba(232, 164, 142, 0.42)

--error:         #E8A48E
--error-bg:      rgba(232, 164, 142, 0.18)
```

**Contrast check.**

- CTA: `#1E1A14` ink on `#E07A5F` peach -> ~5.6:1, passes AA for normal
  text. (Pure indigo `#3D405B` on peach is only ~3.0:1 - we use the
  darker `#1E1A14`.) In dark mode `#1F1F2E` on `#F09578` -> ~5.4:1.
- Body ink `#1E1D2C` on `#F4F1DE` -> ~16.8:1.
- Link/focus `#3D405B` on `#F4F1DE` -> ~8.9:1.
- Warning text `#B25E45` on `#FFFFFF` -> ~4.7:1.
- Dark mode body `#F4F1DE` on `#1F1F2E` -> ~14.5:1.

**Where the colors land in the chrome.**

- `button[type="submit"]` (Generate, modal Download): peach fill,
  near-black ink. Hover: darker peach.
- Story card header underline: peach in light, lifted peach in dark.
- Focus rings: indigo (already `--link-focus` in v1 - color value
  changes).
- Category chip left-border accent: still uses `--accent-bg` (now
  peach-tinted).
- Inputs on focus: peach border + peach-bg ring (was marigold).
- Categories pane left-border accent (`.categories > div > div` rule):
  uses `--accent-bg` -> peach tint. Consistent.
- Empty-state placeholder border: still `--border-strong`.
- Success-tone decorative bits (when something *finished*, e.g. the
  helper that "PDFs are pre-formatted...") stay neutral; teal is held
  in reserve for the v3 evaluator confidence indicator and is included
  here so the token vocabulary is complete - it is NOT styled into any
  v2 element to avoid color-creep.

**Marigold removal sweep.** Replace any hardcoded `#DFA025`, `#B27A12`,
`#F0B547`, `#FFCC6A` in `App.css` (the category chip color hash, the
story-card header underline, the dark-mode underline override) with
their new equivalents via the tokens. Concretely, the lines:

```css
.story-card > header h3 {
  border-bottom: 2px solid var(--accent);
  ...
}
[data-theme="dark"] .story-card > header h3 {
  border-bottom-color: var(--accent-strong);
}
```

stay as-is - they reference `--accent`/`--accent-strong`, which now
resolve to peach. The pen is the same; the ink changes.

### 3. Pages input UX (`components/RequestForm.tsx`)

**Symptom.** Default is `2`. Backspace -> input shows empty -> state
becomes `0` (because `parseInt("", 10) || 0` is `0`) -> input now shows
`0`. Typing `1` -> the displayed value is `"01"` (or `"10"`, depending
on cursor position); state becomes `1`. Either way it looks wrong.

**Fix.** Track the input as `number | ""` so the empty intermediate
state is representable:

```tsx
const [pages, setPages] = useState<number | "">(2);

<input
  type="number"
  min={1}
  value={pages}
  onChange={(e) => {
    const v = e.target.value;
    if (v === "") return setPages("");
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return;
    setPages(n);
  }}
/>
```

Submit validation rejects empty / `<1`:

```ts
if (pages === "" || pages < 1) next.pages = "Pages must be at least 1.";
```

And the request payload uses `pages as number` (gated by the
validation):

```ts
onSubmit({ ..., pages: pages as number, ... });
```

The browser's `min={1}` already constrains the up/down arrows; the
state type carries the empty-while-typing case.

### 4. Chevron + 5-line preview (`components/StoryCard.tsx`, `App.css`)

**Replace.** The current "Hide story" / "Show story" text button is
replaced with a chevron icon button:

- Expanded: `▾` (U+25BE, down-pointing) with `aria-label="Collapse story"`
- Collapsed: `▸` (U+25B8, right-pointing) with `aria-label="Expand story"`

**Behavior change.** Today, `expanded = false` hides the story body
entirely. After v2, `expanded = false` instead clamps the body to the
first 5 visual lines:

```css
.story-text--collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

The collapsed card still shows the actions row (`Download as Word`,
`Download as PDF`) and the helper text below the body. The chevron
toggle sits in the header next to the X. Default state is **expanded**
(teacher just generated it and wants to see it).

A subtle ellipsis-via-line-clamp covers the truncated tail. We keep
`white-space: pre-wrap` on the body so paragraph structure is
preserved within the visible 5 lines.

The line clamp works only on `-webkit-`-prefixed properties, which all
modern browsers (Chrome, Safari, Firefox 68+, Edge) implement under
that prefix - that is the de-facto standard for line-clamp despite the
vendor prefix.

### 5. Consolidated cross-kid story list (`App.tsx`, `components/StoryList.tsx`, new `components/SessionStreamer.tsx`)

**v1 layout (current):**

```
<RequestForm/>
<section><h2>Stories for Maya</h2><StoryList .../></section>
<section><h2>Stories for Liam</h2><StoryList .../></section>
```

Each `<StoryList>` owns its own story state and its own "Download all"
bundle buttons. There is no cross-kid bundle.

**v2 layout:**

```
<RequestForm/>
<StoryList stories={flat} onPreviewPdf={...} onDismiss={...}>
  bundle-actions  (single, downloads ALL done stories)
  ...cards in order, each card carries its own request context...
</StoryList>
<!-- One <SessionStreamer> per session, render-less, runs the SSE effect -->
{sessions.map(s => <SessionStreamer key={s.id} session={s} onUpsert={...} onDelete={...}/>)}
```

**State move.** Story state moves OUT of `StoryList` and UP into `App`:

```ts
type SessionContext = { request: GenerateRequest };

interface CardEntry {
  state: StoryCardState;
  request: GenerateRequest;   // frozen per session (per kid)
  sessionId: string;
}

const [sessions, setSessions]   = useState<Session[]>([]);
const [stories,  setStories]    = useState<Record<string, CardEntry>>({});
const [order,    setOrder]      = useState<string[]>([]); // newest first
```

**Append behavior.** When a `started` event arrives, the card is
**prepended** to `order` (newest-at-top across all kids). This matches
the v1 "newest session at the top" pattern but now applies across kid
boundaries: a fresh batch for Liam appears above Maya's earlier batch.

**SessionStreamer (new, render-less).**

```tsx
// frontend/src/components/SessionStreamer.tsx
import { useEffect } from "react";
import type { GenerateRequest, SseEvent } from "../types";
import type { StoryCardState } from "./StoryCard";

interface Props {
  session: { id: string; request: GenerateRequest; events: AsyncGenerator<SseEvent> };
  onUpsert: (sessionId: string, request: GenerateRequest, state: StoryCardState) => void;
  onPatch:  (story_id: string, patch: Partial<StoryCardState>) => void;
}

export default function SessionStreamer({ session, onUpsert, onPatch }: Props) {
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
          onPatch(ev.story_id, { status: "error", error: ev.message });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [session]);
  return null;
}
```

**App callbacks.**

```ts
function upsertStory(sessionId: string, request: GenerateRequest, state: StoryCardState) {
  setStories(s => ({ ...s, [state.story_id]: { state, request, sessionId } }));
  setOrder(o => o.includes(state.story_id) ? o : [state.story_id, ...o]);
}

function patchStory(story_id: string, patch: Partial<StoryCardState>) {
  setStories(s => {
    const cur = s[story_id];
    if (!cur) return s;     // dismissed - drop the event silently
    return { ...s, [story_id]: { ...cur, state: { ...cur.state, ...patch } } };
  });
}

function dismissStory(story_id: string) {
  setOrder(o => o.filter(x => x !== story_id));
  setStories(s => {
    if (!(story_id in s)) return s;
    const { [story_id]: _drop, ...rest } = s;
    return rest;
  });
}
```

**StoryList prop shape (new).**

```ts
interface Props {
  entries: CardEntry[];                     // already in render order
  onPreviewPdf: (state: StoryCardState, request: GenerateRequest) => void;
  onDismiss:    (story_id: string) => void;
}
```

`StoryList` is now pure - no `useEffect`, no event loop, no `events`
prop. It renders bundle-actions across all `entries` plus a `StoryCard`
per entry.

**Bundle download semantics.**

```ts
async function downloadBundle(format: "docx" | "pdf", entries: CardEntry[]) {
  const stories = entries
    .filter(e => e.state.status === "done" && e.state.text)
    .map(e => ({
      child_name: e.request.child_name,
      topic: e.state.topic,
      genre: e.request.genre,
      text: e.state.text!,
      reading_level: e.request.reading_level,
      pages: e.request.pages,
      include_drawing_box: e.request.include_drawing_box,
    }));
  const response = await fetch("/api/export/bundle", { ... });
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `learning_stories.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
```

Filename: `learning_stories.zip` (no kid name; the zip contents are
already kid-scoped via `safe_filename(child, topic)` server-side).

**Backend.** `app/main.py`'s `/api/export/bundle` already takes a list
of `StoryInput`s with each story carrying its own `child_name`. The
endpoint is multi-kid-capable today; only the frontend was bundling
per-kid. No backend change for this item.

**PDF preview modal.** The modal already takes a `request` snapshot.
`onPreviewPdf` now passes the per-card request (from `CardEntry`)
rather than reading from a session.

**Empty state.** When `entries.length === 0`, `StoryList` renders the
existing "Stories will appear here as they are generated." placeholder.

### 6. Quote-aware sentence regex (`backend/app/export.py`)

**Symptom.** Story like
`"Hi," she said. "I'm Maya. We just moved here." Avi asked.` renders in
the PDF as `"Hi," she said. "I'm Maya. " Avi asked.` - the third
sentence and its closing quote are gone.

**Cause.** `_SENTENCE_RE = re.compile(r"[^.!?]+[.!?]+(?:\s|$)")` requires
the sentence terminator to be immediately followed by whitespace or
end-of-string. When the sentence ends with `."` (close-quote AFTER the
period), the `(?:\s|$)` lookahead fails and `re.findall` skips that
sentence entirely.

**Fix.** Allow optional close-punctuation between the terminator and
the boundary:

```python
_SENTENCE_RE = re.compile(
    r"[^.!?]+[.!?]+[\"”’')\]]*(?:\s|$)"
)
```

The class `["”’')\]]*` accepts ASCII `"`, smart right-double
`"`, smart right-single `'`, ASCII `'`, `)`, `]` - all common
close-punctuation that legitimately follows a sentence terminator. The
final `(?:\s|$)` is unchanged.

Also: DOCX rendering is unaffected (it splits on `\n\n` paragraphs and
writes each paragraph whole - no per-sentence tokenization).

**Edge cases.**

- An abbreviation like `Dr.` mid-sentence still tokenizes as a
  "sentence" boundary - unchanged from v1 (we accept this; the
  generator prompt avoids common-abbreviation false positives in
  practice).
- Sentences ending with `?'` or `!"` -> match cleanly via the new
  optional close class.
- Bare quoted dialog like `'No way.'` -> matches (the apostrophes are
  in the close-class).

### 7. PDF fills the page (`backend/app/export.py`)

**Approach.** Stretch leading + paragraph gap to fill the available
height, capped at 2.0x to prevent absurd line spacing. A two-pass
algorithm:

1. **Layout pass:** Compute the wrapped lines per paragraph for this
   page chunk, given base font + max_width. Returns
   `list[list[str]]` (lines grouped by paragraph).
2. **Scale pass:** Available height = `text_top - bottom_margin`.
   Required height at base spacing = `total_lines * leading + (p-1) *
   leading * 0.7`. Scale `s = min(2.0, available / required)`. New
   leading = `leading * s`. New paragraph gap = `leading * 0.7 * s`.
3. **Draw pass:** Emit lines at the scaled spacing.

If the chunk is empty, draw nothing (existing behavior).

**Refactor.** Replace `_draw_wrapped` and `_draw_paragraphs` with:

```python
def _layout_paragraph(text: str, max_width: float, font_size: float, indent: float = 0.0) -> list[str]:
    """Wrap a single paragraph into lines.
    The first line gets `indent` extra at the start (treated as
    reduced max_width for that line only); returned strings are the
    line text WITHOUT the indent itself - the indent is applied at
    draw time.
    """

def _layout_chunk(text: str, max_width: float, font_size: float, indent: float) -> list[list[str]]:
    """Return one list-of-lines per paragraph in the chunk."""

def _draw_chunk(c, lines_per_para: list[list[str]], x: float, y_top: float,
                leading: float, para_gap: float, indent: float) -> None:
    """Draw the laid-out chunk; the first line of each paragraph is
    offset by `indent`.
    """
```

`render_pdf` orchestrates: layout -> scale -> draw, per page.

**Indent default.** `_INDENT = 18.0` (points) - roughly one-quarter of
an inch, what a typical book uses for paragraph indentation. A
module-level constant in `export.py`.

**Cap.** `_FILL_MAX_SCALE = 2.0`. If a one-sentence chunk would
otherwise need 8x leading to fill, we stop at 2.0 and leave a gap. The
gap is acceptable - extreme stretching reads worse than a partial
page.

**Drawing box pages.** When `include_drawing_box=True`, the available
text region is below the box (existing logic), and the fill
calculation uses that smaller region.

### 8. Drop the PDF title (`backend/app/export.py`)

**Change.** In `render_pdf`, remove:

```python
c.setFont("Helvetica-Bold", font_size)
c.drawString(_MARGIN, height - _MARGIN, title)
text_top = height - _MARGIN - (font_size * 2)
```

Replace with:

```python
text_top = height - _MARGIN
```

The page now begins with body text (or the drawing box, if requested)
at the top margin. The `title` local is no longer needed.

**DOCX is unaffected.** `render_docx` keeps `doc.add_heading(...)` -
the title is still useful in the Word file (where teachers may want to
edit it). The user's request was specifically about the printed PDF.

**Test impact.** Two tests in `test_export.py` reference the title in
PDF output:

- `test_title_uses_colon_not_em_dash` - asserts the PDF drawString
  contains `For Maya: "Soccer"`. We delete the PDF half of this test
  (PDF no longer emits the title) and keep the DOCX assertion.
- The "first body line" filtering in `test_pdf_preserves_paragraph_breaks`
  and `test_pdf_drawing_box_leaves_leading_times_1_5_gap` currently
  drops the title with `if "For Maya" not in t`. The filter still
  works (no title -> nothing to drop) but the absence-of-title
  assumption needs to be explicit in fresh assertions; we add a check
  that no drawString starts with `For ` on the body pages.

### 9. Paragraph indent (`backend/app/export.py`)

Built on top of item 7. The layout helper accepts an `indent` argument;
when drawing the first line of each paragraph, the x-coordinate is
`x + indent`. Wrapping for the first line uses `max_width - indent`
to leave room.

`_draw_chunk` walks `lines_per_para`:
- For paragraph `p` index `i`: draw `lines_per_para[i][0]` at `x +
  indent`, draw lines `1..` at `x`. Advance `cursor_y -= leading`
  after each line. After the paragraph, advance `cursor_y -=
  paragraph_gap`.

`_layout_paragraph` enforces the first-line width constraint: when
building the first line's word stream, the effective max_width is
`max_width - indent`; subsequent lines use the full `max_width`.

## Data flow (summary)

```
┌──────────────────────────────────────────────────────────────────┐
│ App.tsx                                                          │
│  sessions: Session[]            stories: Record<id, CardEntry>   │
│  order: string[] (newest first)                                  │
│                                                                  │
│  RequestForm ──onSubmit──▶ append Session{request, events}       │
│                                                                  │
│  sessions.map ─▶  <SessionStreamer session={s}                   │
│                     onUpsert={upsertStory}                       │
│                     onPatch={patchStory} />                      │
│                     (no DOM; runs SSE effect)                    │
│                                                                  │
│  <StoryList entries={order.map(id => stories[id])}               │
│             onPreviewPdf={(s, r) => setPreviewStory({...})}      │
│             onDismiss={dismissStory} />                          │
│             │                                                    │
│             ├─ bundle-actions  (single, all entries)             │
│             │                                                    │
│             └─ StoryCard per entry                               │
│                  state.expanded -> body full or 5-line preview   │
│                  onDismiss(story_id)                             │
│                                                                  │
│  PdfPreviewModal(open, story, request, onClose)                  │
│    request comes from CardEntry's frozen request                 │
└──────────────────────────────────────────────────────────────────┘
```

## Error handling

No new error surfaces. Existing patterns hold:

- Form validation: pages-empty / pages<1 surfaces under the input
  (existing pattern).
- SSE error events route via SessionStreamer -> `patchStory` ->
  StoryCard's error branch (unchanged behavior).
- PDF fill-cap: if the available height is *less* than the unscaled
  required (rare - one full page with too many lines for the
  level/font), the scale factor is `min(2.0, <1)` = `<1`, which would
  shrink. We clamp at `max(1.0, ...)` so we never *shrink* below the
  baseline leading; in that case we accept overflow off the bottom
  edge (very unlikely given `split_into_pages` already balances).
- Sentence regex: empty text yields no matches; downstream
  `split_into_pages` returns `[""] * n` (unchanged).

## Testing

**Backend (`backend/tests/test_export.py`)**

- New: `test_sentence_regex_preserves_closing_quote` - feed text
  `'"Hi," she said. "I am Maya." Avi asked.'` (substitute straight
  quotes; ensure all three sentences land in the tokenized output).
  Assert the joined output equals the input (modulo whitespace
  normalization around `\n\n`).
- New: `test_pdf_fills_page_by_scaling_leading` - render a tiny
  one-page story (~3 sentences), spy on `drawString`, compute the
  y-deltas between consecutive lines, assert the delta is strictly
  greater than `FONT_SIZES["3"] * LINE_SPACING["3"]` (i.e., we
  *expanded* the leading to fill). Also assert the first line's y is
  near `height - _MARGIN` (since the title is gone), and the last
  line's y is near `_MARGIN` (filled the page).
- New: `test_pdf_paragraph_indent` - render a one-page story with two
  paragraphs; assert the first drawString of each paragraph has
  `x == _MARGIN + _INDENT`, and that subsequent drawStrings within
  the same paragraph have `x == _MARGIN`.
- New: `test_pdf_has_no_title` - render a 1-page story and assert no
  drawString starts with `For ` and no drawString contains the
  child_name. (DOCX still has it.)
- Modify: `test_title_uses_colon_not_em_dash` - keep the DOCX
  assertion; remove the PDF half.
- Modify: `test_pdf_drawing_box_leaves_leading_times_1_5_gap` - the
  expected y for the first body line changes because there is no
  title anymore. New expected: `(height - _MARGIN) - (height - 2 *
  _MARGIN) * _BOX_FRACTION - leading * 1.5`. The drawing-box
  geometry shifts up by `font_size * 2`.

**Frontend**

- `RequestForm.test.tsx`:
  - New: `"pages input allows empty intermediate state"` - render,
    clear the input (`userEvent.clear`), type `5`, assert the
    displayed value is exactly `"5"` (not `"05"`), submit, assert
    `onSubmit` receives `pages: 5`.
  - New: `"pages input rejects submission when empty"` - clear it,
    leave empty, click Generate, assert validation error message and
    no `onSubmit` call.

- `StoryCard.test.tsx`:
  - Modify: `"toggles the story body with the Hide/Show button"` -
    rename / rewrite. After click on the collapse chevron, the story
    body is still in the document but has the `story-text--collapsed`
    class. Click the expand chevron, class is removed. Use
    `toHaveClass` and `not.toHaveClass`.
  - The chevron buttons have `aria-label="Collapse story"` /
    `"Expand story"`. Tests look up by that aria-label.

- `StoryList.test.tsx`:
  - Rewrite to match the new prop shape: takes `entries`, not
    `events`/`request`. Tests render `<StoryList entries={[...]}
    onPreviewPdf={...} onDismiss={...} />` directly with synthesized
    entries. Bundle download is exercised here.
  - Cross-kid bundle filename is `learning_stories.zip`.
  - One entry per child; assert the bundle POST body contains both
    `child_name` values.

- `App.test.tsx` (new file - replaces the v1 placeholder):
  - "renders one card per submission across kids, newest first":
    mock `streamSse` (per session) and `fetch` for `/api/presets`.
    Submit for Maya + Soccer, submit for Liam + Dinosaurs, assert
    both cards exist, Liam's appears above Maya's in document order
    (newest-first), and there is exactly one "Download all as PDF"
    button on the page.
  - "removing a card calls dismiss; that card is gone": dismiss
    Maya's card, assert Maya's heading no longer in document, Liam's
    is still there.

- `App.css` / `index.css`: no behavioral test; the color-scheme bug is
  verified manually in the browser (light mode, OS dark mode - the
  checkbox should render light).

## Sequencing

Seven commits in order. Each is independently testable; the suite is
green at every point.

1. `fix(frontend): bind color-scheme to active theme so native widgets stay light in light mode`
   - `frontend/src/index.css`.

2. `style(frontend): adapt eggshell + indigo + burnt-peach palette`
   - `frontend/src/index.css`, `frontend/src/App.css`.

3. `fix(frontend): pages input allows empty intermediate state`
   - `frontend/src/components/RequestForm.tsx`,
     `frontend/src/components/RequestForm.test.tsx`.

4. `feat(frontend): chevron toggle with 5-line collapsed preview`
   - `frontend/src/components/StoryCard.tsx`,
     `frontend/src/components/StoryCard.test.tsx`,
     `frontend/src/App.css`.

5. `feat(frontend): consolidate stories into one cross-kid list with shared bundle`
   - `frontend/src/App.tsx`,
     `frontend/src/App.test.tsx`,
     `frontend/src/components/StoryList.tsx`,
     `frontend/src/components/StoryList.test.tsx`,
     new `frontend/src/components/SessionStreamer.tsx`,
     new `frontend/src/components/SessionStreamer.test.tsx` (optional - covered by App.test).

6. `fix(backend): sentence regex preserves closing quotation marks`
   - `backend/app/export.py`,
     `backend/tests/test_export.py`.

7. `feat(backend): drop PDF title, indent paragraphs, expand leading to fill page`
   - `backend/app/export.py`,
     `backend/tests/test_export.py`.

## Pre-flight (taste-skill)

Re-running the relevant items against this design:

- Em-dash sweep: zero in source code or tests. The phrase "Burnt
  Peach -> CTA fill" in this doc is prose; design docs are not user-
  visible artifacts.
- Page theme lock: still one theme at a time; user toggles between
  light and dark explicitly. The color-scheme fix reinforces this -
  the toggle now also re-skins native widgets.
- Color consistency lock: peach is THE accent everywhere (Generate
  button, modal Download, focus rings via accent-bg, inputs).
  Indigo is link/focus ink. Teal is held in reserve (declared but
  unused in v2 markup) - that is acceptable as long as we do not
  introduce a competing CTA color.
- Shape consistency: radii unchanged.
- Contrast: traced above. All interactive surfaces pass WCAG AA in
  both modes.
- Motion: existing low-intensity transitions preserved. The chevron
  rotation (if we choose to rotate ▾ <-> ▸ via CSS transform instead
  of swapping glyphs) would need to respect `prefers-reduced-motion`;
  we use glyph swap rather than rotation to avoid that complexity.
- Accessibility: every chevron / X button has an aria-label. The
  collapsed preview is still readable (semantic text in the DOM,
  just visually clamped) - screen readers get the full content.
