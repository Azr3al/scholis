import { formatMonthLong } from "@/helpers/payment-coverage-months";

export type SuggestedMonth = { year: number; month: number };

function parseDateOnly(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0);
}

export function calendarMonthOverlapsCourse(
  startDate: string | Date | null | undefined,
  endDate: string | Date | null | undefined,
  year: number,
  month: number,
): boolean {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) return true;
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = lastDayOfMonth(year, month);
  const startOnly = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return startOnly <= lastDay && endOnly >= firstDay;
}

export function resolveSuggestedPaymentMonth(
  startDate: string | Date | null | undefined,
  endDate: string | Date | null | undefined,
  today = new Date(),
): SuggestedMonth | null {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) return null;
  const startOnly = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const todayOnly = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  if (todayOnly < startOnly) {
    return { year: startOnly.getFullYear(), month: startOnly.getMonth() + 1 };
  }
  if (todayOnly > endOnly) {
    return { year: endOnly.getFullYear(), month: endOnly.getMonth() + 1 };
  }
  return { year: todayOnly.getFullYear(), month: todayOnly.getMonth() + 1 };
}

export function formatMonthYearLabel(year: number, month: number): string {
  return formatMonthLong(year, month);
}

/** First-of-month date to snap to when selected month is outside course range, or null if no change. */
export function resolveMonthDateIfOutsideCourse(
  startDate: string | Date | null | undefined,
  endDate: string | Date | null | undefined,
  selectedMonth: Date,
  today = new Date(),
): Date | null {
  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth() + 1;
  if (calendarMonthOverlapsCourse(startDate, endDate, year, month)) {
    return null;
  }
  const suggested = resolveSuggestedPaymentMonth(startDate, endDate, today);
  if (!suggested) return null;
  return new Date(suggested.year, suggested.month - 1, 1);
}
