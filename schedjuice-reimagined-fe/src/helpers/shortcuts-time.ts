import { addDays } from "date-fns";
import { formatInTimeZone, zonedTimeToUtc } from "date-fns-tz";

function toYmd(dateInput: string | Date): string | null {
  if (typeof dateInput === "string") {
    return dateInput.slice(0, 10);
  }
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Calendar date (YYYY-MM-DD) + time (HH:mm:ss) interpreted in the tenant timezone.
 */
export function eventInstantInTimezone(
  dateInput: string | Date,
  timeStr: string | null | undefined,
  timezone: string,
): Date | null {
  if (!timeStr?.trim()) return null;
  const dateStr = toYmd(dateInput);
  if (!dateStr) return null;

  const t = timeStr.trim();
  const parts = t.split(":");
  const hh = Number(parts[0]) || 0;
  const mm = Number(parts[1]) || 0;
  const ss = Number(parts[2]) || 0;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  const wall = new Date(y, m - 1, d, hh, mm, ss);
  return zonedTimeToUtc(wall, timezone);
}

/** Today's calendar date (YYYY-MM-DD) in the tenant timezone. */
export function getTenantTodayYmd(timezone: string): string {
  return formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
}

/** UTC ISO range for that calendar day in the tenant timezone (for Event.date DateTime filters). */
export function getTenantDayBoundariesIso(
  timezone: string,
  ymd: string,
): { startIso: string; endIso: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const startLocal = new Date(y, m - 1, d, 0, 0, 0, 0);
  const endLocal = new Date(y, m - 1, d, 23, 59, 59, 999);
  return {
    startIso: zonedTimeToUtc(startLocal, timezone).toISOString(),
    endIso: zonedTimeToUtc(endLocal, timezone).toISOString(),
  };
}

/** UTC ISO range for a full calendar month in the tenant timezone. */
export function getTenantMonthBoundariesIso(
  timezone: string,
  monthAnchor: Date,
): { startIso: string; endIso: string } {
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const firstYmd = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const lastYmd = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const start = getTenantDayBoundariesIso(timezone, firstYmd);
  const end = getTenantDayBoundariesIso(timezone, lastYmd);
  return { startIso: start.startIso, endIso: end.endIso };
}

/** Shift a tenant calendar day (YYYY-MM-DD) by a number of days; result is YYYY-MM-DD in `timezone`. */
export function addCalendarDaysToTenantYmd(
  ymd: string,
  timezone: string,
  delta: number,
): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const wall = new Date(y, m - 1, d, 12, 0, 0, 0);
  const utc = zonedTimeToUtc(wall, timezone);
  const shifted = addDays(utc, delta);
  return formatInTimeZone(shifted, timezone, "yyyy-MM-dd");
}

export type TenantRelativeDay = "today" | "yesterday" | "tomorrow";

/** Compare selected YMD to tenant today / yesterday / tomorrow (same calendar semantics as getTenantTodayYmd). */
export function getTenantRelativeDay(
  selectedYmd: string,
  timezone: string,
): TenantRelativeDay | null {
  const today = getTenantTodayYmd(timezone);
  if (selectedYmd === today) return "today";
  const yesterday = addCalendarDaysToTenantYmd(today, timezone, -1);
  const tomorrow = addCalendarDaysToTenantYmd(today, timezone, 1);
  if (selectedYmd === yesterday) return "yesterday";
  if (selectedYmd === tomorrow) return "tomorrow";
  return null;
}
