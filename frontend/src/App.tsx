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
