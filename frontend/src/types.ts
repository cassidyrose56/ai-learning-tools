export type ReadingLevel = "K" | "1" | "2" | "3" | "4" | "5";
export type Genre = "fiction" | "non-fiction";

export interface GenerateRequest {
  child_name: string;
  reading_level: ReadingLevel;
  genre: Genre;
  pages: number;
  include_drawing_box: boolean;
  topics: string[];
}

export interface StoryPayload {
  child_name: string;
  topic: string;
  genre: Genre;
  text: string;
  reading_level: ReadingLevel;
  pages: number;
  include_drawing_box: boolean;
}

export type SseEvent =
  | { type: "started"; story_id: string; topic: string }
  | { type: "attempt"; story_id: string; attempt: number }
  | {
      type: "done";
      story_id: string;
      text: string;
      predicted_grade: string | null;
      appropriate: boolean;
      attempts: number;
    }
  | { type: "error"; story_id: string | null; message: string }
  | { type: "complete" };

export type Presets = Record<string, string[]>;
