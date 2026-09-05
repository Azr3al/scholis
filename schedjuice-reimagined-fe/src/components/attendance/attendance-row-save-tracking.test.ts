import { describe, expect, it } from "vitest";
import { filterIdsForRowSaveIndicator } from "./attendance-row-save-tracking";
import type { AttendanceDirtyEditKind } from "./attendance-autosave-debounce";

describe("filterIdsForRowSaveIndicator", () => {
  it("includes mixed status and note rows", () => {
    const kinds: Record<number, AttendanceDirtyEditKind> = {
      1: "status",
      2: "note",
    };
    expect(filterIdsForRowSaveIndicator([1, 2, 3], kinds)).toEqual([1, 2]);
  });

  it("drops ids with no dirty kind entry", () => {
    expect(filterIdsForRowSaveIndicator([9], {})).toEqual([]);
  });
});
