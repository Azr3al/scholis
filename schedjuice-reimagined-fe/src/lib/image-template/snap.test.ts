import { describe, expect, it } from "vitest";
import {
  mergeSnapTargets,
  pageSnapTargets,
  siblingSnapTargets,
  snapMove,
  snapResize,
} from "./snap";

const page = { width: 200, height: 200 };

describe("pageSnapTargets", () => {
  it("returns empty arrays for a missing or zero page", () => {
    expect(pageSnapTargets({ width: 0, height: 0 })).toEqual({ xs: [], ys: [] });
    expect(pageSnapTargets({ width: 200, height: 0 })).toEqual({ xs: [], ys: [] });
  });

  it("exposes page edges and midlines", () => {
    expect(pageSnapTargets(page)).toEqual({
      xs: [0, 100, 200],
      ys: [0, 100, 200],
    });
  });
});

describe("siblingSnapTargets", () => {
  it("excludes the moving layer and exposes sibling edges and centers", () => {
    const targets = siblingSnapTargets(
      [
        { id: "a", x: 10, y: 20, width: 40, height: 30 },
        { id: "b", x: 80, y: 50, width: 20, height: 10 },
      ],
      "a",
    );
    expect(targets.xs).toEqual([80, 90, 100]);
    expect(targets.ys).toEqual([50, 55, 60]);
  });
});

describe("snapMove", () => {
  it("snaps a box center to the page vertical midline", () => {
    const result = snapMove(
      { x: 46, y: 10, width: 100, height: 40 },
      pageSnapTargets(page),
      8,
    );
    expect(result.rect.x).toBe(50);
    expect(result.rect.y).toBe(10);
    expect(result.guides.xs).toEqual([100]);
    expect(result.guides.ys).toEqual([]);
  });

  it("does not snap when every edge is outside the threshold", () => {
    const rect = { x: 80, y: 10, width: 100, height: 40 };
    const result = snapMove(rect, pageSnapTargets(page), 8);
    expect(result.rect).toEqual(rect);
    expect(result.guides).toEqual({ xs: [], ys: [] });
  });

  it("snaps a moving left edge to a sibling left", () => {
    const sibling = siblingSnapTargets(
      [{ id: "other", x: 100, y: 0, width: 40, height: 20 }],
      "self",
    );
    const result = snapMove({ x: 102, y: 8, width: 50, height: 20 }, sibling, 6);
    expect(result.rect.x).toBe(100);
    expect(result.guides.xs).toEqual([100]);
  });
});

describe("snapResize", () => {
  it("grows the east edge to the page right without moving x", () => {
    const result = snapResize(
      { x: 80, y: 10, width: 118, height: 40 },
      "e",
      pageSnapTargets(page),
      8,
    );
    expect(result.rect.x).toBe(80);
    expect(result.rect.width).toBe(120);
    expect(result.guides.xs).toEqual([200]);
  });

  it("does not snap X targets when dragging the north handle", () => {
    const result = snapResize(
      { x: 96, y: 10, width: 100, height: 40 },
      "n",
      pageSnapTargets(page),
      8,
    );
    expect(result.rect.x).toBe(96);
    expect(result.guides.xs).toEqual([]);
  });
});

describe("mergeSnapTargets", () => {
  it("concatenates page and sibling targets", () => {
    const merged = mergeSnapTargets(
      pageSnapTargets(page),
      siblingSnapTargets([{ id: "b", x: 10, y: 20, width: 10, height: 10 }], "a"),
    );
    expect(merged.xs).toContain(0);
    expect(merged.xs).toContain(10);
    expect(merged.ys).toContain(20);
  });
});
