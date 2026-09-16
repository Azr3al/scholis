import { describe, expect, it } from "vitest";

import {
  COMPOSER_TITLE_SCROLL_MIN_DELTA_PX,
  COMPOSER_TITLE_VIEWPORT_RATIO,
  computeScrollDeltaForViewportTarget,
  computeScrollDeltaToRestoreViewportAnchor,
} from "./main-content-scroll";

describe("computeScrollDeltaForViewportTarget", () => {
  const viewportHeight = 1000;
  const targetTop = viewportHeight * COMPOSER_TITLE_VIEWPORT_RATIO;

  it("returns null when already within tolerance of target", () => {
    expect(
      computeScrollDeltaForViewportTarget(
        targetTop + COMPOSER_TITLE_SCROLL_MIN_DELTA_PX - 1,
        viewportHeight,
      ),
    ).toBeNull();
  });

  it("returns positive delta when element is below target line", () => {
    expect(
      computeScrollDeltaForViewportTarget(targetTop + 120, viewportHeight),
    ).toBe(120);
  });

  it("returns negative delta when element is above target line", () => {
    expect(
      computeScrollDeltaForViewportTarget(targetTop - 80, viewportHeight),
    ).toBe(-80);
  });

  it("offsets the target line when the scrollport does not start at y=0", () => {
    expect(
      computeScrollDeltaForViewportTarget(500, 800, 0.4, 48, 100),
    ).toBe(80);
  });
});

describe("computeScrollDeltaToRestoreViewportAnchor", () => {
  it("returns positive delta when element moved up in the viewport", () => {
    expect(computeScrollDeltaToRestoreViewportAnchor(200, 50)).toBe(-150);
  });

  it("returns negative delta when element moved down in the viewport", () => {
    expect(computeScrollDeltaToRestoreViewportAnchor(200, 320)).toBe(120);
  });

  it("returns zero when anchor position is unchanged", () => {
    expect(computeScrollDeltaToRestoreViewportAnchor(200, 200)).toBe(0);
  });
});
