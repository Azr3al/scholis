import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "./contrast";

describe("relativeLuminance", () => {
  it("is 0 for black and ~1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });
});

describe("contrastRatio", () => {
  it("is 21:1 for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });
  it("is symmetric and 1:1 for identical colors", () => {
    expect(contrastRatio("#102C24", "#102C24")).toBeCloseTo(1, 5);
    expect(contrastRatio("#FAF7F2", "#102C24")).toBeCloseTo(
      contrastRatio("#102C24", "#FAF7F2"),
      5,
    );
  });
});
