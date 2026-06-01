import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StoryList, { type CardEntry } from "./StoryList";

function makeEntry(over: Partial<CardEntry["state"]> & { child_name?: string }): CardEntry {
  const { child_name = "Maya", ...stateOver } = over;
  return {
    sessionId: "sess-1",
    request: {
      child_name,
      reading_level: "3",
      genre: "fiction",
      pages: 1,
      include_drawing_box: false,
      topics: [stateOver.topic ?? "Soccer"],
    },
    state: {
      story_id: stateOver.story_id ?? `id-${Math.random().toString(36).slice(2)}`,
      topic: stateOver.topic ?? "Soccer",
      status: stateOver.status ?? "done",
      attempts: stateOver.attempts ?? 1,
      text: stateOver.text ?? "Body.",
      appropriate: stateOver.appropriate ?? true,
      predicted_grade: stateOver.predicted_grade ?? "3",
    },
  };
}

describe("StoryList", () => {
  it("renders an empty placeholder with no entries", () => {
    render(
      <StoryList entries={[]} onPreviewPdf={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(screen.getByText(/Stories will appear here/)).toBeInTheDocument();
  });

  it("disables bundle buttons until at least one story is done", () => {
    render(
      <StoryList
        entries={[makeEntry({ status: "pending", text: undefined })]}
        onPreviewPdf={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Download all as Word/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Download all as PDF/i })).toBeDisabled();
  });

  it("posts a flat list of stories across kids when bundling", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("zip", {
        headers: { "content-type": "application/zip" },
      }),
    );
    URL.createObjectURL = vi.fn(() => "blob:url");
    URL.revokeObjectURL = vi.fn();

    render(
      <StoryList
        entries={[
          makeEntry({ child_name: "Maya", topic: "Soccer" }),
          makeEntry({ child_name: "Liam", topic: "Dinosaurs" }),
        ]}
        onPreviewPdf={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Download all as PDF/i }),
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe("/api/export/bundle");
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.format).toBe("pdf");
    expect(body.stories).toHaveLength(2);
    const names = body.stories.map((s: { child_name: string }) => s.child_name);
    expect(names).toEqual(expect.arrayContaining(["Maya", "Liam"]));
  });
});
