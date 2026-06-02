import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import PdfPreviewModal from "./PdfPreviewModal";

const REQUEST = {
  child_name: "Maya",
  reading_level: "3" as const,
  genre: "fiction" as const,
  pages: 1,
  include_drawing_box: false,
};

const STATE = {
  story_id: "a",
  topic: "Soccer",
  status: "done" as const,
  text: "Body.",
  appropriate: true,
  attempts: 1,
};

function mockPreparePreview() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({ token: "tok-123", filename: "Maya_Soccer.pdf" }),
      { headers: { "content-type": "application/json" } },
    ),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("PdfPreviewModal", () => {
  it("renders header and shows the embed pointed at the named preview URL", async () => {
    mockPreparePreview();
    render(
      <PdfPreviewModal
        open
        story={STATE}
        request={REQUEST}
        onClose={vi.fn()}
      />,
    );
    expect(
      await screen.findByText(/For Maya · Soccer/),
    ).toBeInTheDocument();
    await waitFor(() => {
      const embed = document.querySelector("embed");
      expect(embed?.getAttribute("src")).toBe(
        "/api/export/preview/Maya_Soccer.pdf?token=tok-123",
      );
    });
  });

  it("Download anchor uses the same named URL with a download attribute", async () => {
    mockPreparePreview();
    render(
      <PdfPreviewModal open story={STATE} request={REQUEST} onClose={vi.fn()} />,
    );
    const download = (await screen.findByRole("link", {
      name: /download/i,
    })) as HTMLAnchorElement;
    expect(download.getAttribute("href")).toBe(
      "/api/export/preview/Maya_Soccer.pdf?token=tok-123",
    );
    expect(download.getAttribute("download")).toBe("Maya_Soccer.pdf");
  });

  it("Cancel closes the modal", async () => {
    mockPreparePreview();
    const onClose = vi.fn();
    render(
      <PdfPreviewModal open story={STATE} request={REQUEST} onClose={onClose} />,
    );
    await screen.findByText(/For Maya · Soccer/);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Esc closes the modal", async () => {
    mockPreparePreview();
    const onClose = vi.fn();
    render(
      <PdfPreviewModal open story={STATE} request={REQUEST} onClose={onClose} />,
    );
    await screen.findByText(/For Maya · Soccer/);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("shows fallback when embed has zero height", async () => {
    mockPreparePreview();
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => 0,
    });
    render(
      <PdfPreviewModal open story={STATE} request={REQUEST} onClose={vi.fn()} />,
    );
    expect(
      await screen.findByText(/can't preview PDFs inline/i),
    ).toBeInTheDocument();
  });
});
