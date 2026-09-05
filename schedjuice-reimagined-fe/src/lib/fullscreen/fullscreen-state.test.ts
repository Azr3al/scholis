import { describe, expect, it } from "vitest";

import {
  deriveEffectiveFullscreen,
  shouldClearRequestedFullscreen,
} from "./fullscreen-state";

describe("fullscreen-state", () => {
  it("uses requested fullscreen only when the page allows fullscreen", () => {
    expect(
      deriveEffectiveFullscreen({
        requestedFullscreen: true,
        isFullscreenAvailable: true,
      }),
    ).toBe(true);

    expect(
      deriveEffectiveFullscreen({
        requestedFullscreen: true,
        isFullscreenAvailable: false,
      }),
    ).toBe(false);
  });

  it("never enables fullscreen when the URL requested state is false", () => {
    expect(
      deriveEffectiveFullscreen({
        requestedFullscreen: false,
        isFullscreenAvailable: true,
      }),
    ).toBe(false);
  });

  it("clears stale requested fullscreen when a page does not allow it", () => {
    expect(
      shouldClearRequestedFullscreen({
        requestedFullscreen: true,
        isFullscreenAvailable: false,
      }),
    ).toBe(true);

    expect(
      shouldClearRequestedFullscreen({
        requestedFullscreen: true,
        isFullscreenAvailable: true,
      }),
    ).toBe(false);
  });
});
