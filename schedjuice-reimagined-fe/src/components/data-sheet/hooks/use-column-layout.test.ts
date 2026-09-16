import { describe, expect, it } from "vitest";

import { mergeColumnLayout } from "./use-column-layout";

describe("mergeColumnLayout", () => {
  it("inserts new fields at their canonical index instead of appending", () => {
    const merged = mergeColumnLayout(
      ["b0_total", "divide_0", "b1_title", "grand_total"],
      { b0_total: 56, b1_title: 200, grand_total: 72 },
      {
        order: ["b0_total", "b1_title", "grand_total"],
        widths: { b0_total: 56, b1_title: 200, grand_total: 72 },
        hidden: [],
        sort: null,
      },
    );

    expect(merged.order).toEqual([
      "b0_total",
      "divide_0",
      "b1_title",
      "grand_total",
    ]);
  });
});
