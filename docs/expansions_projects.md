# Expansion Projects

Adjacent project ideas — not extensions of the current story generator,
but separate tools that could live alongside it. Captured loosely so
they don't get lost.

## Parent education modules: how kids learn to read

Short, parent-facing explainers about the mechanics of early reading.
Audience is a parent who wants to help their kid but doesn't have the
vocabulary that teachers and reading specialists use.

Possible topics:

- **Phonemic awareness vs phonics vs sight words** — what each is, why
  they're sequenced, what "sounding it out" actually trains.
- **What a reading level means.** Connects to the same fuzziness the
  story generator wrestles with — a grade-2 level isn't one thing,
  it's vocabulary + sentence structure + background knowledge + purpose.
- **Decoding vs comprehension.** A kid who reads aloud fluently but
  can't answer questions about the page has a comprehension gap, not
  a fluency gap — and the home response is different.
- **When to worry / when to wait.** Normal variation vs early signs of
  dyslexia or other reading difficulties, and what to ask the school.
- **Reading aloud past the age they "need" it.** Why it still helps
  with vocabulary and listening comprehension after independent
  reading kicks in.

Possible shape:

- 5–10 minute reads with one core idea each, not a course.
- Could reuse the Learning Commons evaluator dimensions as the
  scaffolding (vocabulary, sentence structure, conventionality,
  subject-matter knowledge, purpose) — explain each one to parents in
  plain language, then show how it shows up at home.
- Pairs naturally with the main app: each generated story could link
  to the relevant module ("this story is targeting comprehension —
  here's how to ask about it at the table").

Open questions:

- Are these articles, short videos, or interactive walkthroughs?
- Sourcing — written from scratch, or curated/summarized from existing
  research with citations?
- Distribution — bundled with the story generator, or its own site?

## Math worksheets generator

A counterpart to the story generator, same skeleton, different
content. Parent or teacher picks a grade and a skill (single-digit
addition, fractions, multi-step word problems) and gets a printable
worksheet.

Things to figure out:

- **Where the difficulty model lives.** Reading has Learning Commons;
  math has Common Core math standards and a much larger ecosystem of
  curricula. Pick a standards source before designing the form.
- **Word problems vs computation drills.** Word problems overlap with
  the reading app's machinery — they're short passages with a
  comprehension component, so reading level matters as much as math
  level. Pure computation sheets don't need any of that.
- **Answer keys.** Worksheets need a paired key. Either the model
  produces both in one pass (cheaper, risk of self-grading errors) or
  the key is computed deterministically from the problems (safer,
  needs a per-skill evaluator).
- **Visual layout.** Math worksheets are denser than story pages —
  grids, number lines, fraction bars, place-value columns. The PDF
  export work for stories doesn't transfer directly.

Probably shares: the SSE generation pipeline, the per-grade pedagogy
table pattern, the "preview before generating" UX. Probably doesn't
share: the Gemini evaluator (different rubrics), the Jinja story
templates, the drawing-box layout.
