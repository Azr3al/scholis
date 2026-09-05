import { describe, expect, it } from "vitest";

import type { CourseDataSheetRow } from "@/types/data-sheets";

import type { CoursePairedDisplayRow } from "./course-data-paired-layout";
import { resolveCourseChipClick } from "./resolve-course-chip-click";

function course(
  p: Partial<CourseDataSheetRow> = {},
): CourseDataSheetRow {
  return {
    course_id: 42,
    category_name: "FCE",
    category_sort_order: 1,
    title: "Movers 207 WE",
    start_date: null,
    end_date: null,
    course_type: "WE",
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

describe("resolveCourseChipClick", () => {
  const pairedRow: CoursePairedDisplayRow = {
    kind: "paired",
    cells: [course({ course_id: 101 }), undefined],
  };

  it("returns null for summary rows", () => {
    const summaryRow: CoursePairedDisplayRow = {
      kind: "summary",
      blockTotals: [10, 5],
      grandTotal: 15,
    };
    expect(resolveCourseChipClick(summaryRow, "b0_title")).toBeNull();
  });

  it("returns null for divider columns", () => {
    expect(resolveCourseChipClick(pairedRow, "divide_1")).toBeNull();
    expect(resolveCourseChipClick(pairedRow, null)).toBeNull();
  });

  it("returns null for mt and at roles", () => {
    expect(resolveCourseChipClick(pairedRow, "b0_mt")).toBeNull();
    expect(resolveCourseChipClick(pairedRow, "b0_at")).toBeNull();
  });

  it("returns null when the block has no course", () => {
    expect(resolveCourseChipClick(pairedRow, "b1_title")).toBeNull();
  });

  it("returns course_id for a title cell with a course", () => {
    expect(resolveCourseChipClick(pairedRow, "b0_title")).toBe(101);
  });

  it("resolves other rows at block index 0", () => {
    const otherRow: CoursePairedDisplayRow = {
      kind: "other",
      row: course({ course_id: 77 }),
    };
    expect(resolveCourseChipClick(otherRow, "b0_title")).toBe(77);
    expect(resolveCourseChipClick(otherRow, "b1_title")).toBeNull();
  });
});
