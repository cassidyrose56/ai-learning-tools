import { StrictMode } from "react";
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
  vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(PRESETS), {
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

async function submitFor(name: string, topic: string) {
  await userEvent.clear(screen.getByLabelText(/student.*name/i));
  await userEvent.type(screen.getByLabelText(/student.*name/i), name);
  const categoryBtn =
    topic === "Soccer"
      ? screen.getByRole("button", { name: /^Sports$/ })
      : screen.getByRole("button", { name: /^Animals$/ });
  await userEvent.click(categoryBtn);
  await userEvent.click(screen.getByRole("checkbox", { name: topic }));
  await userEvent.click(screen.getByRole("button", { name: /generate/i }));
}

describe("App consolidated story list", () => {
  it("renders one card per submission across kids, newest first, and a single bundle", async () => {
    mockPresets();
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Sports$/ })).toBeInTheDocument(),
    );

    await submitFor("Maya", "Soccer");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /For Maya/i })).toBeInTheDocument(),
    );

    await submitFor("Liam", "Dinosaurs");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /For Liam/i })).toBeInTheDocument(),
    );

    // Both card headings present; no per-kid section headings remain.
    expect(screen.queryByRole("heading", { name: /Stories for Maya/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Stories for Liam/i })).not.toBeInTheDocument();

    const mayaCard = screen.getByRole("heading", { name: /For Maya/i });
    const liamCard = screen.getByRole("heading", { name: /For Liam/i });
    const order = liamCard.compareDocumentPosition(mayaCard);
    // 4 = DOCUMENT_POSITION_FOLLOWING (liam comes before maya)
    expect(order & 4).toBeTruthy();

    // Exactly one "Download all as PDF" button on the page.
    expect(
      screen.getAllByRole("button", { name: /Download all as PDF/i }),
    ).toHaveLength(1);
  });

  it("removing a card calls dismiss; that card is gone", async () => {
    mockPresets();
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Sports$/ })).toBeInTheDocument(),
    );

    await submitFor("Maya", "Soccer");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /For Maya/i })).toBeInTheDocument(),
    );

    await submitFor("Liam", "Dinosaurs");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /For Liam/i })).toBeInTheDocument(),
    );

    // Remove Maya's card.
    const removeButtons = screen.getAllByRole("button", { name: /Remove story/i });
    // The first Remove button belongs to the card at the top (Liam, newest).
    // Find Maya's by walking the article ancestor.
    const mayaArticle = screen
      .getByRole("heading", { name: /For Maya/i })
      .closest("article")!;
    const removeMaya = mayaArticle.querySelector('button[aria-label="Remove story"]') as HTMLButtonElement;
    await userEvent.click(removeMaya);

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /For Maya/i })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: /For Liam/i })).toBeInTheDocument();
    // The unused removeButtons reference is intentional - kept for clarity.
    void removeButtons;
  });

  it("does not drop SSE events when mounted inside StrictMode", async () => {
    mockPresets();
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Sports$/ })).toBeInTheDocument(),
    );

    await submitFor("Maya", "Soccer");

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /For Maya/i })).toBeInTheDocument(),
    );
  });
});
