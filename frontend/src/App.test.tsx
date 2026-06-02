import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const sseGate = vi.hoisted(() => {
  let resolve: (() => void) | null = null;
  let promise: Promise<void> = Promise.resolve();
  return {
    open() {
      promise = new Promise<void>((r) => {
        resolve = r;
      });
    },
    release() {
      const r = resolve;
      resolve = null;
      r?.();
    },
    get current() {
      return promise;
    },
    reset() {
      resolve = null;
      promise = Promise.resolve();
    },
  };
});

vi.mock("./lib/sse", () => {
  let counter = 0;
  return {
    streamSse: vi.fn(() => {
      counter += 1;
      const id = `s${counter}`;
      const topic = counter === 1 ? "Soccer" : "Dinosaurs";
      return (async function* () {
        yield { type: "started", story_id: id, topic };
        await sseGate.current;
        yield {
          type: "done",
          story_id: id,
          text: "body",
          appropriate: true,
          predicted_grade: "3",
          attempts: 1,
        };
        yield { type: "complete" };
      })();
    }),
  };
});

beforeEach(() => {
  sseGate.reset();
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
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
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
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
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
        <MemoryRouter initialEntries={["/"]}>
          <App />
        </MemoryRouter>
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

describe("App routing", () => {
  it("renders About content at /about and does not render the generator form", async () => {
    mockPresets();
    render(
      <MemoryRouter initialEntries={["/about"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /I'm Cassidy/ }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /generate/i }),
    ).not.toBeInTheDocument();
  });

  it("clicking the About nav link from / shows About and hides the generator", async () => {
    mockPresets();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /generate/i })).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("link", { name: /^About$/ }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /I'm Cassidy/ }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /generate/i }),
    ).not.toBeInTheDocument();
  });

  it("returning from /about preserves generated stories", async () => {
    mockPresets();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Sports$/ })).toBeInTheDocument(),
    );

    await submitFor("Maya", "Soccer");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /For Maya/i })).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("link", { name: /^About$/ }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /I'm Cassidy/ }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("heading", { name: /For Maya/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: /^Generator$/ }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /For Maya/i })).toBeInTheDocument(),
    );
  });

  it("in-flight stream completes while user is on /about", async () => {
    mockPresets();
    sseGate.open();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Sports$/ })).toBeInTheDocument(),
    );

    await submitFor("Maya", "Soccer");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /For Maya/i })).toBeInTheDocument(),
    );
    // Card is in pending state (gate not released yet).
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");

    await userEvent.click(screen.getByRole("link", { name: /^About$/ }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /I'm Cassidy/ }),
      ).toBeInTheDocument(),
    );

    sseGate.release();

    await userEvent.click(screen.getByRole("link", { name: /^Generator$/ }));
    // After the round trip, the done event should have landed.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Download as PDF/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("navigating to /about clears an open PDF preview so it does not reopen on return", async () => {
    mockPresets();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Sports$/ })).toBeInTheDocument(),
    );

    await submitFor("Maya", "Soccer");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Download as PDF/i })).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: /Download as PDF/i }));
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("link", { name: /^About$/ }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /I'm Cassidy/ }),
      ).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("link", { name: /^Generator$/ }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /For Maya/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("unknown paths redirect to /", async () => {
    mockPresets();
    render(
      <MemoryRouter initialEntries={["/totally-bogus"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /generate/i })).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("heading", { name: /I'm Cassidy/ }),
    ).not.toBeInTheDocument();
  });
});
