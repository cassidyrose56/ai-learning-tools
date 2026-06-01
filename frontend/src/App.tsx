import { useState } from "react";
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

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [previewStory, setPreviewStory] = useState<{
    story: StoryCardState;
    request: GenerateRequest;
  } | null>(null);

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

  return (
    <main className="page">
      <header className="app-header">
        <h1>AI Learning Tools</h1>
        <p className="tagline">
          Short reading-practice stories for kids who are learning to read.
        </p>
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
