import { describe, expect, it } from "vitest";
import { coverReplaceFill } from "./apply-page-preset";
import { applyPresetCoverFit, clampBackgroundFill, coverScale } from "./cover-fit";

describe("cover-fit", () => {
  it("coverScale is max of both axes", () => {
    expect(coverScale({ width: 1000, height: 500 }, { width: 1920, height: 1080 })).toBe(
      Math.max(1920 / 1000, 1080 / 500),
    );
  });

  it("hd_16_9 to a4_landscape still covers (no reset-to-1 empty corners)", () => {
    const image = { width: 1920, height: 1080 };
    const fromPage = { width: 1920, height: 1080 };
    const zoomed = { url: "x", offsetX: -200, offsetY: -50, scale: 1.4 };
    const clampedZoomed = clampBackgroundFill(zoomed, image, fromPage);
    const a4 = { width: 3508, height: 2480 };
    const next = applyPresetCoverFit(clampedZoomed, image, a4);
    expect(next.scale).toBeGreaterThanOrEqual(coverScale(image, a4));
    const again = clampBackgroundFill(next, image, a4);
    expect(again.offsetX).toBeLessThanOrEqual(0);
    expect(again.offsetY).toBeLessThanOrEqual(0);
    expect(image.width * again.scale + again.offsetX).toBeGreaterThanOrEqual(a4.width - 0.01);
    expect(image.height * again.scale + again.offsetY).toBeGreaterThanOrEqual(a4.height - 0.01);
  });

  it("coverReplaceFill uses true cover for id-card inch page + pixel image", () => {
    const image = { width: 638, height: 1011 };
    const pageIn = { width: 2.125, height: 3.375 };
    const minScale = coverScale(image, pageIn);
    const fill = coverReplaceFill("x", image, pageIn);
    expect(fill.scale).toBeCloseTo(minScale, 5);
    expect(image.width * fill.scale).toBeGreaterThanOrEqual(pageIn.width - 0.01);
    expect(image.height * fill.scale).toBeGreaterThanOrEqual(pageIn.height - 0.01);
  });
});
