import { describe, expect, it } from "vitest";

import { formatCourseSheetDate } from "./format-course-sheet-date";

describe("formatCourseSheetDate", () => {
  it("formats ISO dates as d/M/yyyy", () => {
    expect(formatCourseSheetDate("2026-08-27")).toBe("27/8/2026");
    expect(formatCourseSheetDate("2026-06-05")).toBe("5/6/2026");
  });

  it("returns empty string for null or invalid input", () => {
    expect(formatCourseSheetDate(null)).toBe("");
    expect(formatCourseSheetDate(undefined)).toBe("");
    expect(formatCourseSheetDate("not-a-date")).toBe("");
  });
});
