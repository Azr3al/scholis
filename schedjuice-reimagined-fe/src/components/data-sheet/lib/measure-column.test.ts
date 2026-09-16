import { describe, expect, it } from "vitest";

import { estimateColumnWidth } from "./measure-column";

describe("estimateColumnWidth", () => {

  it("never goes below min", () => {
    expect(
      estimateColumnWidth([""], "", { charWidth: 8, padding: 16, min: 60, max: 400 }),
    ).toBe(60);
  });

  it("never exceeds max", () => {
    const long = "x".repeat(200);
    expect(
      estimateColumnWidth([long], "h", { charWidth: 8, padding: 16, min: 40, max: 300 }),
    ).toBe(300);
  });

  it("includes the header text in the measurement", () => {
    expect(
      estimateColumnWidth(["a"], "longheader", {
        charWidth: 8,
        padding: 16,
        min: 40,
        max: 400,
      }),
    ).toBe("longheader".length * 8 + 16);
  });
});
