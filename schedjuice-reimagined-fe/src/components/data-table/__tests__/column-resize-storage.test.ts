// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import {
  columnResizeStorageKey,
  mergeColumnSizingWithStored,
  readColumnResizeWidths,
  writeColumnResizeWidths,
} from "../column-resize-storage";

describe("readColumnResizeWidths / writeColumnResizeWidths", () => {

  it("returns empty object for missing or invalid JSON", () => {
    const key = "test-table-invalid";
    localStorage.setItem(columnResizeStorageKey(key), "not-json");
    expect(readColumnResizeWidths(key)).toEqual({});
    localStorage.removeItem(columnResizeStorageKey(key));
  });

  it("ignores non-numeric and non-positive values", () => {
    const key = "test-table-filter";
    localStorage.setItem(
      columnResizeStorageKey(key),
      JSON.stringify({
        valid: 120,
        zero: 0,
        negative: -10,
        text: "wide",
      }),
    );
    expect(readColumnResizeWidths(key)).toEqual({ valid: 120 });
    localStorage.removeItem(columnResizeStorageKey(key));
  });
});

describe("mergeColumnSizingWithStored", () => {
  it("drops stale column ids not in the current table", () => {
    expect(
      mergeColumnSizingWithStored(
        {},
        { parsed_amount: 144, removed_col: 200 },
        ["parsed_amount", "user__name"],
      ),
    ).toEqual({ parsed_amount: 144 });
  });

  it("preserves defaults and overlays stored widths", () => {
    expect(
      mergeColumnSizingWithStored(
        { user__name: 224 },
        { parsed_amount: 180 },
        ["parsed_amount", "user__name"],
      ),
    ).toEqual({ user__name: 224, parsed_amount: 180 });
  });
});
