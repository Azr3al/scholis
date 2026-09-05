import { describe, expect, it } from "vitest";

import { extractMarkdownHeadings } from "./extract-headings";

describe("extractMarkdownHeadings", () => {
  it("extracts h1, h2, and h3", () => {
    const md = "# Overview\n\n## Intro\n\n### Step one\n\n## Intro";
    expect(extractMarkdownHeadings(md)).toEqual([
      { id: "overview", text: "Overview", level: 1 },
      { id: "intro", text: "Intro", level: 2 },
      { id: "step-one", text: "Step one", level: 3 },
      { id: "intro-2", text: "Intro", level: 2 },
    ]);
  });

  it("extracts duplicate h1 headings with suffix ids", () => {
    const md = "# Setup\n\n# Setup";
    expect(extractMarkdownHeadings(md)).toEqual([
      { id: "setup", text: "Setup", level: 1 },
      { id: "setup-2", text: "Setup", level: 1 },
    ]);
  });

  it("returns empty for no headings", () => {
    expect(extractMarkdownHeadings("plain text")).toEqual([]);
  });
});
