# About page implementation kickoff

Paste the prompt below into a fresh Claude Code context window in this repo to implement the About page. The spec at `docs/superpowers/specs/2026-06-01-about-page-design.md` is the source of truth; the prompt points the implementer at it.

---

## Prompt to paste

Implement the About page for the AI Learning Tools site. The full design and the final user-visible copy are in `docs/superpowers/specs/2026-06-01-about-page-design.md`. Read that spec first; it is authoritative. The summary below is just a kickoff so you know how to sequence the work and where subagents help.

### Hard requirements

- **Read the spec end to end before touching code.** Match the architecture, component shapes, props, and routes exactly as written there.
- **TDD.** Use the `superpowers:test-driven-development` skill. Write each test first, watch it fail, then write the code that makes it pass. The spec's `## Testing` section lists every test that needs to exist.
- **Humanizer on copy.** The page copy already in the spec has been through one humanizer pass. Ship the copy verbatim. If you make any edits to the prose (including section headings or link text), run the modified copy through `skills/humanizer/SKILL.md` again before merge. Hard constraints from that skill restated: no em or en dashes, sentence-case headings, no AI-tell vocabulary (vibrant, pivotal, testament, tapestry, underscore, etc.), no rule-of-three filler, no bolded inline-list headers, no emojis, no chatbot artifacts.
- **Verify in a browser before declaring done.** Use the `superpowers:verification-before-completion` skill. Start `make frontend-dev`, open the app, confirm: the Generator route works exactly as it did before; clicking About loads `/about` and shows the four sections; clicking Generator returns; an in-flight generation survives a round trip to `/about`; the theme toggle still works on both routes; browser back/forward switches routes; refreshing `/about` directly still renders the About page.

### Where subagents fit

This work has one clear parallelization point and one clear end-of-task review. Use them; the rest is sequential and best done in the main context.

1. **Up front: dispatch one `Explore` subagent** (the `Explore` agent type) to confirm three things in a single message: current `react-router-dom` releases in the npm registry (use the most recent stable major), the exact import shape used by other tests in `frontend/src/` for `MemoryRouter` patterns (there are none today; verify), and any existing ESLint rules that would object to JSX in a new test file. Have it report in under 150 words. Skip this if you already know the answers.

2. **Parallel implementation tracks** (run as two `general-purpose` subagents in a single message, only after the spec is read and the dependency is installed):
   - **Track A, AboutPage**: create `frontend/src/components/AboutPage.tsx` and `frontend/src/components/AboutPage.test.tsx`. The component is presentational; the test file asserts each of the four section headings, the three external link URLs, and that external links carry `rel="noopener noreferrer"` and `target="_blank"`. Brief the agent with the relevant spec sections inline so it does not need to re-read the whole spec.
   - **Track B, routing scaffold**: extract `frontend/src/components/GeneratorView.tsx` from the body of `App.tsx` per the spec's `GeneratorViewProps` shape; wrap `<App />` in `<BrowserRouter>` in `main.tsx`; add `<Routes>` and the header `<nav>` (NavLink-based) in `App.tsx`; add the nav CSS in `App.css`; update `App.test.tsx` to wrap in `MemoryRouter` and add the two routing tests from the spec. Track B should import `AboutPage` from the path Track A uses, even though Track A is running in parallel; the import target is fixed by the spec.

   Both tracks should follow TDD inside their own scope. They do not share files (Track A only writes new files; Track B only edits existing ones plus the new GeneratorView). Merge their results when both return.

3. **End: dispatch the `code-review` skill on the diff.** After all tests pass and the browser verification is done, run `/code-review` (or invoke the equivalent `code-review` slash skill) at medium effort. Resolve any correctness findings before finishing.

### Sequencing

1. Read the spec.
2. Install `react-router-dom` in `frontend/`.
3. (Optional) Dispatch the recon Explore subagent.
4. Dispatch Tracks A and B in parallel.
5. Run `make test` from the repo root. Fix anything red.
6. Run `npm --prefix frontend run lint` and `npm --prefix frontend run build`. Fix anything red.
7. Start `make frontend-dev` and walk through the browser verification checklist above.
8. Dispatch the code-review skill on the diff. Resolve findings.
9. Commit. Follow the existing commit style in `git log` (Conventional Commits, scoped, with `Co-Authored-By` trailer).

### Out of scope

- Any backend change.
- SPA fallback config for production hosting.
- Analytics, telemetry, or persistence on the About page.
- Restyling the header beyond what the new nav requires.
- Touching the modified-but-uncommitted files already present in the working tree (`docs/superpowers/plans/2026-06-01-ui-iteration-v2-plan.md`, the v2 design doc, `App.css`, `RequestForm.tsx`). Do not stage or commit those as part of this work; leave them alone.

If anything in the spec is ambiguous after a careful read, stop and ask rather than guessing.
