import { describe, expect, it } from "vitest";
import { shouldCompactToolbar } from "./toolbar-compact";

describe("shouldCompactToolbar", () => {
  it("compacts when content exceeds container", () => {
    expect(shouldCompactToolbar(400, 401)).toBe(true);
  });

  it("stays expanded when equal", () => {
    expect(shouldCompactToolbar(400, 400)).toBe(false);
  });

  it("stays expanded for non-positive widths (pre-measure)", () => {
    expect(shouldCompactToolbar(0, 100)).toBe(false);
    expect(shouldCompactToolbar(100, 0)).toBe(false);
  });
});
