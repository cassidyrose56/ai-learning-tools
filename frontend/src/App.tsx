import { useEffect, useState } from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import GeneratorView from "./components/GeneratorView";
import AboutPage from "./AboutPage";
import SessionStreamer, {
  type SessionLike,
} from "./components/SessionStreamer";
import type { CardEntry } from "./components/StoryList";
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
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== "/") setPreviewStory(null);
  }, [location.pathname]);

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
          <h1>K-5 Story Generator</h1>
          <p className="tagline">
            Create short stories for kids who are learning to read.
          </p>
        </div>
        <nav className="app-nav" aria-label="Primary">
          <NavLink to="/" end>
            Generator
          </NavLink>
          <NavLink to="/about">About</NavLink>
        </nav>
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
          {effectiveTheme === "dark" ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
            </svg>
          )}
        </button>
      </header>

      {sessions.map((s) => (
        <SessionStreamer
          key={s.id}
          session={s}
          onUpsert={upsertStory}
          onPatch={patchStory}
        />
      ))}

      <Routes>
        <Route
          path="/"
          element={
            <GeneratorView
              entries={entries}
              previewStory={previewStory}
              onSubmit={handleSubmit}
              onDismiss={dismissStory}
              onPreviewPdf={(story, request) =>
                setPreviewStory({ story, request })
              }
              onClosePreview={() => setPreviewStory(null)}
            />
          }
        />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}
