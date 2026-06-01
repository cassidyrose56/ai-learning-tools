import { useEffect } from "react";
import type { GenerateRequest, SseEvent } from "../types";
import type { StoryCardState } from "./StoryCard";

export interface SessionLike {
  id: string;
  request: GenerateRequest;
  events: AsyncGenerator<SseEvent>;
}

interface Props {
  session: SessionLike;
  onUpsert: (
    sessionId: string,
    request: GenerateRequest,
    state: StoryCardState,
  ) => void;
  onPatch: (story_id: string, patch: Partial<StoryCardState>) => void;
}

export default function SessionStreamer({
  session,
  onUpsert,
  onPatch,
}: Props) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for await (const ev of session.events) {
        if (cancelled) return;
        if (ev.type === "started") {
          onUpsert(session.id, session.request, {
            story_id: ev.story_id,
            topic: ev.topic,
            status: "pending",
            attempts: 0,
          });
        } else if (ev.type === "attempt") {
          onPatch(ev.story_id, { attempts: ev.attempt });
        } else if (ev.type === "done") {
          onPatch(ev.story_id, {
            status: "done",
            text: ev.text,
            appropriate: ev.appropriate,
            predicted_grade: ev.predicted_grade,
            attempts: ev.attempts,
          });
        } else if (ev.type === "error" && ev.story_id) {
          onPatch(ev.story_id, {
            status: "error",
            error: ev.message,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  return null;
}
