import type { AttendanceRow } from "@/helpers/attendance-marking-roster";

export type AttendanceMarkingSortColumn =
  | "student"
  | "altName"
  | "phone"
  | "enrollment";

export type AttendanceMarkingSortDirection = "asc" | "desc";

export type AttendanceMarkingSortState = {
  column: AttendanceMarkingSortColumn;
  direction: AttendanceMarkingSortDirection;
};

export const DEFAULT_SORT: AttendanceMarkingSortState = {
  column: "student",
  direction: "asc",
};

const LOCALE_OPTS: Intl.CollatorOptions = { sensitivity: "base" };

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, LOCALE_OPTS);
}

function isBlank(value: string | null | undefined): boolean {
  return value == null || String(value).trim() === "";
}

function compareOptionalString(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const aBlank = isBlank(a);
  const bBlank = isBlank(b);
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;
  return compareStrings(String(a).trim(), String(b).trim());
}

function compareStudentName(a: AttendanceRow, b: AttendanceRow): number {
  return compareStrings(a.user.name, b.user.name);
}

function compareEnrollment(a: AttendanceRow, b: AttendanceRow): number {
  if (a.is_removed !== b.is_removed) {
    return a.is_removed ? 1 : -1;
  }
  return compareStudentName(a, b);
}

function compareByColumn(
  a: AttendanceRow,
  b: AttendanceRow,
  column: AttendanceMarkingSortColumn,
): number {
  switch (column) {
    case "student":
      return compareStudentName(a, b);
    case "altName":
      return compareOptionalString(a.user.alternative_name, b.user.alternative_name);
    case "phone":
      return compareOptionalString(a.user.phone_number, b.user.phone_number);
    case "enrollment":
      return compareEnrollment(a, b);
  }
}

export function sortAttendanceRows(
  rows: AttendanceRow[],
  sort: AttendanceMarkingSortState,
): AttendanceRow[] {
  return [...rows].sort((a, b) => {
    const cmp = compareByColumn(a, b, sort.column);
    return sort.direction === "asc" ? cmp : -cmp;
  });
}
