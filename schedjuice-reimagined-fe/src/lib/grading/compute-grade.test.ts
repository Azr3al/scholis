import { describe, expect, it } from "vitest";

import { computeGrade, computeStudentOverall } from "@/lib/grading/compute-grade";
import type { GradingBand, ResultSheetGrid } from "@/types/grading-reports";

const DEFAULT_BANDS: GradingBand[] = [
  { label: "A+", min_pct: 85, max_pct: 100 },
  { label: "A", min_pct: 75, max_pct: 84 },
  { label: "B", min_pct: 56, max_pct: 74 },
  { label: "C", min_pct: 49, max_pct: 55 },
  { label: "D", min_pct: 0, max_pct: 48 },
];

describe("computeGrade", () => {
  it("maps band boundaries correctly", () => {
    expect(computeGrade(30, 58, DEFAULT_BANDS).pct).toBe(51.7);
    expect(computeGrade(30, 58, DEFAULT_BANDS).grade).toBe("C");
    expect(computeGrade(50, 58, DEFAULT_BANDS).pct).toBe(86.2);
    expect(computeGrade(50, 58, DEFAULT_BANDS).grade).toBe("A+");
  });

});

describe("computeStudentOverall", () => {
  const grid: ResultSheetGrid = {
    sheet: { id: 1, year: 2026, month: 5, exam_date: "2026-05-28" },
    students: [
      {
        id: 10,
        name: "Aung",
        code: "S1",
        alternative_name: "",
        communication_email: "a@example.com",
        is_removed: false,
      },
    ],
    columns: [
      {
        id: 2,
        sheet: 1,
        title: "Reading",
        max_marks: 58,
        is_named_test: true,
        sort_order: 0,
      },
      {
        id: 3,
        sheet: 1,
        title: "Notes",
        max_marks: null,
        is_named_test: false,
        sort_order: 1,
      },
    ],
    cells: { "2:10": 40 },
  };

  it("computes overall from named test columns with marks", () => {
    const result = computeStudentOverall(grid, 10, DEFAULT_BANDS);
    expect(result).not.toBeNull();
    expect(result!.pct).toBe(69);
    expect(result!.grade).toBe("B");
  });

  it("returns null when no marks entered", () => {
    expect(computeStudentOverall({ ...grid, cells: {} }, 10, DEFAULT_BANDS)).toBeNull();
  });

  it("sums multiple named tests with entered marks only", () => {
    const multi: ResultSheetGrid = {
      ...grid,
      columns: [
        ...grid.columns,
        {
          id: 4,
          sheet: 1,
          title: "Writing",
          max_marks: 40,
          is_named_test: true,
          sort_order: 2,
        },
      ],
      cells: { "2:10": 40, "4:10": 30 },
    };
    const result = computeStudentOverall(multi, 10, DEFAULT_BANDS);
    expect(result!.pct).toBe(71.4);
    expect(result!.grade).toBe("B");
  });
});
