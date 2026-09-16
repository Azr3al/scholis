import { describe, expect, it } from "vitest";

import type { CourseDataSheetRow } from "@/types/data-sheets";

import { groupKeyFor, isHalfMonth } from "./course-data-grouping";

function row(p: Partial<CourseDataSheetRow>): CourseDataSheetRow {
  return {
    course_id: 1,
    category_name: "FCE",
    category_sort_order: 1,
    title: "X",
    start_date: "2026-06-05",
    end_date: "2026-06-30",
    course_type: "WD",
    student_count: 10,
    assistant_teacher_count: 1,
    start_time: "18:40",
    end_time: "20:30",
    main_teachers: "T",
    assistant_teachers: null,
    current_unit: null,
    current_unit_updated_at: null,
    ...p,
  };
}

describe("isHalfMonth", () => {
  it("is FM when day <= 13", () => {
    expect(isHalfMonth("2026-06-13")).toBe(false);
  });
  it("is HM when day > 13", () => {
    expect(isHalfMonth("2026-06-14")).toBe(true);
  });
  it("treats null as FM", () => {
    expect(isHalfMonth(null)).toBe(false);
  });
});

describe("groupKeyFor", () => {
  it("HM + WE", () => {
    expect(groupKeyFor(row({ start_date: "2026-06-20", course_type: "WE" }))).toBe(
      "HM_WE",
    );
  });
  it("OTHER course_type -> OTHER", () => {
    expect(groupKeyFor(row({ course_type: "OTHER" }))).toBe("OTHER");
  });
  it("null course_type -> OTHER", () => {
    expect(groupKeyFor(row({ course_type: null }))).toBe("OTHER");
  });
});
