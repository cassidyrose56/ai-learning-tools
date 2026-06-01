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
