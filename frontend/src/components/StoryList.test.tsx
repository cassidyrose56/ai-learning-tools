import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StoryList from "./StoryList";
import type { SseEvent } from "../types";

const SCRIPT: SseEvent[] = [
  { type: "started", story_id: "a", topic: "Soccer" },
  { type: "attempt", story_id: "a", attempt: 1 },
  {
    type: "done",
    story_id: "a",
    text: "A body.",
    appropriate: true,
    predicted_grade: "3",
    attempts: 1,
  },
  { type: "started", story_id: "b", topic: "Dinosaurs" },
  {
    type: "done",
    story_id: "b",
    text: "B body.",
    appropriate: false,
    predicted_grade: "5",
    attempts: 3,
  },
  { type: "complete" },
];

function fakeStream(): AsyncGenerator<SseEvent> {
  let i = 0;
  return (async function* () {
    while (i < SCRIPT.length) yield SCRIPT[i++];
  })();
}

describe("StoryList", () => {
  it("renders cards from scripted SSE events", async () => {
    render(
      <StoryList
        events={fakeStream()}
        request={{
          child_name: "Maya",
          reading_level: "3",
          genre: "fiction",
          pages: 1,
          include_drawing_box: false,
        }}
        onPreviewPdf={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Soccer/)).toBeInTheDocument();
      expect(screen.getByText(/Dinosaurs/)).toBeInTheDocument();
    });
    expect(screen.getByText("A body.")).toBeInTheDocument();
    expect(screen.getByText("B body.")).toBeInTheDocument();
    expect(screen.getByText(/couldn't confirm/i)).toBeInTheDocument();
  });

  it("shows Download all buttons that hit the bundle endpoint", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("zip"));
    render(
      <StoryList
        events={fakeStream()}
        request={{
          child_name: "Maya",
          reading_level: "3",
          genre: "fiction",
          pages: 1,
          include_drawing_box: false,
        }}
        onPreviewPdf={vi.fn()}
      />,
    );

    const wordBtn = await screen.findByRole("button", {
      name: /download all.*word/i,
    });
    wordBtn.click();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/export/bundle",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls.at(-1)?.[1] as RequestInit).body as string,
    );
    expect(body.format).toBe("docx");
    expect(body.stories).toHaveLength(2);
  });
});
