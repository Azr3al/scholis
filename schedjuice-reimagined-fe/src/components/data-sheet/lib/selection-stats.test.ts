import { describe, expect, it } from "vitest";

import { computeSelectionStats } from "./selection-stats";

describe("computeSelectionStats", () => {
  it("counts non-empty values", () => {
    const stats = computeSelectionStats({ values: ["a", "", "b"], numbers: [] });
    expect(stats.count).toBe(2);
    expect(stats.sum).toBeNull();
  });

  it("computes numeric aggregates when numbers exist", () => {
    const stats = computeSelectionStats({
      values: ["1", "2", "3"],
      numbers: [1, 2, 3],
    });
    expect(stats.count).toBe(3);
    expect(stats.sum).toBe(6);
    expect(stats.avg).toBe(2);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(3);
  });

  it("ignores null numbers in aggregates", () => {
    const stats = computeSelectionStats({
      values: ["1", "x", "3"],
      numbers: [1, null, 3],
    });
    expect(stats.sum).toBe(4);
    expect(stats.avg).toBe(2);
  });
});
