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

  it("toggles the story body with the Hide/Show button", async () => {
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
    expect(screen.getByText("Once upon a time.")).toBeInTheDocument();
    const hideBtn = screen.getByRole("button", { name: /hide story/i });
    await userEvent.click(hideBtn);
    expect(screen.queryByText("Once upon a time.")).not.toBeInTheDocument();
    const showBtn = screen.getByRole("button", { name: /show story/i });
    await userEvent.click(showBtn);
    expect(screen.getByText("Once upon a time.")).toBeInTheDocument();
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
