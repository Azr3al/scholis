import type { SheetAdapter } from "@/components/data-sheet/types";
import type { MarkSheetGrid } from "@/types/mark-sheets";

import {
  isComputedColumnKey,
  isScoreColumnKey,
  MARK_SHEET_READ_ONLY_FIELDS,
  STUDENT_ALT_NAME_FIELD,
  STUDENT_EMAIL_FIELD,
  STUDENT_NAME_FIELD,
} from "./mark-sheet-columns";

export function makeMarkSheetAdapter(opts: {
  grid: MarkSheetGrid;
  canEdit: boolean;
  onMarksChange: (columnKey: string, studentId: number, value: string) => void;
}): SheetAdapter {
  const { grid, canEdit, onMarksChange } = opts;
  const rubricColumns = grid.rubric.columns;

  return {
    rowCount: grid.students.length,
    getCellValue: (row, field) => {
      const student = grid.students[row];
      if (!student) return "";
      if (field === STUDENT_NAME_FIELD) return student.name;
      if (field === STUDENT_ALT_NAME_FIELD) return student.alternative_name;
      if (field === STUDENT_EMAIL_FIELD) return student.communication_email;
      if (isComputedColumnKey(rubricColumns, field)) {
        const key = `${student.id}:${field}`;
        const val = grid.computed[key];
        return val == null ? "" : String(val);
      }
      if (isScoreColumnKey(rubricColumns, field)) {
        const key = `${student.id}:${field}`;
        const val = grid.cells[key];
        return val == null ? "" : String(val);
      }
      return "";
    },
    setCellValue: (row, field, value) => {
      if (!canEdit) return;
      const student = grid.students[row];
      if (!student || !isScoreColumnKey(rubricColumns, field)) return;
      onMarksChange(field, student.id, value);
    },
    isCellEditable: (_row, field) =>
      canEdit &&
      !MARK_SHEET_READ_ONLY_FIELDS.has(field) &&
      isScoreColumnKey(rubricColumns, field),
    getNumericValue: (row, field) => {
      const student = grid.students[row];
      if (!student) return null;
      if (isComputedColumnKey(rubricColumns, field)) {
        const key = `${student.id}:${field}`;
        const val = grid.computed[key];
        return typeof val === "number" ? val : null;
      }
      if (!isScoreColumnKey(rubricColumns, field)) return null;
      const key = `${student.id}:${field}`;
      const val = grid.cells[key];
      return typeof val === "number" ? val : null;
    },
  };
}

export function applyLocalMarkSheetCellChange(
  grid: MarkSheetGrid,
  columnKey: string,
  studentId: number,
  raw: string,
): MarkSheetGrid {
  const key = `${studentId}:${columnKey}`;
  const trimmed = raw.trim();
  const marks =
    trimmed === "" ? null : Number.isFinite(Number(trimmed)) ? Number(trimmed) : null;
  const nextCells = { ...grid.cells, [key]: marks };

  const scoreKeys = grid.rubric.columns
    .filter((c) => c.kind === "score")
    .map((c) => c.key);
  const totalKeys = grid.rubric.columns
    .filter((c) => c.kind === "computed_total")
    .map((c) => c.key);
  const nextComputed = { ...grid.computed };
  if (totalKeys.length > 0) {
    let total = 0;
    let hasAny = false;
    for (const sk of scoreKeys) {
      const val = nextCells[`${studentId}:${sk}`];
      if (typeof val === "number") {
        total += val;
        hasAny = true;
      }
    }
    for (const tk of totalKeys) {
      nextComputed[`${studentId}:${tk}`] = hasAny ? total : null;
    }
  }

  return { ...grid, cells: nextCells, computed: nextComputed };
}
