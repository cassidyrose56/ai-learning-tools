import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StoryCard, { type StoryCardState } from "./StoryCard";

const baseState: StoryCardState = {
  story_id: "a",
  topic: "Soccer",
  status: "pending",
  attempts: 0,
};

describe("StoryCard", () => {
  it("shows skeleton when pending", () => {
    render(
      <StoryCard
        state={baseState}
        request={{
          child_name: "Maya",
          reading_level: "3",
          genre: "fiction",
          pages: 1,
          include_drawing_box: false,
        }}
        onPreviewPdf={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading")).toHaveTextContent(/Soccer/);
    expect(screen.getByText(/Generating/i)).toBeInTheDocument();
  });

  it("shows text and no warning when appropriate", () => {
    render(
      <StoryCard
        state={{
          ...baseState,
          status: "done",
          text: "Once upon a time.",
          appropriate: true,
          predicted_grade: "3",
          attempts: 1,
        }}
        request={{
          child_name: "Maya",
          reading_level: "3",
          genre: "fiction",
          pages: 1,
          include_drawing_box: false,
        }}
        onPreviewPdf={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("Once upon a time.")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't confirm/i)).not.toBeInTheDocument();
  });

  it("shows the warning badge when not appropriate", () => {
    render(
      <StoryCard
        state={{
          ...baseState,
          status: "done",
          text: "Body.",
          appropriate: false,
          predicted_grade: "5",
          attempts: 3,
        }}
        request={{
          child_name: "Maya",
          reading_level: "3",
          genre: "fiction",
          pages: 1,
          include_drawing_box: false,
        }}
        onPreviewPdf={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(/couldn't confirm/i)).toBeInTheDocument();
  });

  it("defaults to collapsed 5-line preview and expands via the chevron", async () => {
    const userEvent = (await import("@testing-library/user-event")).default;
    render(
      <StoryCard
        state={{
          ...baseState,
          status: "done",
          text: "Once upon a time.",
          appropriate: true,
          predicted_grade: "3",
          attempts: 1,
        }}
        request={{
          child_name: "Maya",
          reading_level: "3",
          genre: "fiction",
          pages: 1,
          include_drawing_box: false,
        }}
        onPreviewPdf={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    // Body is in the DOM and clamped via the modifier class by default.
    const body = screen.getByText("Once upon a time.");
    expect(body).toBeInTheDocument();
    expect(body).toHaveClass("story-text--collapsed");

    // Click to expand.
    const expandBtn = screen.getByRole("button", { name: /view more/i });
    await userEvent.click(expandBtn);
    expect(screen.getByText("Once upon a time.")).not.toHaveClass(
      "story-text--collapsed",
    );

    // Click again to collapse.
    const collapseBtn = screen.getByRole("button", { name: /view less/i });
    await userEvent.click(collapseBtn);
    expect(screen.getByText("Once upon a time.")).toHaveClass(
      "story-text--collapsed",
    );
  });

  it("calls onDismiss with the story_id when the remove button is clicked", async () => {
    const userEvent = (await import("@testing-library/user-event")).default;
    const onDismiss = vi.fn();
    render(
      <StoryCard
        state={{
          ...baseState,
          story_id: "abc-123",
          status: "done",
          text: "Body.",
          appropriate: true,
          predicted_grade: "3",
          attempts: 1,
        }}
        request={{
          child_name: "Maya",
          reading_level: "3",
          genre: "fiction",
          pages: 1,
          include_drawing_box: false,
        }}
        onPreviewPdf={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /remove story/i }));
    expect(onDismiss).toHaveBeenCalledWith("abc-123");
  });
});
