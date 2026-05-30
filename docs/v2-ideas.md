# V2 Ideas

Running list of post-v1 ideas. Not commitments — captured here so we don't
re-derive them later.

## Multi-dimensional evaluation

V1 only runs the **grade-level appropriateness** evaluator from the
Learning Commons submodule. The submodule ships five additional
evaluators we could layer in. Each evaluator runs as its own LLM call
against its own rubric and returns a 4-point complexity score
(`Slightly | Moderately | Very | Exceedingly`) for one dimension of the
text.

| Evaluator | What it scores | Why we'd add it |
|---|---|---|
| Vocabulary | Word-level difficulty for the target grade — archaic, subject-specific, academic, unfamiliar words and how often they appear. Has a background-knowledge sub-prompt. | A story can hit the right grade band on average but ambush a kid with 3 hard words on the first page. |
| Sentence structure | Sentence length, % simple/compound/basic-complex/advanced-complex, subordination patterns. Computational stats + qualitative judgment together. Separate rubrics for grade 3, grade 4, and grades 5–12. | A grade-3 reader handles "The dog ran fast" but stumbles on a 30-word compound-complex sentence even if every word is easy. |
| Conventionality | How literal vs figurative / abstract / ironic the language is. Surface vs hidden meaning. | A K–2 student can decode every word in "she had a heart of gold" but won't know what it means — especially relevant for fiction. |
| Subject-matter knowledge | Background knowledge required to comprehend — common/standard vs specialized/theoretical. | A grade-5 reader can read every word of a photosynthesis-chemistry passage but be lost because the K–4 curriculum didn't prepare them. |
| Purpose | How easily the reader can identify *why* the author wrote the text — explicit vs implied vs subtle/abstract. | More relevant for fiction; distinguishes "I had fun at the park" from "the meadow was indifferent to her arrival." |

### Why not in v1

- Grade-level already rolls up most of these dimensions in its rubric.
- Cost & latency: a 12-topic × 3-attempt batch with all six evaluators = 216 Gemini calls (each up to 120s in the upstream notebook).
- The UI needs real design work to render and act on a 5-axis score —
  v1's "appropriate / not appropriate / unavailable" badge doesn't translate.

### Implementation paths (cheapest → most ambitious)

1. **Sharper retries only.** Keep grade-level as the gate. On a *failed*
   attempt, also call vocabulary + sentence-structure and roll their
   findings into the revision instructions sent back to Claude. Teacher
   still sees one verdict; Claude gets richer feedback.
2. **Complexity profile on the card.** Show all 5 axes as a small
   sparkline or color grid on each story card. Teacher decides whether
   "vocab too hard" is acceptable for this student.
3. **Per-teacher selection.** Let the teacher pick which evaluators
   gate the result vs which are advisory. Useful for ELL students or
   students with specific support plans.

This is the dimension we'd most likely use the **OpenAI** key for —
some of the upstream evaluators were calibrated on OpenAI models. The
spec keeps `OPENAI_API_KEY` in `.env.example` so this work doesn't
need re-onboarding.

## Generated images on the page

Right now the PDF either reserves a blank box for the student to draw,
or fills the whole page with text. A v2 option: **render an AI-generated
illustration on each page** keyed to the chunk of text on that page.

Sketch:

- Per-page generation: after `split_into_pages` produces N chunks, call
  an image model once per chunk with a prompt like *"a children's-book
  illustration of <one-line summary of chunk text>, simple shapes,
  bright colors, no text"*. Cache the image in-memory for the export.
- Layout: the image takes the top ~45% of the page (the same slot the
  drawing box uses today), so we don't need a third layout mode — it's
  a swap for the box.
- Form control: replace the boolean "drawing box" toggle with a tri-state
  *No image / Blank box for student to draw / AI-generated illustration*.
- Word counts: keep the box-on `WORDS_PER_PAGE` row (the page area for
  text is the same whether the top half is a box or an image).
- New cost dimension: image generation per page per story. We'll need a
  soft cap and a "preview before generating images" gate.
- Provider TBD — could be OpenAI's image API, Gemini's image output, or
  a dedicated model. Decision deferred to v2.

Risks worth flagging up-front:

- **Content safety.** K–5 audience means we need a much tighter prompt
  filter and a way to review/regenerate offensive or off-prompt images
  before sending to a child.
- **Style consistency across pages.** Different image generations for
  the same story can yield wildly different art styles. Probably need
  to inject a style reference or use a single seeded session per story.
- **Latency.** Image generation will dwarf the current per-story time.
  The SSE pipeline needs a new `image_ready` event so the UI can show
  text first and fill in images as they arrive.

## Pedagogy table extensions

v1 collects editorial constants (per-grade words-per-page,
per-grade PDF font sizes, single-grade → Learning Commons grade band)
into `backend/app/pedagogy.py` so they live in one reviewable place
instead of being scattered through `config.py`, `evaluator.py`, and
`export.py`. Once that table exists, several adjacent ideas open up:

### Richer per-grade rules the table could hold

- **Sentence-length targets.** Max words per sentence per grade
  (informed by `vendor/evaluators` sentence-structure rubric thresholds).
  The generator's Jinja template would inject the target, and we'd
  have a cheap structural post-check before paying for an LLM-as-judge
  retry.
- **Vocabulary allow/avoid lists.** Per-grade word lists (e.g.,
  Dolch sight words for K–3; common subject-academic words for grades
  4–5). Used two ways: seed the generator prompt with "prefer these,
  avoid those," and run a deterministic post-check that flags any
  avoid-list word that slipped through.
- **Scaffolding playbook.** Mapping from "Gemini said this band is
  too hard" to specific transformations (define vocabulary inline,
  shorten sentences, add picture support). Currently the evaluator
  returns free-form `scaffolding_needed`; converting it into a small
  enum of supported transformations lets the generator apply them
  more reliably on retry.
- **Read-aloud-vs-independent thresholds.** Each grade has a different
  word-count range that's appropriate for read-aloud time vs.
  independent reading. A teacher could flag intent and the WPP table
  could shift accordingly.

### Workflow ideas the table unlocks

- **Pedagogy bumps as their own commits.** Because pedagogy is one
  file, a teacher / curriculum specialist can review diffs against
  this file without reading any Python that consumes it. Cleaner
  review surface than "find every magic number in the codebase."
- **Per-classroom profiles.** Multiple pedagogy *profiles* selectable
  via env or per-request — e.g., a tighter vocabulary band for ELL
  students, a higher word-count target for accelerated readers.
  Implementation: rename the file's top-level constants to attributes
  of a `Profile` and load the active profile by name.
- **Admin UI over pedagogy values.** Once the table is structured,
  an authenticated admin route could expose it as a form — change
  the words-per-page for grade 3, see the next generation reflect
  it, no code change. Risky because pedagogy decisions are
  load-bearing for output quality; this would need versioning and
  an "active profile" history.
- **Cross-reference with `vendor/evaluators` thresholds.** The
  upstream sentence-structure rubric publishes numeric guidelines
  per grade (e.g., grade-3 avg sentence length < 12 words). When
  we add more evaluators in v2, the pedagogy table should align
  with those thresholds so generation and evaluation aren't fighting
  each other.
