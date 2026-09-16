import { describe, expect, it } from "vitest";
import { canvasCursor, cursorForHit, hitTest } from "./hit-test";
import type { Layer } from "./types";

const page = { width: 400, height: 300 };
const camera = { x: 0, y: 0, zoom: 1 };
const low: Layer = {
  id: "a",
  type: "text",
  text: "a",
  x: 0,
  y: 0,
  width: 100,
  height: 40,
  z: 0,
};
const high: Layer = { ...low, id: "b", z: 1, text: "b" };

describe("hitTest", () => {
  it("topmost layer wins", () => {
    expect(hitTest({ layers: [low, high], page, camera, point: { x: 10, y: 10 } })).toEqual({
      kind: "layer",
      layerId: "b",
    });
  });

  it("empty page pixel selects page", () => {
    expect(hitTest({ layers: [low], page, camera, point: { x: 200, y: 200 } })).toEqual({
      kind: "page",
    });
  });

  it("handle beats move on the selected layer", () => {
    const hit = hitTest({
      layers: [low],
      page,
      camera,
      point: { x: 100, y: 40 },
      selectedId: "a",
    });
    expect(hit.kind).toBe("handle");
    if (hit.kind === "handle") expect(hit.layerId).toBe("a");
  });

  it("does not hit north on a selected text layer", () => {
    const hit = hitTest({
      layers: [low],
      page,
      camera,
      point: { x: 50, y: 0 },
      selectedId: "a",
    });
    expect(hit).toEqual({ kind: "layer", layerId: "a" });
  });

  it("hits east on a selected text layer", () => {
    const hit = hitTest({
      layers: [low],
      page,
      camera,
      point: { x: 100, y: 20 },
      selectedId: "a",
    });
    expect(hit).toEqual({ kind: "handle", layerId: "a", handle: "e" });
  });

  it("hits north on a selected photo", () => {
    const photo: Layer = {
      id: "p1",
      type: "photo",
      photoKind: "award_image",
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      z: 0,
    };
    const hit = hitTest({
      layers: [photo],
      page,
      camera,
      point: { x: 50, y: 0 },
      selectedId: "p1",
    });
    expect(hit).toEqual({ kind: "handle", layerId: "p1", handle: "n" });
  });
});

describe("canvasCursor", () => {
  it("maps handle and hit kinds", () => {
    expect(cursorForHit({ kind: "handle", layerId: "a", handle: "se" })).toBe("nwse-resize");
    expect(cursorForHit({ kind: "handle", layerId: "a", handle: "nw" })).toBe("nwse-resize");
    expect(cursorForHit({ kind: "handle", layerId: "a", handle: "ne" })).toBe("nesw-resize");
    expect(cursorForHit({ kind: "handle", layerId: "a", handle: "sw" })).toBe("nesw-resize");
    expect(cursorForHit({ kind: "handle", layerId: "a", handle: "e" })).toBe("ew-resize");
    expect(cursorForHit({ kind: "handle", layerId: "a", handle: "w" })).toBe("ew-resize");
    expect(cursorForHit({ kind: "handle", layerId: "a", handle: "n" })).toBe("ns-resize");
    expect(cursorForHit({ kind: "handle", layerId: "a", handle: "s" })).toBe("ns-resize");
    expect(cursorForHit({ kind: "layer", layerId: "a" })).toBe("move");
    expect(cursorForHit({ kind: "page" })).toBe("default");
    expect(cursorForHit({ kind: "none" })).toBe("default");
  });

  it("keeps the resize cursor after the pointer leaves the knob", () => {
    expect(
      canvasCursor({
        hit: { kind: "none" },
        spaceKey: false,
        mode: "resize",
        handle: "se",
      }),
    ).toBe("nwse-resize");
  });

  it("uses grab while Space is held and grabbing while panning", () => {
    expect(
      canvasCursor({ hit: { kind: "page" }, spaceKey: true, mode: "idle" }),
    ).toBe("grab");
    expect(
      canvasCursor({ hit: { kind: "page" }, spaceKey: true, mode: "pan" }),
    ).toBe("grabbing");
  });

  it("uses move while dragging a layer", () => {
    expect(
      canvasCursor({
        hit: { kind: "page" },
        spaceKey: false,
        mode: "move",
      }),
    ).toBe("move");
  });
});
