import { describe, expect, it } from "vitest";

import { mergeColumnLayout } from "./use-column-layout";

describe("mergeColumnLayout", () => {
  it("defaults hidden to empty when missing (old shape migration)", () => {
    const merged = mergeColumnLayout(["a", "b"], {
      order: ["a", "b"],
      widths: { a: 100, b: 100 },
    } as never);
    expect(merged.hidden).toEqual([]);
  });

  it("keeps only hidden fields that still exist", () => {
    const merged = mergeColumnLayout(["a", "b"], {
      order: ["a", "b"],
      widths: { a: 100, b: 100 },
      hidden: ["b", "gone"],
    });
    expect(merged.hidden).toEqual(["b"]);
  });

  it("appends new fields to order and gives them default widths", () => {
    const merged = mergeColumnLayout(["a", "b", "c"], {
      order: ["a", "b"],
      widths: { a: 100, b: 100 },
      hidden: [],
    });
    expect(merged.order).toEqual(["a", "b", "c"]);
    expect(merged.widths.c).toBeGreaterThan(0);
  });
});
