import { describe, expect, it } from "vitest";
import {
  formatExpiresOn,
  inchesToPx,
  pointsToPx,
  pxToInches,
  templatePixelSize,
} from "@/lib/id-card/template-geometry";
import { DEFAULT_ID_CARD_HEIGHT_IN, DEFAULT_ID_CARD_WIDTH_IN } from "@/types/id-card-template";

describe("template-geometry", () => {
  it("converts inches to pixels at 300 DPI", () => {
    expect(inchesToPx(2.125)).toBe(637.5);
    expect(pxToInches(637.5)).toBe(2.125);
  });

  it("computes template pixel size from inches", () => {
    expect(templatePixelSize(DEFAULT_ID_CARD_WIDTH_IN, DEFAULT_ID_CARD_HEIGHT_IN)).toEqual({
      width: 638,
      height: 1013,
    });
  });

  it("converts typographic points to pixels at 300 DPI", () => {
    expect(pointsToPx(12)).toBe(50);
  });

  it("formats expiry dates for card display", () => {
    expect(formatExpiresOn("2026-01-31")).toBe("31.1.2026");
    expect(formatExpiresOn(null)).toBeNull();
  });
});
