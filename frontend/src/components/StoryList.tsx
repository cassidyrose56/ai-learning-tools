import type { GenerateRequest } from "../types";
import StoryCard, {
  type StoryCardState,
  type StoryRequestContext,
} from "./StoryCard";

export interface CardEntry {
  state: StoryCardState;
  request: GenerateRequest;
  sessionId: string;
}

interface Props {
  entries: CardEntry[];
  onPreviewPdf: (state: StoryCardState, request: GenerateRequest) => void;
  onDismiss: (story_id: string) => void;
}

async function downloadBundle(
  format: "docx" | "pdf",
  entries: CardEntry[],
) {
  const stories = entries
    .filter((e) => e.state.status === "done" && e.state.text)
    .map((e) => ({
      child_name: e.request.child_name,
      topic: e.state.topic,
      genre: e.request.genre,
      text: e.state.text!,
      reading_level: e.request.reading_level,
      pages: e.request.pages,
      include_drawing_box: e.request.include_drawing_box,
    }));
  if (stories.length === 0) return;
  const response = await fetch("/api/export/bundle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ format, stories }),
  });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `learning_stories.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function StoryList({
  entries,
  onPreviewPdf,
  onDismiss,
}: Props) {
  const doneCount = entries.filter((e) => e.state.status === "done").length;

  return (
    <section>
      <header className="bundle-actions">
        <button
          disabled={!doneCount}
          onClick={() => downloadBundle("docx", entries)}
        >
          Download all as Word
        </button>
        <button
          disabled={!doneCount}
          onClick={() => downloadBundle("pdf", entries)}
        >
          Download all as PDF
        </button>
      </header>
      <div className="story-list">
        {entries.length === 0 ? (
          <p className="empty">
            Stories will appear here as they are generated.
          </p>
        ) : (
          entries.map((e) => {
            const ctx: StoryRequestContext = {
              child_name: e.request.child_name,
              reading_level: e.request.reading_level,
              genre: e.request.genre,
              pages: e.request.pages,
              include_drawing_box: e.request.include_drawing_box,
            };
            return (
              <StoryCard
                key={e.state.story_id}
                state={e.state}
                request={ctx}
                onPreviewPdf={(s) => onPreviewPdf(s, e.request)}
                onDismiss={onDismiss}
              />
            );
          })
        )}
      </div>
    </section>
  );
}
