import type { GridColumn } from "@glideapps/glide-data-grid";

import type { RubricColumn } from "@/types/mark-sheets";

export const STUDENT_NAME_FIELD = "student_name";
export const STUDENT_ALT_NAME_FIELD = "student_alt_name";
export const STUDENT_EMAIL_FIELD = "student_email";

export const MARK_SHEET_READ_ONLY_FIELDS = new Set([
  STUDENT_NAME_FIELD,
  STUDENT_ALT_NAME_FIELD,
  STUDENT_EMAIL_FIELD,
]);

export function buildMarkSheetColumns(columns: RubricColumn[]): GridColumn[] {
  const fixedLeft: GridColumn[] = [
    { id: STUDENT_NAME_FIELD, title: "Name", width: 160 },
    { id: STUDENT_ALT_NAME_FIELD, title: "Alt name", width: 140 },
    { id: STUDENT_EMAIL_FIELD, title: "Email", width: 200 },
  ];
  const dynamic = columns.map((col) => ({
    id: col.key,
    title:
      col.kind === "score" && col.max_marks
        ? `${col.title} /${col.max_marks}`
        : col.title,
    width: 140,
  }));
  return [...fixedLeft, ...dynamic];
}

export function markSheetFieldByColumn(columns: GridColumn[]): (string | null)[] {
  return columns.map((c) => String(c.id));
}

export function isComputedColumnKey(
  rubricColumns: RubricColumn[],
  field: string,
): boolean {
  return rubricColumns.some((c) => c.key === field && c.kind === "computed_total");
}

export function isScoreColumnKey(
  rubricColumns: RubricColumn[],
  field: string,
): boolean {
  return rubricColumns.some((c) => c.key === field && c.kind === "score");
}
