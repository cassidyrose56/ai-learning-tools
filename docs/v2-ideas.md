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
- **Scaffolding playbook.** Mapping from "Gemini said this band is
  too hard" to specific transformations (define vocabulary inline,
  shorten sentences, add picture support). Currently the evaluator
  returns free-form `revision_guidance` (for the Claude feedback loop)
  and a separate free-form `scaffolding_needed` (teacher-facing
  supports, parsed but not yet surfaced anywhere in v1). Converting
  either into a small enum of supported transformations lets the
  generator apply them more reliably on retry, and lets the UI render
  scaffolds as actionable teacher chips instead of prose.
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
- **Cross-reference with `vendor/evaluators` thresholds.** The
  upstream sentence-structure rubric publishes numeric guidelines
  per grade (e.g., grade-3 avg sentence length < 12 words). When
  we add more evaluators in v2, the pedagogy table should align
  with those thresholds so generation and evaluation aren't fighting
  each other.

## Decouple reading level from student grade

v1's `GenerateRequest` has one knob — `reading_level` (K–5) — and the
form deliberately labels it "Reading level, not enrolled grade." That
phrasing exists because the spec is explicit: a grade-4 student reading
at grade-2 should get a grade-2 story, not a grade-4 story. But knowing
*only* the reading level loses information that would make scaffolding
sharper.

Add a separate field for the student's actual grade (or age) so the
generator and the v2 scaffolding playbook can see the gap:

```ts
interface GenerateRequest {
  child_name: string;
  reading_level: ReadingLevel;   // story target
  child_grade?: ReadingLevel;    // student's actual enrolled grade (new)
  // child_age?: number;         // optional alternative for non-K-12 contexts
  ...
}
```

Why it matters:

- **Topic appropriateness.** A grade-4 student reading at grade-2 is a
  9-year-old who would be bored by topics aimed at 6-year-olds (basic
  colors, "the dog ran"). The generator can choose age-appropriate
  subject matter while still using grade-2-appropriate vocabulary and
  sentence structure.
- **Sharper scaffolding.** A big gap between reading level and grade
  signals "deliberately simplified for a struggling reader." The
  generator could bias toward bridging vocabulary (introducing one or
  two grade-4 academic words with definitions inline) instead of
  writing entirely below the student's chronological level.
- **More actionable evaluator failures.** When the evaluator returns
  `appropriate=false`, the warning becomes diagnostic: "judged at K-1,
  you targeted grade-2, student is in grade-4 — Claude may be
  underestimating the student" tells the teacher *why* the retry
  budget ran out and which lever to pull.

Composes with:
- the planned scaffolding playbook in `pedagogy.py` (gap-aware
  transformations)
- the v2 multi-evaluator setup (the vocabulary evaluator could rate
  against both `reading_level` and `child_grade` simultaneously to
  flag mismatch directions)

Implementation tradeoffs:
- `child_grade` should be **optional** — many teachers will just match
  it to `reading_level` and ignore the extra field. Form should default
  to "matches reading level," with an expand affordance for "student
  reads above/below grade level."
- Bumps prompt complexity for Claude (one more variable threaded
  through `fiction.j2` / `non_fiction.j2`).
- Wire-format change is additive only — existing clients keep working.

## Ground generation in ELA standards via Learning Commons KG MCP

Today `generator.py` builds a prompt with `topic`, `reading_level`,
`target_words`, and `child_name`, then asks Claude to write the story
from its training. Claude does its best, but "grade 3 reading level"
is a fuzzy aggregate. Common Core (and state-specific) ELA standards
are concrete: grade 2 needs *"describe how words and phrases supply
rhythm and meaning in a story, poem, or song"*; grade 3 needs
*"determine the main idea of a text; recount key details and explain
how they support the main idea"*; etc.

The Learning Commons publishes a knowledge graph of ELA standards.
If/when they expose it as an MCP server, we can attach it to our
Anthropic Messages call so Claude can query the KG *during* drafting:

```python
# sketch — actual MCP API will be whatever the server publishes
message = await client.messages.create(
    model=settings.claude_model,
    max_tokens=2048,
    messages=[{"role": "user", "content": prompt}],
    mcp_servers=[
        {
            "type": "url",
            "url": "https://mcp.learningcommons.org/standards",
            "name": "learning-commons-standards",
        }
    ],
)
```

Why it matters:

- **Stronger pedagogy guarantees.** A grade-3 story can be written
  toward `CC.RL.3.1` (main-idea identification) explicitly, not just
  "approximately grade-3 vocabulary." Teachers can cite the standard
  the story practices.
- **Fewer evaluator retries.** If Claude wrote toward the right
  standards from the start, Gemini is more likely to return
  `appropriate=True` on attempt 1. The 3-attempt retry budget exists
  because the generator and judge can disagree; aligning the generator
  to the same source the judge is implicitly checking against narrows
  that gap.
- **State-specific variants.** If the KG carries state-specific
  variations (e.g., Texas TEKS instead of Common Core), we can
  parameterize per-classroom.

Implementation tradeoffs:

- **MCP availability.** Depends on Learning Commons actually shipping
  the KG behind an MCP endpoint. As of this writing the
  `learning-commons-org/evaluators` repo is the public artifact; the
  KG-via-MCP exposure is forward-looking. We'd want to confirm before
  committing engineering time.
- **Latency.** Each MCP tool call inside generation adds a round-trip.
  A short K-1 story with one standard lookup is fine; a longer
  passage that fetches multiple standards could noticeably slow per-
  story generation.
- **Caching.** Standards-per-grade are stable for the duration of a
  school year. A lightweight per-grade cache in front of the MCP
  client would let multiple stories in a batch share the lookup.
- **Failure mode.** If the MCP server is unreachable, fall back to
  the v1 behavior (prompt without standards context) rather than
  failing the whole generation. The story still ships; the warning
  badge already covers "couldn't perfectly validate."
- **Prompt-template change.** The Jinja templates would gain an
  optional `{{ standards }}` block. Empty when the MCP attachment
  isn't in use; populated by Claude itself once the tool is wired.
