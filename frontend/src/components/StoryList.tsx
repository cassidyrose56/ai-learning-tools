import { useEffect, useState } from "react";
import type { SseEvent } from "../types";
import StoryCard, {
  type StoryCardState,
  type StoryRequestContext,
} from "./StoryCard";

interface Props {
  events: AsyncGenerator<SseEvent>;
  request: StoryRequestContext;
  onPreviewPdf: (state: StoryCardState) => void;
}

async function downloadBundle(
  format: "docx" | "pdf",
  stories: StoryCardState[],
  request: StoryRequestContext,
) {
  const response = await fetch("/api/export/bundle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      format,
      stories: stories
        .filter((s) => s.status === "done" && s.text)
        .map((s) => ({
          child_name: request.child_name,
          topic: s.topic,
          genre: request.genre,
          text: s.text!,
          reading_level: request.reading_level,
          pages: request.pages,
          include_drawing_box: request.include_drawing_box,
        })),
    }),
  });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${request.child_name}_stories.zip`.replace(/\s+/g, "_");
  a.click();
  URL.revokeObjectURL(url);
}

export default function StoryList({ events, request, onPreviewPdf }: Props) {
  const [stories, setStories] = useState<Record<string, StoryCardState>>({});
  const [order, setOrder] = useState<string[]>([]);

  function dismiss(id: string) {
    setOrder((o) => o.filter((x) => x !== id));
    setStories((s) => {
      if (!(id in s)) return s;
      const rest = { ...s };
      delete rest[id];
      return rest;
    });
  }

  useEffect(() => {
    (async () => {
      for await (const ev of events) {
        if (ev.type === "started") {
          setOrder((o) => [...o, ev.story_id]);
          setStories((s) => ({
            ...s,
            [ev.story_id]: {
              story_id: ev.story_id,
              topic: ev.topic,
              status: "pending",
              attempts: 0,
            },
          }));
        } else if (ev.type === "attempt") {
          setStories((s) => {
            if (!s[ev.story_id]) return s;
            return { ...s, [ev.story_id]: { ...s[ev.story_id], attempts: ev.attempt } };
          });
        } else if (ev.type === "done") {
          setStories((s) => {
            if (!s[ev.story_id]) return s;
            return {
              ...s,
              [ev.story_id]: {
                ...s[ev.story_id],
                status: "done",
                text: ev.text,
                appropriate: ev.appropriate,
                predicted_grade: ev.predicted_grade,
                attempts: ev.attempts,
              },
            };
          });
        } else if (ev.type === "error" && ev.story_id) {
          setStories((s) => {
            if (!s[ev.story_id!]) return s;
            return {
              ...s,
              [ev.story_id!]: {
                ...s[ev.story_id!],
                status: "error",
                error: ev.message,
              },
            };
          });
        }
      }
    })();
  }, [events]);

  const list = order.map((id) => stories[id]).filter(Boolean);
  const doneStories = list.filter((s) => s.status === "done");

  return (
    <section>
      <header className="bundle-actions">
        <button
          disabled={!doneStories.length}
          onClick={() => downloadBundle("docx", doneStories, request)}
        >
          Download all as Word
        </button>
        <button
          disabled={!doneStories.length}
          onClick={() => downloadBundle("pdf", doneStories, request)}
        >
          Download all as PDF
        </button>
      </header>
      <div className="story-list">
        {list.length === 0 ? (
          <p className="empty">
            Stories will appear here as they are generated.
          </p>
        ) : (
          list.map((state) => (
            <StoryCard
              key={state.story_id}
              state={state}
              request={request}
              onPreviewPdf={onPreviewPdf}
              onDismiss={dismiss}
            />
          ))
        )}
      </div>
    </section>
  );
}
