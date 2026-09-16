import { describe, expect, it } from "vitest";

import { formatCurrentUnitDisplay } from "./format-current-unit-display";

describe("formatCurrentUnitDisplay", () => {
  it("formats unit with updated date", () => {
    expect(formatCurrentUnitDisplay(8, "2026-08-03")).toBe("8 (3/8/2026)");
  });

  it("returns empty string when unit is null", () => {
    expect(formatCurrentUnitDisplay(null, "2026-08-03")).toBe("");
  });

  it("returns unit only when date is missing", () => {
    expect(formatCurrentUnitDisplay(8, null)).toBe("8");
  });
});
