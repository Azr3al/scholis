import { describe, expect, it } from "vitest";

import { copyVisibleColumnValues } from "./copy-visible-column-values";

describe("copyVisibleColumnValues", () => {
  it("joins with newlines and keeps blanks", () => {
    expect(copyVisibleColumnValues(["a", "", "c"])).toBe("a\n\nc");
  });

  it("returns empty string for empty input", () => {
    expect(copyVisibleColumnValues([])).toBe("");
  });

  it("dedupes by key preserving first-seen order", () => {
    expect(
      copyVisibleColumnValues(["Ann", "Bob", "Ann2"], {
        dedupeKeys: [1, 2, 1],
      }),
    ).toBe("Ann\nBob");
  });

  it("uses row index fallback when dedupe key is null", () => {
    expect(
      copyVisibleColumnValues(["a", "b"], {
        dedupeKeys: [null, null],
      }),
    ).toBe("a\nb");
  });
});
