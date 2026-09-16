import { describe, expect, it } from "vitest";
import { clampZoom, screenToDocument } from "./camera";

describe("camera", () => {
  it("clamps zoom to 25%–400%", () => {
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(8)).toBe(4);
    expect(clampZoom(1)).toBe(1);
  });

  it("screenToDocument inverts pan and zoom", () => {
    const camera = { x: 100, y: 50, zoom: 2 };
    expect(screenToDocument(camera, { x: 100, y: 50 })).toEqual({ x: 0, y: 0 });
    expect(screenToDocument(camera, { x: 120, y: 60 })).toEqual({ x: 10, y: 5 });
  });
});
