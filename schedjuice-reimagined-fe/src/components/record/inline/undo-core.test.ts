import { describe, it, expect } from "vitest";
import { makeUndoEntry, isUndoVisible, UNDO_WINDOW_MS } from "./undo-core";

describe("undo-core", () => {
  it("is visible within the window", () => {
    const e = makeUndoEntry("name", "Old", 1000);
    expect(isUndoVisible(e, 1000 + UNDO_WINDOW_MS - 1)).toBe(true);
  });
  it("expires after the window", () => {
    const e = makeUndoEntry("name", "Old", 1000);
    expect(isUndoVisible(e, 1000 + UNDO_WINDOW_MS + 1)).toBe(false);
  });
  it("is not visible for null", () => {
    expect(isUndoVisible(null, 5000)).toBe(false);
  });
});
