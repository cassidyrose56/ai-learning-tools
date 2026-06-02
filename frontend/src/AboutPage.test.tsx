import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom";
import AboutPage from "./AboutPage";

describe("AboutPage", () => {
  it("renders without crashing and shows the first heading", () => {
    render(<AboutPage />);
    expect(screen.getByText(/I'm Cassidy/)).toBeInTheDocument();
  });

  it("renders all four section headings as level-2 headings", () => {
    render(<AboutPage />);
    expect(
      screen.getByRole("heading", { level: 2, name: /I'm Cassidy/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Why I made this" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "How the stories are generated and vetted",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Get in touch" }),
    ).toBeInTheDocument();
  });

  it("renders a mailto link to cassidyrose56@gmail.com", () => {
    render(<AboutPage />);
    const mail = screen.getByRole("link", {
      name: /cassidyrose56@gmail\.com/i,
    });
    expect(mail).toBeInTheDocument();
    expect(mail).toHaveAttribute("href", "mailto:cassidyrose56@gmail.com");
  });

  it("renders a GitHub source-code link", () => {
    render(<AboutPage />);
    const gh = screen.getByRole("link", {
      name: /github\.com\/cassidyrose56\/ai-learning-tools/i,
    });
    expect(gh).toBeInTheDocument();
    expect(gh).toHaveAttribute(
      "href",
      "https://github.com/cassidyrose56/ai-learning-tools",
    );
  });

  it("renders a Learning Commons link", () => {
    render(<AboutPage />);
    const lc = screen.getByRole("link", { name: /Learning Commons/i });
    expect(lc).toBeInTheDocument();
    expect(lc).toHaveAttribute(
      "href",
      "https://learningcommons.org/for-developers/",
    );
  });

  it("gives external links rel and target attributes", () => {
    render(<AboutPage />);
    const gh = screen.getByRole("link", {
      name: /github\.com\/cassidyrose56\/ai-learning-tools/i,
    });
    const lc = screen.getByRole("link", { name: /Learning Commons/i });

    expect(gh).toHaveAttribute("target", "_blank");
    expect(gh).toHaveAttribute("rel", "noopener noreferrer");
    expect(lc).toHaveAttribute("target", "_blank");
    expect(lc).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("uses distinct hrefs for the GitHub and Learning Commons links", () => {
    render(<AboutPage />);
    const gh = screen.getByRole("link", {
      name: /github\.com\/cassidyrose56\/ai-learning-tools/i,
    });
    const lc = screen.getByRole("link", { name: /Learning Commons/i });
    expect(gh.getAttribute("href")).not.toBe(lc.getAttribute("href"));
  });
});
