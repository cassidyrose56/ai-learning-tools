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

function mockExportReturnsPdfBlob() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("%PDF"),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  global.URL.createObjectURL = vi.fn(() => "blob:mock");
  global.URL.revokeObjectURL = vi.fn();
});

describe("PdfPreviewModal", () => {
  it("renders header with title and shows embed after fetch", async () => {
    mockExportReturnsPdfBlob();
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
      expect(embed?.getAttribute("src")).toBe("blob:mock");
    });
  });

  it("Cancel closes and revokes the blob URL", async () => {
    mockExportReturnsPdfBlob();
    const onClose = vi.fn();
    render(
      <PdfPreviewModal open story={STATE} request={REQUEST} onClose={onClose} />,
    );
    await screen.findByText(/For Maya · Soccer/);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  it("Esc closes the modal", async () => {
    mockExportReturnsPdfBlob();
    const onClose = vi.fn();
    render(
      <PdfPreviewModal open story={STATE} request={REQUEST} onClose={onClose} />,
    );
    await screen.findByText(/For Maya · Soccer/);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("Download saves the same blob without a second fetch", async () => {
    const fetchSpy = mockExportReturnsPdfBlob();
    render(
      <PdfPreviewModal open story={STATE} request={REQUEST} onClose={vi.fn()} />,
    );
    await screen.findByText(/For Maya · Soccer/);
    await userEvent.click(screen.getByRole("button", { name: /download/i }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("shows fallback when embed has zero height", async () => {
    mockExportReturnsPdfBlob();
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
