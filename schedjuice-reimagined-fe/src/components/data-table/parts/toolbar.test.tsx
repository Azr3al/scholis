import { describe, expect, it } from "vitest";

import { toolbarClassName } from "./toolbar";

describe("toolbarClassName", () => {
  it("returns sticky classes by default", () => {
    expect(toolbarClassName(true)).toContain("sticky");
    expect(toolbarClassName(true)).toContain("top-0");
    expect(toolbarClassName(true)).not.toContain("shrink-0");
  });

  it("returns pinned classes when sticky is false", () => {
    expect(toolbarClassName(false)).toContain("shrink-0");
    expect(toolbarClassName(false)).not.toContain("sticky");
    expect(toolbarClassName(false)).not.toContain("top-0");
  });

  it("uses standalone surface fill in default mode", () => {
    expect(toolbarClassName({ sticky: true, unified: false })).toContain(
      "bg-surface",
    );
  });

  it("drops standalone surface fill in unified mode when not sticky", () => {
    const className = toolbarClassName({ sticky: false, unified: true });
    expect(className).not.toContain("bg-surface");
    expect(className).toContain("px-3");
  });

  it("keeps surface fill in unified sticky mode for scroll occlusion", () => {
    const className = toolbarClassName({ sticky: true, unified: true });
    expect(className).toContain("bg-surface");
    expect(className).toContain("px-3");
  });
});
