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

export default function PdfPreviewModal({
  open,
  story,
  request,
  onClose,
}: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [embedFailed, setEmbedFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const embedRef = useRef<HTMLEmbedElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    fetch("/api/export", {
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
        return r.blob();
      })
      .then((b) => {
        if (!active) return;
        setBlob(b);
        setBlobUrl(URL.createObjectURL(b));
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
  }, [open, blobUrl]);

  useEffect(() => {
    if (!blobUrl || !embedRef.current) return;
    const t = setTimeout(() => {
      if (embedRef.current && embedRef.current.clientHeight === 0) {
        setEmbedFailed(true);
      }
    }, 100);
    return () => clearTimeout(t);
  }, [blobUrl]);

  function close() {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setBlob(null);
    setEmbedFailed(false);
    onClose();
  }

  function download() {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${request.child_name}_${story.topic}.pdf`.replace(
      /\s+/g,
      "_",
    );
    a.click();
    URL.revokeObjectURL(url);
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
          {!error && blobUrl && !embedFailed && (
            <embed
              ref={embedRef}
              type="application/pdf"
              src={blobUrl}
              width="100%"
              height="100%"
            />
          )}
          {!error && blobUrl && embedFailed && (
            <p>Your browser can't preview PDFs inline. Download to view.</p>
          )}
          {!error && !blobUrl && <p>Loading preview…</p>}
        </div>
        <footer>
          <button onClick={close}>Cancel</button>
          <button autoFocus onClick={download} disabled={!blob}>
            Download
          </button>
        </footer>
      </div>
    </div>
  );
}
