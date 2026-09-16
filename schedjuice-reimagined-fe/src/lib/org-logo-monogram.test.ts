import { describe, expect, it } from "vitest";
import { orgLogoMonogram } from "./org-logo-monogram";

describe("orgLogoMonogram", () => {
  it("returns ? for empty input", () => {
    expect(orgLogoMonogram(null)).toBe("?");
    expect(orgLogoMonogram("  ")).toBe("?");
  });

  it("returns two initials for multi-word names", () => {
    expect(orgLogoMonogram("Schedjuice Education")).toBe("SE");
  });

  it("returns first two chars for single token", () => {
    expect(orgLogoMonogram("Alpha")).toBe("AL");
  });
});
