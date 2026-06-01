import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import type { SseEvent } from "./types";

vi.mock("./lib/sse", () => {
  let counter = 0;
  return {
    streamSse: vi.fn(() => {
      counter += 1;
      const id = `s${counter}`;
      const topic = counter === 1 ? "Soccer" : "Dinosaurs";
      const script: SseEvent[] = [
        { type: "started", story_id: id, topic },
        {
          type: "done",
          story_id: id,
          text: "body",
          appropriate: true,
          predicted_grade: "3",
          attempts: 1,
        },
        { type: "complete" },
      ];
      return (async function* () {
        for (const ev of script) yield ev;
      })();
    }),
  };
});

const PRESETS = { Sports: ["Soccer"], Animals: ["Dinosaurs"] };

function mockPresets() {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(PRESETS), {
      headers: { "content-type": "application/json" },
    }),
  );
}

async function submitFor(name: string, topic: string) {
  await userEvent.clear(screen.getByLabelText(/student.*name/i));
  await userEvent.type(screen.getByLabelText(/student.*name/i), name);
  // Open the category, check the topic, generate.
  const categoryBtn =
    topic === "Soccer"
      ? screen.getByRole("button", { name: /^Sports$/ })
      : screen.getByRole("button", { name: /^Animals$/ });
  await userEvent.click(categoryBtn);
  await userEvent.click(screen.getByRole("checkbox", { name: topic }));
  await userEvent.click(screen.getByRole("button", { name: /generate/i }));
}

describe("App multi-kid sessions", () => {
  it("renders one block per submission with newest at top", async () => {
    mockPresets();
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Sports$/ })).toBeInTheDocument(),
    );

    await submitFor("Maya", "Soccer");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Stories for Maya/i })).toBeInTheDocument(),
    );

    await submitFor("Liam", "Dinosaurs");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Stories for Liam/i })).toBeInTheDocument(),
    );

    // Both headings present.
    expect(screen.getByRole("heading", { name: /Stories for Maya/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Stories for Liam/i })).toBeInTheDocument();

    // Liam's block (newest) appears before Maya's in document order.
    const liam = screen.getByRole("heading", { name: /Stories for Liam/i });
    const maya = screen.getByRole("heading", { name: /Stories for Maya/i });
    const order = liam.compareDocumentPosition(maya);
    // 4 = DOCUMENT_POSITION_FOLLOWING
    expect(order & 4).toBeTruthy();
  });
});
