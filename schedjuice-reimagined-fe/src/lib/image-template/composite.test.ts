import { describe, expect, it } from "vitest";
import { backgroundDestRect, pagePixelSize } from "./composite";
import { emptyAwardDocument } from "./award-document";

describe("pagePixelSize", () => {
  it("is page width x height, not the source image", () => {
    const doc = {
      ...emptyAwardDocument(),
      width: 800,
      height: 600,
      background: {
        url: "https://example.com/4000x3000.png",
        offsetX: -100,
        offsetY: -50,
        scale: 0.5,
      },
    };
    expect(pagePixelSize(doc)).toEqual({ width: 800, height: 600 });
  });
});

describe("backgroundDestRect", () => {
  it("places the image using offset and scale (crop lives outside the page)", () => {
    const rect = backgroundDestRect(
      { url: "u", offsetX: -100, offsetY: -40, scale: 2 },
      { width: 500, height: 300 },
      { width: 800, height: 600 },
    );
    expect(rect).toEqual({ x: -100, y: -40, width: 1000, height: 600 });
  });
});
