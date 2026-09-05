import { describe, expect, it } from "vitest";

import {
  applyLocalCellChange,
  makeMonthlyResultSheetAdapter,
} from "@/lib/data-sheets/monthly-result-sheet-adapter";
import type { GradingBand, ResultSheetGrid } from "@/types/grading-reports";

const DEFAULT_BANDS: GradingBand[] = [
  { label: "A+", min_pct: 85, max_pct: 100 },
  { label: "A", min_pct: 75, max_pct: 84 },
  { label: "B", min_pct: 56, max_pct: 74 },
  { label: "C", min_pct: 49, max_pct: 55 },
  { label: "D", min_pct: 0, max_pct: 48 },
];

const grid: ResultSheetGrid = {
  sheet: { id: 1, year: 2026, month: 5, exam_date: "2026-05-28" },
  students: [
    {
      id: 10,
      name: "Aung",
      code: "S1",
      alternative_name: "Aung Aung",
      communication_email: "aung@example.com",
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
  ],
  cells: { "2:10": 33 },
};

describe("makeMonthlyResultSheetAdapter", () => {
  it("computes grade and percentage from named test marks", () => {
    const adapter = makeMonthlyResultSheetAdapter({
      grid,
      canEdit: true,
      gradingBands: DEFAULT_BANDS,
      onMarksChange: () => {},
    });
    expect(adapter.getCellValue(0, "student_grade")).toBe("B");
    expect(adapter.getCellValue(0, "student_pct")).toBe("56.9%");
  });

  it("applyLocalCellChange updates cells map", () => {
    const next = applyLocalCellChange(grid, 2, 10, "40");
    expect(next.cells["2:10"]).toBe(40);
  });
});
