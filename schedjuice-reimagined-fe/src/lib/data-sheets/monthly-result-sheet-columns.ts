import type { GridColumn } from "@glideapps/glide-data-grid";

import type { ResultColumn } from "@/types/grading-reports";

export const STUDENT_NAME_FIELD = "student_name";
export const STUDENT_ALT_NAME_FIELD = "student_alt_name";
export const STUDENT_EMAIL_FIELD = "student_email";
export const STUDENT_GRADE_FIELD = "student_grade";
export const STUDENT_PCT_FIELD = "student_pct";

export const MONTHLY_RESULT_READ_ONLY_FIELDS = new Set([
  STUDENT_NAME_FIELD,
  STUDENT_ALT_NAME_FIELD,
  STUDENT_EMAIL_FIELD,
  STUDENT_GRADE_FIELD,
  STUDENT_PCT_FIELD,
]);

export function buildMonthlyResultSheetColumns(
  dataColumns: ResultColumn[],
): GridColumn[] {
  const fixedLeft: GridColumn[] = [
    { id: STUDENT_NAME_FIELD, title: "Name", width: 160 },
    { id: STUDENT_ALT_NAME_FIELD, title: "Alt name", width: 140 },
    { id: STUDENT_EMAIL_FIELD, title: "Email", width: 200 },
  ];
  const dynamic = dataColumns.map((col) => ({
    id: `col_${col.id}`,
    title: col.is_named_test
      ? `${col.title} /${col.max_marks ?? ""}`
      : col.title,
    width: 120,
  }));
  const fixedRight: GridColumn[] = [
    { id: STUDENT_GRADE_FIELD, title: "Grade", width: 72 },
    { id: STUDENT_PCT_FIELD, title: "Percentage", width: 96 },
  ];
  return [...fixedLeft, ...dynamic, ...fixedRight];
}

export function monthlyResultFieldByColumn(
  columns: GridColumn[],
): (string | null)[] {
  return columns.map((c) => String(c.id));
}

export function computedResultColumnIndices(
  fieldByColumn: (string | null)[],
): { gradeCol: number; pctCol: number } {
  return {
    gradeCol: fieldByColumn.indexOf(STUDENT_GRADE_FIELD),
    pctCol: fieldByColumn.indexOf(STUDENT_PCT_FIELD),
  };
}
