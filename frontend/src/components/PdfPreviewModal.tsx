import { useEffect, useRef, useState } from "react";
import type { Genre, ReadingLevel } from "../types";
import type { StoryCardState } from "./StoryCard";

interface RequestContext {
  child_name: string;
  reading_level: ReadingLevel;
  genre: Genre;
  pages: number;
  include_drawing_box: boolean;
}

interface Props {
  open: boolean;
  story: StoryCardState;
  request: RequestContext;
  onClose: () => void;
}

interface PreviewHandle {
  url: string;
  filename: string;
}

export default function PdfPreviewModal({
  open,
  story,
  request,
  onClose,
}: Props) {
  const [preview, setPreview] = useState<PreviewHandle | null>(null);
  const [embedFailed, setEmbedFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const embedRef = useRef<HTMLEmbedElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    fetch("/api/export/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        format: "pdf",
        child_name: request.child_name,
        topic: story.topic,
        genre: request.genre,
        text: story.text ?? "",
        reading_level: request.reading_level,
        pages: request.pages,
        include_drawing_box: request.include_drawing_box,
      }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("export failed");
        return (await r.json()) as { token: string; filename: string };
      })
      .then(({ token, filename }) => {
        if (!active) return;
        const url = `/api/export/preview/${encodeURIComponent(filename)}?token=${encodeURIComponent(token)}`;
        setPreview({ url, filename });
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [open, story.story_id]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (!preview || !embedRef.current) return;
    const t = setTimeout(() => {
      if (embedRef.current && embedRef.current.clientHeight === 0) {
        setEmbedFailed(true);
      }
    }, 100);
    return () => clearTimeout(t);
  }, [preview]);

  function close() {
    setPreview(null);
    setEmbedFailed(false);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-modal-title"
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal">
        <header>
          <h2 id="pdf-modal-title">
            For {request.child_name} · {story.topic}
          </h2>
          <button aria-label="Close" onClick={close}>
            ×
          </button>
        </header>
        <div className="modal-body">
          {error && <p className="error">Couldn't generate PDF. Try again.</p>}
          {!error && preview && !embedFailed && (
            <embed
              ref={embedRef}
              type="application/pdf"
              src={preview.url}
              width="100%"
              height="100%"
            />
          )}
          {!error && preview && embedFailed && (
            <p>Your browser can't preview PDFs inline. Download to view.</p>
          )}
          {!error && !preview && <p>Loading preview…</p>}
        </div>
        <footer>
          <button onClick={close}>Cancel</button>
          {preview ? (
            <a
              className="modal-download"
              href={preview.url}
              download={preview.filename}
              autoFocus
            >
              Download
            </a>
          ) : (
            <button disabled>Download</button>
          )}
        </footer>
      </div>
    </div>
  );
}
