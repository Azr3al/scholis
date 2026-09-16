import { describe, expect, it } from "vitest";

import type { CourseDataSheetRow } from "@/types/data-sheets";

import {
  courseDataRowLineCount,
  precomputeCourseDataRowHeights,
  rowHeightForLineCount,
} from "./course-data-row-heights";

function row(p: Partial<CourseDataSheetRow>): CourseDataSheetRow {
  return {
    course_id: 1,
    category_name: "Starters",
    category_sort_order: 1,
    title: "X",
    start_date: "2026-06-05",
    end_date: "2026-06-30",
    course_type: "WD",
    student_count: 10,
    assistant_teacher_count: 1,
    start_time: "18:40",
    end_time: "20:30",
    main_teachers: "Teacher Su (Su)",
    assistant_teachers: "AT One (One)",
    current_unit: null,
    current_unit_updated_at: null,
    ...p,
  };
}

describe("rowHeightForLineCount", () => {
  it("adds 22px per extra line", () => {
    expect(rowHeightForLineCount(1, 36)).toBe(36);
    expect(rowHeightForLineCount(3, 36)).toBe(80);
  });
});

describe("precomputeCourseDataRowHeights", () => {
  const base = 36;

  it("uses base height for summary rows", () => {
    const heights = precomputeCourseDataRowHeights(
      [{ kind: "summary", blockTotals: [10, 5], grandTotal: 15 }],
      2,
      base,
    );
    expect(heights).toEqual([36]);
  });

  it("tallens rows when assistant teachers span multiple lines", () => {
    const singleAt = {
      kind: "paired" as const,
      cells: [
        row({ assistant_teachers: "One (One)" }),
        undefined,
      ],
    };
    const multiAt = {
      kind: "paired" as const,
      cells: [
        row({
          assistant_teachers: "One (One), Two (Two), Three (Three)",
        }),
        undefined,
      ],
    };

    const [singleHeight, multiHeight] = precomputeCourseDataRowHeights(
      [singleAt, multiAt],
      2,
      base,
    );

    expect(multiHeight).toBeGreaterThan(singleHeight);
    expect(multiHeight).toBe(rowHeightForLineCount(3, base));
  });

  it("counts max teachers across all blocks in a paired row", () => {
    const lineCount = courseDataRowLineCount(
      {
        kind: "paired",
        cells: [
          row({ assistant_teachers: "A" }),
          row({ assistant_teachers: "B, C, D" }),
        ],
      },
      2,
    );
    expect(lineCount).toBe(3);
  });
});
