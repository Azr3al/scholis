import { describe, expect, it } from "vitest";
import { reducePointer } from "./pointer-session";

const fill = { url: "u", offsetX: -10, offsetY: -4, scale: 1.2 };

describe("reducePointer", () => {
  it("camera pan does not mutate background fill", () => {
    const start = reducePointer(
      { mode: "idle", camera: { x: 0, y: 0, zoom: 1 }, fill, layers: [], selectedId: null },
      { type: "down", point: { x: 10, y: 10 }, spaceKey: true },
    );
    const moved = reducePointer(start, {
      type: "move",
      point: { x: 40, y: 30 },
      spaceKey: true,
    });
    expect(moved.fill).toEqual(fill);
    expect(moved.camera).not.toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("dragging the selected page repositions the background", () => {
    const start = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 1 },
        fill,
        layers: [],
        selectedId: "page",
      },
      { type: "down", point: { x: 10, y: 10 }, spaceKey: false, hit: { kind: "page" } },
    );
    const moved = reducePointer(start, {
      type: "move",
      point: { x: 26, y: 10 },
      spaceKey: false,
    });
    expect(moved.mode).toBe("adjust");
    expect(moved.fill.offsetX).not.toBe(fill.offsetX);
    expect(moved.fill.offsetY).toBe(fill.offsetY);
  });

  it("layer drag moves the layer and does not mutate fill", () => {
    const layer = {
      id: "t1",
      type: "text" as const,
      text: "Hi",
      x: 10,
      y: 20,
      width: 100,
      height: 40,
      z: 0,
    };
    const start = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 1 },
        fill,
        layers: [layer],
        selectedId: null,
      },
      {
        type: "down",
        point: { x: 20, y: 30 },
        spaceKey: false,
        hit: { kind: "layer", layerId: "t1" },
      },
    );
    const moved = reducePointer(start, {
      type: "move",
      point: { x: 36, y: 30 },
      spaceKey: false,
    });
    expect(moved.fill).toEqual(fill);
    expect(moved.layers[0]?.x).toBe(26);
    expect(moved.layers[0]?.y).toBe(20);
  });

  it("layer drag still moves the layer when the page is selected", () => {
    const layer = {
      id: "t1",
      type: "text" as const,
      text: "Hi",
      x: 10,
      y: 20,
      width: 100,
      height: 40,
      z: 0,
    };
    const start = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 1 },
        fill,
        layers: [layer],
        selectedId: "page",
      },
      {
        type: "down",
        point: { x: 20, y: 30 },
        spaceKey: false,
        hit: { kind: "layer", layerId: "t1" },
      },
    );
    const moved = reducePointer(start, {
      type: "move",
      point: { x: 36, y: 30 },
      spaceKey: false,
    });
    expect(moved.mode).toBe("move");
    expect(moved.fill).toEqual(fill);
    expect(moved.layers[0]?.x).toBe(26);
  });

  it("selecting a buried layer raises it above siblings", () => {
    const low = {
      id: "t1",
      type: "text" as const,
      text: "Hi",
      x: 10,
      y: 20,
      width: 100,
      height: 40,
      z: 0,
    };
    const high = { ...low, id: "p1", type: "photo" as const, photoKind: "award_image" as const, z: 1 };
    const next = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 1 },
        fill,
        layers: [low, high],
        selectedId: null,
      },
      {
        type: "down",
        point: { x: 20, y: 30 },
        spaceKey: false,
        hit: { kind: "layer", layerId: "t1" },
      },
    );
    expect(next.layers.at(-1)?.id).toBe("t1");
    expect(next.layers.find((layer) => layer.id === "t1")?.z).toBeGreaterThan(1);
  });

  it("east resize wraps text and grows height without scaling font", () => {
    const layer = {
      id: "t1",
      type: "text" as const,
      text: "aa bb cc",
      x: 10,
      y: 20,
      width: 100,
      height: 12,
      z: 0,
      fontSize: 10,
    };
    const start = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 1 },
        fill,
        layers: [layer],
        selectedId: "t1",
      },
      {
        type: "down",
        point: { x: 110, y: 26 },
        spaceKey: false,
        hit: { kind: "handle", layerId: "t1", handle: "e" },
      },
    );
    const moved = reducePointer(start, {
      type: "move",
      point: { x: 12, y: 26 },
      spaceKey: false,
    });
    const next = moved.layers[0];
    expect(next?.type).toBe("text");
    if (!next || next.type !== "text") return;
    expect(next.fontSize).toBe(10);
    expect(next.y).toBe(20);
    expect(next.width).toBeLessThan(20);
    expect(next.height).toBeGreaterThan(12);
  });

  it("corner resize keeps the handle on the scale ray toward the pointer", () => {
    const layer = {
      id: "t1",
      type: "text" as const,
      text: "Hi",
      x: 10,
      y: 20,
      width: 100,
      height: 40,
      z: 0,
      fontSize: 24,
    };
    const start = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 1 },
        fill,
        layers: [layer],
        selectedId: "t1",
      },
      {
        type: "down",
        point: { x: 110, y: 60 },
        spaceKey: false,
        hit: { kind: "handle", layerId: "t1", handle: "se" },
      },
    );
    const moved = reducePointer(start, {
      type: "move",
      point: { x: 210, y: 80 },
      spaceKey: false,
    });
    const next = moved.layers[0];
    expect(next).toBeTruthy();
    if (!next || next.type !== "text") return;
    expect(next.fontSize).toBeGreaterThan(24);
    expect(next.height).toBeCloseTo(next.fontSize * 1.2);
    expect(next.x).toBe(10);
    expect(next.y).toBe(20);
  });

  it("corner resize from the gesture origin does not drift across moves", () => {
    const layer = {
      id: "t1",
      type: "text" as const,
      text: "Hi",
      x: 10,
      y: 20,
      width: 100,
      height: 40,
      z: 0,
      fontSize: 24,
    };
    const start = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 1 },
        fill,
        layers: [layer],
        selectedId: "t1",
      },
      {
        type: "down",
        point: { x: 110, y: 60 },
        spaceKey: false,
        hit: { kind: "handle", layerId: "t1", handle: "se" },
      },
    );
    const mid = reducePointer(start, {
      type: "move",
      point: { x: 160, y: 70 },
      spaceKey: false,
    });
    const stepped = reducePointer(
      { ...mid, layers: mid.layers },
      {
        type: "move",
        point: { x: 210, y: 80 },
        spaceKey: false,
      },
    );
    const direct = reducePointer(start, {
      type: "move",
      point: { x: 210, y: 80 },
      spaceKey: false,
    });
    expect(stepped.layers[0]?.width).toBeCloseTo(direct.layers[0]?.width ?? 0);
    expect(stepped.layers[0]?.height).toBeCloseTo(direct.layers[0]?.height ?? 0);
  });

  it("snaps a dragged layer center to the page midline", () => {
    const layer = {
      id: "t1",
      type: "text" as const,
      text: "Hi",
      x: 10,
      y: 20,
      width: 100,
      height: 40,
      z: 0,
    };
    const start = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 1 },
        fill,
        layers: [layer],
        selectedId: null,
        page: { width: 200, height: 200 },
      },
      {
        type: "down",
        point: { x: 20, y: 30 },
        spaceKey: false,
        hit: { kind: "layer", layerId: "t1" },
      },
    );
    const moved = reducePointer(start, {
      type: "move",
      point: { x: 56, y: 30 },
      spaceKey: false,
    });
    expect(moved.layers[0]?.x).toBe(50);
    expect(moved.guides?.xs).toContain(100);
  });

  it("uses a screen-constant snap threshold at zoom 2", () => {
    const layer = {
      id: "t1",
      type: "text" as const,
      text: "Hi",
      x: 10,
      y: 20,
      width: 100,
      height: 40,
      z: 0,
    };
    const start = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 2 },
        fill,
        layers: [layer],
        selectedId: null,
        page: { width: 200, height: 200 },
      },
      {
        type: "down",
        point: { x: 20, y: 30 },
        spaceKey: false,
        hit: { kind: "layer", layerId: "t1" },
      },
    );
    const near = reducePointer(start, {
      type: "move",
      point: { x: 95, y: 30 },
      spaceKey: false,
    });
    expect(near.layers[0]?.x).toBe(50);
    const far = reducePointer(start, {
      type: "move",
      point: { x: 120, y: 30 },
      spaceKey: false,
    });
    expect(far.layers[0]?.x).toBe(60);
    expect(far.guides?.xs ?? []).toEqual([]);
  });

  it("snaps a dragged layer to a sibling left edge", () => {
    const moving = {
      id: "a",
      type: "text" as const,
      text: "A",
      x: 10,
      y: 20,
      width: 40,
      height: 20,
      z: 0,
    };
    const other = {
      id: "b",
      type: "text" as const,
      text: "B",
      x: 100,
      y: 80,
      width: 40,
      height: 20,
      z: 1,
    };
    const start = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 1 },
        fill,
        layers: [moving, other],
        selectedId: null,
      },
      {
        type: "down",
        point: { x: 20, y: 30 },
        spaceKey: false,
        hit: { kind: "layer", layerId: "a" },
      },
    );
    const moved = reducePointer(start, {
      type: "move",
      point: { x: 112, y: 30 },
      spaceKey: false,
    });
    expect(moved.layers.find((layer) => layer.id === "a")?.x).toBe(100);
    expect(moved.guides?.xs).toEqual([100]);
  });

  it("keeps field fontSize after an east resize", () => {
    const layer = {
      id: "f1",
      type: "field" as const,
      field: "student_name" as const,
      x: 10,
      y: 20,
      width: 200,
      height: 40,
      z: 0,
      fontSize: 24,
    };
    const start = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 1 },
        fill,
        layers: [layer],
        selectedId: "f1",
      },
      {
        type: "down",
        point: { x: 210, y: 40 },
        spaceKey: false,
        hit: { kind: "handle", layerId: "f1", handle: "e" },
      },
    );
    const moved = reducePointer(start, {
      type: "move",
      point: { x: 160, y: 40 },
      spaceKey: false,
    });
    const next = moved.layers[0];
    expect(next && "fontSize" in next ? next.fontSize : null).toBe(24);
  });

  it("snaps an east resize to the page right edge", () => {
    const layer = {
      id: "t1",
      type: "text" as const,
      text: "Hi",
      x: 10,
      y: 20,
      width: 100,
      height: 40,
      z: 0,
    };
    const start = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 1 },
        fill,
        layers: [layer],
        selectedId: "t1",
        page: { width: 200, height: 200 },
      },
      {
        type: "down",
        point: { x: 110, y: 40 },
        spaceKey: false,
        hit: { kind: "handle", layerId: "t1", handle: "e" },
      },
    );
    const moved = reducePointer(start, {
      type: "move",
      point: { x: 198, y: 40 },
      spaceKey: false,
    });
    expect(moved.layers[0]?.x).toBe(10);
    expect(moved.layers[0]?.width).toBe(190);
    expect(moved.guides?.xs).toEqual([200]);
  });

  it("does not snap X when resizing from the north handle", () => {
    const layer = {
      id: "p1",
      type: "photo" as const,
      photoKind: "award_image" as const,
      x: 96,
      y: 40,
      width: 100,
      height: 40,
      z: 0,
    };
    const start = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 1 },
        fill,
        layers: [layer],
        selectedId: "p1",
        page: { width: 200, height: 200 },
      },
      {
        type: "down",
        point: { x: 146, y: 40 },
        spaceKey: false,
        hit: { kind: "handle", layerId: "p1", handle: "n" },
      },
    );
    const moved = reducePointer(start, {
      type: "move",
      point: { x: 146, y: 30 },
      spaceKey: false,
    });
    expect(moved.layers[0]?.x).toBe(96);
    expect(moved.guides?.xs ?? []).toEqual([]);
  });

  it("clears snap guides on pointer up", () => {
    const layer = {
      id: "t1",
      type: "text" as const,
      text: "Hi",
      x: 10,
      y: 20,
      width: 100,
      height: 40,
      z: 0,
    };
    const start = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 1 },
        fill,
        layers: [layer],
        selectedId: null,
        page: { width: 200, height: 200 },
      },
      {
        type: "down",
        point: { x: 20, y: 30 },
        spaceKey: false,
        hit: { kind: "layer", layerId: "t1" },
      },
    );
    const moved = reducePointer(start, {
      type: "move",
      point: { x: 56, y: 30 },
      spaceKey: false,
    });
    expect(moved.guides?.xs?.length).toBeGreaterThan(0);
    const up = reducePointer(moved, {
      type: "up",
      point: { x: 56, y: 30 },
      spaceKey: false,
    });
    expect(up.guides).toBeUndefined();
  });

  it("does not snap while panning or adjusting the background", () => {
    const layer = {
      id: "t1",
      type: "text" as const,
      text: "Hi",
      x: 46,
      y: 20,
      width: 100,
      height: 40,
      z: 0,
    };
    const panned = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 1 },
        fill,
        layers: [layer],
        selectedId: null,
        page: { width: 200, height: 200 },
      },
      { type: "down", point: { x: 10, y: 10 }, spaceKey: true },
    );
    const panMoved = reducePointer(panned, {
      type: "move",
      point: { x: 40, y: 10 },
      spaceKey: true,
    });
    expect(panMoved.layers[0]?.x).toBe(46);
    expect(panMoved.guides).toBeUndefined();

    const adjustStart = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 1 },
        fill,
        layers: [layer],
        selectedId: "page",
        page: { width: 200, height: 200 },
      },
      { type: "down", point: { x: 10, y: 10 }, spaceKey: false, hit: { kind: "page" } },
    );
    const adjusted = reducePointer(adjustStart, {
      type: "move",
      point: { x: 26, y: 10 },
      spaceKey: false,
    });
    expect(adjusted.layers[0]?.x).toBe(46);
    expect(adjusted.fill.offsetX).not.toBe(fill.offsetX);
    expect(adjusted.guides).toBeUndefined();
  });

  it("clicking the page selects the page and starts a background adjust", () => {
    const next = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 1 },
        fill,
        layers: [
          {
            id: "t1",
            type: "text",
            text: "Hi",
            x: 10,
            y: 20,
            width: 100,
            height: 40,
            z: 0,
          },
        ],
        selectedId: "t1",
      },
      {
        type: "down",
        point: { x: 5, y: 5 },
        spaceKey: false,
        hit: { kind: "page" },
      },
    );
    expect(next.selectedId).toBe("page");
    expect(next.mode).toBe("adjust");
  });
});
