import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RequestForm from "./RequestForm";

const PRESETS = {
  Sports: ["Soccer", "Basketball"],
  Animals: ["Dogs", "Cats"],
};

function mockPresets() {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(PRESETS), {
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("RequestForm", () => {
  it("requires name, ≥1 topic, and pages ≥ 1", async () => {
    mockPresets();
    const onSubmit = vi.fn();
    render(<RequestForm onSubmit={onSubmit} />);
    await waitFor(() =>
      expect(screen.getByText(/Sports/)).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: /generate/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("submits flat topic list including expanded subtopic and custom topic", async () => {
    mockPresets();
    const onSubmit = vi.fn();
    render(<RequestForm onSubmit={onSubmit} />);
    await waitFor(() =>
      expect(screen.getByText(/Sports/)).toBeInTheDocument(),
    );

    await userEvent.type(screen.getByLabelText(/student.*name/i), "Maya");
    // expand Sports
    await userEvent.click(screen.getByRole("button", { name: /Sports/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Soccer" }));
    // add a custom subtopic under Sports
    await userEvent.type(
      screen.getByLabelText(/Add custom.*Sports/i),
      "Curling",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /add Sports topic/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.topics).toEqual(expect.arrayContaining(["Soccer", "Curling"]));
    expect(payload.child_name).toBe("Maya");
    expect(payload.include_drawing_box).toBe(false);
  });

  it("toggles include_drawing_box and shows the PDF-only helper text", async () => {
    mockPresets();
    const onSubmit = vi.fn();
    render(<RequestForm onSubmit={onSubmit} />);
    await waitFor(() =>
      expect(screen.getByText(/Sports/)).toBeInTheDocument(),
    );

    expect(
      screen.getByText(/drawing box appears only in PDF/i),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/student.*name/i), "Maya");
    await userEvent.click(screen.getByRole("button", { name: /Sports/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Soccer" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /drawing box/i }));
    await userEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].include_drawing_box).toBe(true);
  });

  it("clears checked topics and custom drafts after submit", async () => {
    mockPresets();
    const onSubmit = vi.fn();
    render(<RequestForm onSubmit={onSubmit} />);
    await waitFor(() =>
      expect(screen.getByText(/Sports/)).toBeInTheDocument(),
    );

    await userEvent.type(screen.getByLabelText(/student.*name/i), "Maya");
    await userEvent.click(screen.getByRole("button", { name: /Sports/ }));
    const soccer = screen.getByRole("checkbox", { name: "Soccer" });
    await userEvent.click(soccer);
    expect(soccer).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: /generate/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    // After submit, Soccer should no longer be checked.
    const soccerAfter = screen.getByRole("checkbox", { name: "Soccer" });
    expect(soccerAfter).not.toBeChecked();
  });

  it("renders a custom topic as a toggleable checkbox under its category", async () => {
    mockPresets();
    const onSubmit = vi.fn();
    render(<RequestForm onSubmit={onSubmit} />);
    await waitFor(() =>
      expect(screen.getByText(/Sports/)).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: /Sports/ }));
    await userEvent.type(
      screen.getByLabelText(/Add custom.*Sports/i),
      "Curling",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /add Sports topic/i }),
    );

    // The custom topic now appears as a checked checkbox.
    const curling = screen.getByRole("checkbox", { name: "Curling" });
    expect(curling).toBeChecked();

    // It can be unchecked.
    await userEvent.click(curling);
    expect(curling).not.toBeChecked();
  });

  it("pages input allows empty intermediate state and retyped digits do not pad", async () => {
    mockPresets();
    const onSubmit = vi.fn();
    render(<RequestForm onSubmit={onSubmit} />);
    await waitFor(() =>
      expect(screen.getByText(/Sports/)).toBeInTheDocument(),
    );

    const pagesInput = screen.getByLabelText(/pages/i) as HTMLInputElement;
    expect(pagesInput.value).toBe("2");

    // Backspace the default; input should be empty (not "0").
    await userEvent.clear(pagesInput);
    expect(pagesInput.value).toBe("");

    // Type a single digit; should not show "0" prefix.
    await userEvent.type(pagesInput, "5");
    expect(pagesInput.value).toBe("5");

    // Fill the rest of the form and submit; payload carries 5.
    await userEvent.type(screen.getByLabelText(/student.*name/i), "Maya");
    await userEvent.click(screen.getByRole("button", { name: /Sports/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Soccer" }));
    await userEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].pages).toBe(5);
  });

  it("pages input rejects submission when empty", async () => {
    mockPresets();
    const onSubmit = vi.fn();
    render(<RequestForm onSubmit={onSubmit} />);
    await waitFor(() =>
      expect(screen.getByText(/Sports/)).toBeInTheDocument(),
    );

    await userEvent.type(screen.getByLabelText(/student.*name/i), "Maya");
    await userEvent.click(screen.getByRole("button", { name: /Sports/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Soccer" }));
    await userEvent.clear(screen.getByLabelText(/pages/i));

    await userEvent.click(screen.getByRole("button", { name: /generate/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/pages must be at least 1/i)).toBeInTheDocument();
  });
});
