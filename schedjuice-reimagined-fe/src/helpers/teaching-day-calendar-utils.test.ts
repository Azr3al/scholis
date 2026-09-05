import { describe, expect, it } from "vitest";
import {
  buildMonthMatrix,
  isDateWithinInclusive,
  isYmdWithinInclusive,
} from "@/helpers/teaching-day-calendar-utils";

describe("buildMonthMatrix", () => {
  it("returns weeks covering April 2026", () => {
    const matrix = buildMonthMatrix(2026, 3); // 0-based month
    expect(matrix.length).toBeGreaterThanOrEqual(4);
    const flat = matrix.flat().filter(Boolean) as Date[];
    expect(flat.some((d) => d.getDate() === 1 && d.getMonth() === 3)).toBe(true);
    expect(flat.some((d) => d.getDate() === 30 && d.getMonth() === 3)).toBe(true);
  });

  it("pads leading nulls before first of month", () => {
    const matrix = buildMonthMatrix(2026, 3);
    expect(matrix[0]![0]).toBeNull(); // Apr 1 2026 is Wednesday → Sun/Tue null
  });
});

describe("isDateWithinInclusive", () => {
  it("returns true inside range", () => {
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 11, 31);
    expect(isDateWithinInclusive(new Date(2026, 5, 15), from, to)).toBe(true);
  });

  it("returns false outside range", () => {
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 11, 31);
    expect(isDateWithinInclusive(new Date(2027, 0, 1), from, to)).toBe(false);
  });
});

describe("isYmdWithinInclusive", () => {
  it("returns true inside YMD range", () => {
    expect(isYmdWithinInclusive("2026-06-15", "2026-06-01", "2026-06-29")).toBe(
      true,
    );
  });

  it("returns true on boundary dates", () => {
    expect(isYmdWithinInclusive("2026-06-01", "2026-06-01", "2026-06-29")).toBe(
      true,
    );
    expect(isYmdWithinInclusive("2026-06-29", "2026-06-01", "2026-06-29")).toBe(
      true,
    );
  });

  it("returns false outside YMD range", () => {
    expect(isYmdWithinInclusive("2026-06-30", "2026-06-01", "2026-06-29")).toBe(
      false,
    );
    expect(isYmdWithinInclusive("2026-05-31", "2026-06-01", "2026-06-29")).toBe(
      false,
    );
  });

  it("returns false when any argument is empty", () => {
    expect(isYmdWithinInclusive("", "2026-06-01", "2026-06-29")).toBe(false);
  });
});
