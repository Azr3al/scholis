import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { formatSessionClock, getDateISOString } from "@/helpers/date";
import type { TimeDisplayFormatValue } from "@/helpers/time-format";
import { getTenantTodayYmd } from "@/helpers/shortcuts-time";
import type { eventType } from "@/types/course";

export type MarkingEvent = eventType & { date_ymd?: string | null };

export function dateOnlyFromLocalDate(date: Date): string {
  return getDateISOString(date);
}

export function eventDateYmd(value: string | Date, timezone: string): string {
  if (typeof value === "string" && value.length >= 10 && !value.includes("T")) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  return formatInTimeZone(d, timezone, "yyyy-MM-dd");
}

export function calendarDateYmd(value?: string | Date | null): string {
  if (value == null) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return getDateISOString(value);
}

export function resolveEventYmd(event: MarkingEvent, timezone: string): string {
  if (event.date_ymd) return event.date_ymd;
  return eventDateYmd(event.date, timezone);
}

/** Calendar YMD from a local Date or ISO string (legacy callers). */
export function dateOnly(value?: string | Date | null): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return dateOnlyFromLocalDate(value);
  }
  return String(value).split("T")[0] ?? "";
}

export function getTodayYmd(timezone = "UTC"): string {
  return getTenantTodayYmd(timezone);
}

export function getPreferredEventIndex(
  events: MarkingEvent[],
  timezone: string,
  today?: string,
): number {
  if (events.length === 0) return -1;

  const todayYmd = today ?? getTodayYmd(timezone);

  const todayIdx = events.findIndex(
    (event) => resolveEventYmd(event, timezone) === todayYmd,
  );
  if (todayIdx !== -1) return todayIdx;

  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (resolveEventYmd(events[i]!, timezone) <= todayYmd) return i;
  }

  return events.length - 1;
}

export function resolvePreferredEventIndex(
  events: MarkingEvent[],
  preferredEventId: number | null | undefined,
  timezone: string,
  today?: string,
): number {
  if (preferredEventId != null) {
    const idx = events.findIndex((event) => event.id === preferredEventId);
    if (idx !== -1) return idx;
  }
  return getPreferredEventIndex(events, timezone, today);
}

export function getTodayEventIndex(
  events: MarkingEvent[],
  timezone: string,
  today?: string,
): number {
  const todayYmd = today ?? getTodayYmd(timezone);
  return events.findIndex(
    (event) => resolveEventYmd(event, timezone) === todayYmd,
  );
}

export function getEventIndicesForDate(
  events: MarkingEvent[],
  ymd: string,
  timezone: string,
): number[] {
  return events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => resolveEventYmd(event, timezone) === ymd)
    .map(({ index }) => index);
}

export function getUniqueTeachingDayKeys(
  events: MarkingEvent[],
  timezone: string,
): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const event of events) {
    const key = resolveEventYmd(event, timezone);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export function getAdjacentTeachingDayIndex(
  events: MarkingEvent[],
  currentIndex: number,
  direction: "prev" | "next",
  timezone: string,
): number | null {
  const teachingDays = getUniqueTeachingDayKeys(events, timezone);
  if (teachingDays.length === 0) return null;

  const currentKey = resolveEventYmd(events[currentIndex]!, timezone);
  const dayIndex = teachingDays.indexOf(currentKey);
  if (dayIndex === -1) return null;

  const nextDayIndex = direction === "prev" ? dayIndex - 1 : dayIndex + 1;
  if (nextDayIndex < 0 || nextDayIndex >= teachingDays.length) return null;

  const indices = getEventIndicesForDate(
    events,
    teachingDays[nextDayIndex]!,
    timezone,
  );
  return indices[0] ?? null;
}

export function formatSessionLabel(
  event: eventType,
  format: TimeDisplayFormatValue = "12h",
): string {
  const timePart =
    event.time_from && event.time_to
      ? `${formatSessionClock(event.time_from, format)}–${formatSessionClock(event.time_to, format)}`
      : "";
  const titlePart = event.title ? ` — ${event.title}` : "";
  return `${timePart}${titlePart}`.trim() || "Session";
}

export function ymdToLocalDate(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year!, (month ?? 1) - 1, day);
}

export function formatTeachingDayYmd(
  ymd: string,
  formatString = "EEEE, d MMMM yyyy",
): string {
  if (!ymd) return "";
  return format(ymdToLocalDate(ymd), formatString);
}

export function formatEventTeachingDayLabel(
  event: MarkingEvent,
  timezone: string,
  formatString = "EEEE, d MMMM yyyy",
): string {
  return formatTeachingDayYmd(resolveEventYmd(event, timezone), formatString);
}

export function isTeachingDay(
  events: MarkingEvent[],
  date: Date,
  timezone: string,
): boolean {
  const key = dateOnlyFromLocalDate(date);
  return events.some((event) => resolveEventYmd(event, timezone) === key);
}

export function resolveCourseDateBounds(
  events: MarkingEvent[],
  courseStartDate: string | Date | null | undefined,
  courseEndDate: string | Date | null | undefined,
  timezone: string,
): { fromYmd: string; toYmd: string } {
  const first = events[0];
  const last = events[events.length - 1];
  const fromYmd =
    calendarDateYmd(courseStartDate) ||
    (first ? resolveEventYmd(first, timezone) : getTodayYmd(timezone));
  const toYmd =
    calendarDateYmd(courseEndDate) ||
    (last ? resolveEventYmd(last, timezone) : getTodayYmd(timezone));
  return { fromYmd, toYmd };
}
