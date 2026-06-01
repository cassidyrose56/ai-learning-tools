# About page design

**Date:** 2026-06-01
**Status:** Draft, pending implementation plan

## Overview

Add an About page to the AI Learning Tools site so visitors can learn who made the tool, why it exists, and how the stories are generated and checked. The page lives behind a new `/about` route, reached via a small nav strip added to the existing header. The generator (the current home page) stays at `/`.

This is the first multi-route screen in the app, so it also introduces `react-router-dom` to the frontend.

## Goals

- Visitors can read a short bio, a parent-friendly explanation of how the tool works, and the reason it was built.
- The About page is reachable from the existing UI with one click and has its own URL so it can be linked to directly.
- Switching between Generator and About does not reset any in-flight or completed generations.

## Non-goals

- A multi-page marketing site. This is a single static About page.
- Server-side rendering or static export. The app stays a Vite SPA.
- Production hosting config (SPA fallback rules, etc.). That is out of scope and will be handled if and when the project gets deployed.
- Persistence of any state in the About page itself (no forms, no analytics).

## Architecture

Routing is added at the very top of the React tree, in `main.tsx`. `App.tsx` keeps the application state it has today (sessions, stories, theme), and the new `<Routes>` block lives inside its existing `<main className="page">` so the header and page chrome render on every route.

```
main.tsx
  <BrowserRouter>
    <App />
  </BrowserRouter>

App.tsx
  <main className="page">
    <header>                         (always rendered)
      <title + tagline>
      <nav: Generator | About>
      <theme toggle>
    </header>

    <Routes>
      <Route path="/"      element={<GeneratorView .../>} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="*"      element={<Navigate to="/" replace />} />
    </Routes>
  </main>
```

`GeneratorView` is a new component that holds what is today the body of `App.tsx`: the request form, the session streamers, the story list, and the PDF preview modal. The state it depends on (sessions, stories, order, previewStory) stays lifted in `App.tsx` and is passed down as props. This keeps generations alive while the user visits `/about` and comes back.

## Components

### `AboutPage.tsx`

A pure-presentation component. No props, no state. Renders four sections inside the same `.page` width the rest of the app uses, so typography and spacing match. Each section is an `<h2>` (sentence case) followed by prose.

External links use `target="_blank"` and `rel="noopener noreferrer"`. The email is a `mailto:` link.

The copy below is the final copy for the page. It has been written to pass the project's humanizer guidance (no em or en dashes, sentence-case headings, varied sentence length, plain language, no promotional filler, no rule-of-three formulas).

---

#### Hi, I'm Cassidy.

I'm a software engineer with a background in child development and education. I built this tool because I wanted to put what I know about both into something a kid could actually use, not just talk about.

#### Why I made this

Reading practice works best when the text matches two things at once: a child's reading level *and* something they actually want to read about. Books on the shelf rarely line up on both. A book at the right level might be about a topic the kid finds boring; a book about their favorite thing might be three grade levels too hard.

That gap is what this tool tries to close. You pick the reading level, you pick the topic, and you get a short story made for that combination.

It is also a real, working thing in the education space, which matters more to me than another mockup or pitch deck. I wanted something a parent or teacher could open today and use today.

#### How the stories are generated and vetted

A writing AI drafts a short story based on the topic, reading level, and length you choose. Then a separate evaluator looks at the story and judges whether it actually sits at the requested reading level.

If the evaluator confirms the level, the story shows up normally. If it cannot confirm, the story still shows up, but with a small amber note that says the reading level was not confirmed. You stay in control of whether to use it.

The rubric the evaluator uses comes from [Learning Commons](https://learningcommons.org/for-developers/), an open project that publishes evaluators for education content. The grade-level rubric on that page (scroll down a bit; it sits with their developer resources) is the same one this tool checks against.

#### Get in touch

If you have feedback, ideas, or want to tell me a story landed well (or badly) for your kid, I would like to hear it.

- Email: [cassidyrose56@gmail.com](mailto:cassidyrose56@gmail.com)
- Source code: [github.com/cassidyrose56/ai-learning-tools](https://github.com/cassidyrose56/ai-learning-tools)

---

### `GeneratorView.tsx`

Extracted from the current body of `App.tsx`. Receives the existing handlers and state as props:

```ts
type GeneratorViewProps = {
  sessions: SessionLike[];
  entries: CardEntry[];
  previewStory: { story: StoryCardState; request: GenerateRequest } | null;
  onSubmit: (req: GenerateRequest) => void;
  onUpsert: (sessionId: string, request: GenerateRequest, state: StoryCardState) => void;
  onPatch: (story_id: string, patch: Partial<StoryCardState>) => void;
  onDismiss: (story_id: string) => void;
  onPreviewPdf: (story: StoryCardState, request: GenerateRequest) => void;
  onClosePreview: () => void;
};
```

No new logic. This is a mechanical move so `App.tsx` stays focused on app-level state and routing.

### Header nav

The existing `<header className="app-header">` gains a `<nav>` between the title block and the theme toggle. Two `<NavLink>` items: "Generator" → `/` and "About" → `/about`. The active link gets bolder text and a 2px underline. CSS lives in `App.css` alongside the existing header rules.

On narrow viewports (≤640px), the existing media query already collapses header padding; the nav row wraps under the title block at that breakpoint, with the theme toggle keeping its position via flex order.

## Data flow

No new data flow. The router does not touch sessions or stories. The only state change driven by the router is the URL itself.

## Testing

- `AboutPage.test.tsx`: renders, contains all four section headings, has the `mailto:` link with the correct address, has the GitHub link with the correct URL, has the Learning Commons link with the correct URL, and external links have `rel="noopener noreferrer"` and `target="_blank"`.
- `App.test.tsx`: keep the existing render test, and wrap the rendered app in `MemoryRouter` with `initialEntries=["/"]`. Add a second test that renders with `initialEntries=["/about"]` and asserts the About heading is present and the RequestForm is not.
- A small nav test (can live in `App.test.tsx`) clicks the "About" link from the home route and asserts the URL and rendered content change.
- The existing component tests (`RequestForm`, `StoryCard`, `StoryList`, `PdfPreviewModal`) do not need router wrappers, because those components do not call router APIs.

## Dependency change

- Add `react-router-dom` (latest 6.x) to `frontend/package.json` dependencies.
- No backend changes.

## Open questions

None. Resolved during brainstorming: routing choice (`react-router-dom`), nav placement (header), copy tone (parent-friendly, link to Learning Commons), and contact info (email + GitHub).
