import { describe, expect, it } from "vitest";

import type { CourseDataSheetRow } from "@/types/data-sheets";

import {
  computeCourseDataCategoryStats,
  getCourseBlockHighlight,
  isCourseDateInMonth,
} from "./course-data-month-highlight";

function course(
  p: Partial<CourseDataSheetRow> = {},
): CourseDataSheetRow {
  return {
    course_id: 1,
    category_name: "FCE",
    category_sort_order: 1,
    title: "X",
    start_date: null,
    end_date: null,
    course_type: "WD",
    student_count: 10,
    assistant_teacher_count: 1,
    start_time: null,
    end_time: null,
    main_teachers: null,
    assistant_teachers: null,
    current_unit: null,
    current_unit_updated_at: null,
    ...p,
  };
}

describe("isCourseDateInMonth", () => {
  const august2026 = new Date(2026, 7, 15);

  it("matches dates in the selected month", () => {
    expect(isCourseDateInMonth("2026-08-27", august2026)).toBe(true);
    expect(isCourseDateInMonth("2026-08-01", august2026)).toBe(true);
  });

  it("rejects dates outside the selected month", () => {
    expect(isCourseDateInMonth("2026-06-27", august2026)).toBe(false);
    expect(isCourseDateInMonth(null, august2026)).toBe(false);
  });
});

describe("getCourseBlockHighlight", () => {
  const august2026 = new Date(2026, 7, 15);

  it("returns start when only start_date is in month", () => {
    expect(
      getCourseBlockHighlight(
        course({ start_date: "2026-08-05", end_date: "2026-10-30" }),
        august2026,
      ),
    ).toBe("start");
  });

  it("returns end when only end_date is in month", () => {
    expect(
      getCourseBlockHighlight(
        course({ start_date: "2026-06-01", end_date: "2026-08-30" }),
        august2026,
      ),
    ).toBe("end");
  });

  it("returns both when start and end are in month", () => {
    expect(
      getCourseBlockHighlight(
        course({ start_date: "2026-08-05", end_date: "2026-08-30" }),
        august2026,
      ),
    ).toBe("both");
  });

  it("returns null when neither date is in month or course is missing", () => {
    expect(
      getCourseBlockHighlight(
        course({ start_date: "2026-06-01", end_date: "2026-07-30" }),
        august2026,
      ),
    ).toBeNull();
    expect(getCourseBlockHighlight(undefined, august2026)).toBeNull();
    expect(getCourseBlockHighlight(course(), august2026)).toBeNull();
  });
});

describe("computeCourseDataCategoryStats", () => {
  const august2026 = new Date(2026, 7, 15);

  it("counts classes, students, and month highlights for the category", () => {
    expect(
      computeCourseDataCategoryStats(
        [
          course({
            course_id: 1,
            start_date: "2026-08-05",
            end_date: "2026-10-30",
            student_count: 20,
          }),
          course({
            course_id: 2,
            start_date: "2026-06-01",
            end_date: "2026-08-30",
            student_count: 15,
          }),
          course({
            course_id: 3,
            start_date: "2026-08-10",
            end_date: "2026-08-28",
            student_count: 10,
          }),
          course({
            course_id: 4,
            start_date: "2026-06-01",
            end_date: "2026-10-30",
            student_count: 5,
          }),
        ],
        august2026,
      ),
    ).toEqual({
      totalClasses: 4,
      totalStudents: 50,
      starting: 2,
      ending: 2,
      startingAndEnding: 1,
    });
  });
});
