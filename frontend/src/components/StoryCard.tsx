import { useState } from "react";
import type { Genre, ReadingLevel } from "../types";

export interface StoryCardState {
  story_id: string;
  topic: string;
  status: "pending" | "done" | "error";
  attempts: number;
  text?: string;
  appropriate?: boolean;
  predicted_grade?: string | null;
  error?: string;
}

export interface StoryRequestContext {
  child_name: string;
  reading_level: ReadingLevel;
  genre: Genre;
  pages: number;
  include_drawing_box: boolean;
}

interface Props {
  state: StoryCardState;
  request: StoryRequestContext;
  onPreviewPdf: (state: StoryCardState) => void;
  onDismiss: (story_id: string) => void;
}

async function downloadDocx(state: StoryCardState, req: StoryRequestContext) {
  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      format: "docx",
      child_name: req.child_name,
      topic: state.topic,
      genre: req.genre,
      text: state.text ?? "",
      reading_level: req.reading_level,
      pages: req.pages,
      include_drawing_box: req.include_drawing_box,
    }),
  });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${req.child_name}_${state.topic}.docx`.replace(/\s+/g, "_");
  a.click();
  URL.revokeObjectURL(url);
}

export default function StoryCard({ state, request, onPreviewPdf, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="story-card">
      <header>
        <h3>
          For {request.child_name} · {state.topic}
        </h3>
        <div className="card-header-actions">
          <span className="badge level">
            Reading level: {request.reading_level === "K" ? "K" : `Grade ${request.reading_level}`}
          </span>
          {state.status === "done" && state.appropriate === false && (
            <span className="badge warning">
              Couldn't confirm reading level
            </span>
          )}
          <button
            type="button"
            aria-label="Remove story"
            className="card-close"
            onClick={() => onDismiss(state.story_id)}
          >
            ×
          </button>
        </div>
      </header>

      {state.status === "pending" && (
        <div
          className="story-skeleton"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="sr-only">
            Generating story (attempt {state.attempts || 1}).
          </span>
          <div className="skeleton-line" aria-hidden="true" />
          <div className="skeleton-line" aria-hidden="true" />
          <div className="skeleton-line skeleton-line--short" aria-hidden="true" />
        </div>
      )}
      {state.status === "error" && <p className="error">{state.error}</p>}
      {state.status === "done" && (
        <>
          <div className="story-body">
            <div
              className={
                expanded
                  ? "story-text"
                  : "story-text story-text--collapsed"
              }
              style={{ whiteSpace: "pre-wrap" }}
            >
              {state.text}
            </div>
            <button
              type="button"
              className="card-chevron"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "View Less" : "View More"}
            </button>
          </div>
          <div className="actions">
            <button onClick={() => downloadDocx(state, request)}>
              Download as Word
            </button>
            <button onClick={() => onPreviewPdf(state)}>
              Download as PDF
            </button>
          </div>
          <p className="helper">
            PDFs are pre-formatted for printing. Word docs are plain text.
            Apply your own formatting after download.
          </p>
        </>
      )}
    </article>
  );
}
