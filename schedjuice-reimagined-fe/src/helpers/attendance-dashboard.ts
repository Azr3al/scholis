import { format } from "date-fns";

import type {
  AttendanceCountSummary,
  CourseAttendanceSummary,
  CourseAttendanceSummaryStudent,
} from "@/types/attendance";

function dateOnly(value?: string | Date | null): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return value.toISOString().split("T")[0] ?? "";
  }
  return String(value).split("T")[0] ?? "";
}

export type CourseMonthBounds = {
  start_date?: string | Date | null;
  end_date?: string | Date | null;
};

export type MonthOption = {
  value: string;
  label: string;
  year: string;
};

export function formatMonthAnchor(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function resolveDefaultMonth(
  course: CourseMonthBounds,
  today = new Date(),
): string {
  const start = course.start_date ? new Date(course.start_date) : null;
  const end = course.end_date ? new Date(course.end_date) : null;

  if (start && today < start) {
    return formatMonthAnchor(start);
  }
  if (end && today > end) {
    return formatMonthAnchor(end);
  }
  return formatMonthAnchor(today);
}

export function normalizeSessionHeaderDate(raw: string): string {
  return dateOnly(raw);
}

export function resolveHighlightSessionDate(
  sessionDateHeaders: string[],
  todayYmd: string,
): string | null {
  const normalized = sessionDateHeaders
    .map(normalizeSessionHeaderDate)
    .filter(Boolean);

  if (normalized.length === 0) return null;
  if (normalized.includes(todayYmd)) return todayYmd;

  let best: string | null = null;
  for (const d of normalized) {
    if (d <= todayYmd) best = d;
  }
  return best;
}

export function isViewingCurrentCalendarMonth(
  dateRange: string,
  today = new Date(),
): boolean {
  if (dateRange === "all") return false;
  const [y, m] = dateRange.split("-").map(Number);
  if (!y || !m) return false;
  return today.getFullYear() === y && today.getMonth() + 1 === m;
}

export function parseMonthAnchor(
  value: string,
): { year: number; monthIndex: number } | null {
  if (value === "all") return null;
  const [y, m] = value.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return { year: y, monthIndex: m - 1 };
}

export function formatMonthName(monthIndex: number): string {
  return format(new Date(2000, monthIndex, 1), "MMMM");
}

export function buildCourseYearOptions(
  months: MonthOption[],
): { value: string; label: string }[] {
  const years = Array.from(new Set(months.map((m) => m.year))).sort(
    (a, b) => Number(a) - Number(b),
  );
  return years.map((year) => ({ value: year, label: year }));
}

export function resolveMonthAnchorForYearChange(
  current: string,
  newYear: string,
  months: MonthOption[],
): string {
  if (current === "all") return "all";

  const parsed = parseMonthAnchor(current);
  const yearMonths = months.filter((m) => m.year === newYear);
  if (yearMonths.length === 0) return current;

  if (parsed) {
    const sameMonth = yearMonths.find((m) => {
      const anchor = parseMonthAnchor(m.value);
      return anchor?.monthIndex === parsed.monthIndex;
    });
    if (sameMonth) return sameMonth.value;
  }

  return yearMonths[0]!.value;
}

export function buildCourseMonthOptions(
  startDate: string | Date | null | undefined,
  endDate: string | Date | null | undefined,
): MonthOption[] {
  const startDateStr = dateOnly(startDate);
  const endDateStr = dateOnly(endDate);
  if (!startDateStr || !endDateStr) return [];

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  const options: MonthOption[] = [];

  while (cursor <= last) {
    const value = formatMonthAnchor(cursor);
    options.push({
      value,
      label: cursor.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      }),
      year: String(cursor.getFullYear()),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return options;
}

export function parseAttendanceMatrix(data: string[][]) {
  if (data.length < 2) return null;
  const [header, ...rows] = data;
  const sessionHeaders = header.slice(3).map(String);
  return {
    sessionHeaders,
    rows: rows.map((row) => ({
      name: String(row[0] ?? ""),
      total: String(row[1] ?? ""),
      percentage: String(row[2] ?? ""),
      statuses: row.slice(3).map(String),
    })),
  };
}

export function formatAttendanceFraction(attended: number, total: number): string {
  return `${attended}/${total}`;
}

export function pickClassAggregateForMonth(
  summary: CourseAttendanceSummary,
  monthAnchor: string | null,
): AttendanceCountSummary | null {
  if (!monthAnchor || monthAnchor === "all") return null;
  return summary.class_aggregate.by_month[monthAnchor] ?? null;
}

export function filterSummaryStudentsBySearch(
  students: CourseAttendanceSummaryStudent[],
  searchTerm: string,
): CourseAttendanceSummaryStudent[] {
  const trimmed = searchTerm.trim();
  if (!trimmed) return students;
  const lower = trimmed.toLowerCase();
  return students.filter((s) => s.name.toLowerCase().includes(lower));
}

export type MonthlyAttendanceMatrixStudent = {
  id: number;
  name: string;
  is_removed: boolean;
};

export type MonthlyAttendanceMatrixResponse = {
  matrix: string[][];
  students: MonthlyAttendanceMatrixStudent[];
};

type MonthlyAttendanceApiBody = {
  data: string[][] | Record<string, never>;
  students?: MonthlyAttendanceMatrixStudent[];
};

export function parseMonthlyAttendanceResponse(
  body: MonthlyAttendanceApiBody,
): MonthlyAttendanceMatrixResponse {
  return {
    matrix: Array.isArray(body.data) ? body.data : [],
    students: body.students ?? [],
  };
}

export type PerfectAttendanceStudent = {
  id: number;
  name: string;
};

export function filterStatusesThroughDate(
  sessionHeaders: string[],
  statuses: string[],
  asOfYmd: string,
): string[] {
  const result: string[] = [];
  const limit = Math.min(sessionHeaders.length, statuses.length);

  for (let i = 0; i < limit; i += 1) {
    const sessionDate = normalizeSessionHeaderDate(sessionHeaders[i] ?? "");
    if (!sessionDate || sessionDate > asOfYmd) continue;
    result.push(statuses[i] ?? "");
  }

  return result;
}

export function derivePerfectAttendanceStudents(
  matrix: string[][],
  students: Array<{ id: number; name: string; is_removed: boolean }>,
  asOfYmd?: string | null,
): PerfectAttendanceStudent[] {
  if (matrix.length < 2) return [];

  const [header, ...body] = matrix;
  const sessionHeaders = header.slice(3).map(String);
  const result: PerfectAttendanceStudent[] = [];

  body.forEach((row, index) => {
    const meta = students[index];
    if (!meta || meta.is_removed) return;

    const rawStatuses = row.slice(3).map(String);
    const statuses =
      asOfYmd != null
        ? filterStatusesThroughDate(sessionHeaders, rawStatuses, asOfYmd)
        : rawStatuses;
    if (statuses.length < 1) return;
    if (!statuses.every((status) => status === "present")) return;

    result.push({ id: meta.id, name: meta.name });
  });

  return result.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export function formatPerfectAttendanceCountLabel(count: number): string {
  const noun = count === 1 ? "student" : "students";
  return `Perfect attendance · ${count} ${noun}`;
}
