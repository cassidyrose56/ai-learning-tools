import { useState } from "react";
import RequestForm from "./components/RequestForm";
import StoryList from "./components/StoryList";
import PdfPreviewModal from "./components/PdfPreviewModal";
import { streamSse } from "./lib/sse";
import type { GenerateRequest, SseEvent } from "./types";
import type { StoryCardState } from "./components/StoryCard";
import "./App.css";

export default function App() {
  const [request, setRequest] = useState<GenerateRequest | null>(null);
  const [events, setEvents] = useState<AsyncGenerator<SseEvent> | null>(null);
  const [previewStory, setPreviewStory] = useState<StoryCardState | null>(null);

  function handleSubmit(req: GenerateRequest) {
    setRequest(req);
    setEvents(streamSse("/api/generate", req));
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
      {request && events && (
        <StoryList
          events={events}
          request={request}
          onPreviewPdf={(s) => setPreviewStory(s)}
        />
      )}
      {previewStory && request && (
        <PdfPreviewModal
          open
          story={previewStory}
          request={request}
          onClose={() => setPreviewStory(null)}
        />
      )}
    </main>
  );
}
