import type { SheetAdapter } from "@/components/data-sheet/types";
import { computeStudentOverall } from "@/lib/grading/compute-grade";
import type { GradingBand, ResultSheetGrid } from "@/types/grading-reports";

import {
  MONTHLY_RESULT_READ_ONLY_FIELDS,
  STUDENT_ALT_NAME_FIELD,
  STUDENT_EMAIL_FIELD,
  STUDENT_GRADE_FIELD,
  STUDENT_NAME_FIELD,
  STUDENT_PCT_FIELD,
} from "./monthly-result-sheet-columns";

export function makeMonthlyResultSheetAdapter(opts: {
  grid: ResultSheetGrid;
  canEdit: boolean;
  gradingBands: GradingBand[];
  onMarksChange: (columnId: number, studentId: number, value: string) => void;
}): SheetAdapter {
  const { grid, canEdit, gradingBands, onMarksChange } = opts;
  const colByField = new Map<string, (typeof grid.columns)[number]>(
    grid.columns.map((c) => [`col_${c.id}`, c]),
  );

  return {
    rowCount: grid.students.length,
    getCellValue: (row, field) => {
      const student = grid.students[row];
      if (!student) return "";
      if (field === STUDENT_NAME_FIELD) return student.name;
      if (field === STUDENT_ALT_NAME_FIELD) return student.alternative_name;
      if (field === STUDENT_EMAIL_FIELD) return student.communication_email;
      if (field === STUDENT_GRADE_FIELD) {
        const overall = computeStudentOverall(grid, student.id, gradingBands);
        return overall?.grade ?? "";
      }
      if (field === STUDENT_PCT_FIELD) {
        const overall = computeStudentOverall(grid, student.id, gradingBands);
        return overall == null ? "" : `${overall.pct}%`;
      }
      const col = colByField.get(field);
      if (!col) return "";
      const key = `${col.id}:${student.id}`;
      const val = grid.cells[key];
      return val == null ? "" : String(val);
    },
    setCellValue: (row, field, value) => {
      if (!canEdit) return;
      const col = colByField.get(field);
      const student = grid.students[row];
      if (!col || !student) return;
      onMarksChange(col.id, student.id, value);
    },
    isCellEditable: (_row, field) =>
      canEdit &&
      !MONTHLY_RESULT_READ_ONLY_FIELDS.has(field) &&
      colByField.has(field),
    getNumericValue: (row, field) => {
      const col = colByField.get(field);
      if (!col) return null;
      const student = grid.students[row];
      if (!student) return null;
      const key = `${col.id}:${student.id}`;
      const val = grid.cells[key];
      return typeof val === "number" ? val : null;
    },
  };
}

export function applyLocalCellChange(
  grid: ResultSheetGrid,
  columnId: number,
  studentId: number,
  raw: string,
): ResultSheetGrid {
  const key = `${columnId}:${studentId}`;
  const trimmed = raw.trim();
  const marks =
    trimmed === "" ? null : Number.isFinite(Number(trimmed)) ? Number(trimmed) : null;
  return {
    ...grid,
    cells: { ...grid.cells, [key]: marks },
  };
}
