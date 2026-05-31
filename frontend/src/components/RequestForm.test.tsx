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
});
