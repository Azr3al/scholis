import { describe, expect, it } from "vitest";
import {
  bringForward,
  bringToFront,
  isDeleteLayerKey,
  isEditorTypingTarget,
  raiseLayer,
  removeLayer,
  sendBackward,
  sendToBack,
} from "./layer-stack";
import type { Layer } from "./types";

const a: Layer = {
  id: "a",
  type: "text",
  text: "A",
  x: 0,
  y: 0,
  width: 40,
  height: 20,
  z: 0,
};
const b: Layer = { ...a, id: "b", text: "B", z: 1 };

describe("removeLayer", () => {
  it("drops the selected layer and leaves others", () => {
    expect(removeLayer([a, b], "a")).toEqual([b]);
  });

  it("returns the same array when the id is missing", () => {
    const layers = [a, b];
    expect(removeLayer(layers, "missing")).toBe(layers);
  });
});

describe("raiseLayer", () => {
  it("moves the selected layer above overlapping siblings", () => {
    const next = raiseLayer([a, b], "a");
    expect(next.find((layer) => layer.id === "a")?.z).toBe(2);
    expect(next.find((layer) => layer.id === "b")?.z).toBe(1);
    expect(next.at(-1)?.id).toBe("a");
  });

  it("does not dirty a layer that is already alone on top", () => {
    const layers = [a, b];
    expect(raiseLayer(layers, "b")).toBe(layers);
  });
});

describe("step layering", () => {
  const c: Layer = { ...a, id: "c", text: "C", z: 2 };

  it("bringForward swaps with the neighbor above", () => {
    const next = bringForward([a, b, c], "a");
    expect(next.map((layer) => layer.id)).toEqual(["b", "a", "c"]);
    expect(next.find((layer) => layer.id === "a")?.z).toBeGreaterThan(
      next.find((layer) => layer.id === "b")?.z ?? -1,
    );
  });

  it("sendBackward swaps with the neighbor below", () => {
    const next = sendBackward([a, b, c], "c");
    expect(next.map((layer) => layer.id)).toEqual(["a", "c", "b"]);
  });

  it("sendToBack puts the layer under every sibling", () => {
    const next = sendToBack([a, b, c], "c");
    expect(next[0]?.id).toBe("c");
    expect(next.find((layer) => layer.id === "c")?.z).toBeLessThan(
      next.find((layer) => layer.id === "a")?.z ?? 0,
    );
  });

  it("bringToFront matches raiseLayer", () => {
    expect(bringToFront([a, b], "a")).toEqual(raiseLayer([a, b], "a"));
  });

  it("is a no-op at the stack edge", () => {
    const layers = [a, b, c];
    expect(bringForward(layers, "c")).toBe(layers);
    expect(sendBackward(layers, "a")).toBe(layers);
  });
});

describe("delete hotkeys", () => {
  it("treats Backspace and Delete as layer delete keys", () => {
    expect(isDeleteLayerKey({ key: "Backspace" })).toBe(true);
    expect(isDeleteLayerKey({ key: "Delete" })).toBe(true);
    expect(isDeleteLayerKey({ key: "Escape" })).toBe(false);
  });

  it("does not steal keys from a textarea", () => {
    expect(isEditorTypingTarget({ target: { tagName: "TEXTAREA" } as HTMLElement })).toBe(true);
    expect(isEditorTypingTarget({ target: { tagName: "DIV" } as HTMLElement })).toBe(false);
  });
});
