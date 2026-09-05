import { describe, expect, it } from "vitest";
import { mostFrequentColor } from "./logo-color";

describe("mostFrequentColor", () => {

  it("ignores transparent and near-white pixels", () => {
    const pixels = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 0,
      200, 50, 50, 255,
    ]);
    expect(mostFrequentColor(pixels)).toBe("#D03030");
  });

  it("returns null when no qualifying pixels exist", () => {
    const pixels = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 0,
    ]);
    expect(mostFrequentColor(pixels)).toBeNull();
  });
});
