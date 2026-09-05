import { formatInTimeZone } from "date-fns-tz";

import { weekdayNames } from "@/components/calendar/types";
import type { eventType } from "@/types/course";

export type SessionOption = {
  id: number;
  isoDate: string;
  monthKey: string;
  dayLabel: string;
  weekday: number;
  timeFrom: string;
  timeTo: string;
};

export type MonthGroup = {
  key: string;
  label: string;
  sessions: SessionOption[];
};

function safeTimezone(timezone: string | null | undefined): string {
  return timezone && timezone.trim() ? timezone : "UTC";
}

export function toSessionOptions(
  events: Partial<eventType>[],
  timezone: string | null | undefined,
): SessionOption[] {
  const tz = safeTimezone(timezone);
  const options: SessionOption[] = [];
  for (const event of events || []) {
    if (event?.id == null || event?.date == null) continue;
    const date = new Date(event.date as string | Date);
    if (Number.isNaN(date.getTime())) continue;
    const isoDate = formatInTimeZone(date, tz, "yyyy-MM-dd");
    options.push({
      id: Number(event.id),
      isoDate,
      monthKey: isoDate.slice(0, 7),
      dayLabel: formatInTimeZone(date, tz, "EEE d"),
      weekday: Number(formatInTimeZone(date, tz, "i")) % 7,
      timeFrom: String(event.time_from ?? ""),
      timeTo: String(event.time_to ?? ""),
    });
  }
  return options.sort((a, b) =>
    a.isoDate === b.isoDate
      ? a.timeFrom.localeCompare(b.timeFrom)
      : a.isoDate.localeCompare(b.isoDate),
  );
}

export function groupSessionsByMonth(sessions: SessionOption[]): MonthGroup[] {
  const byMonth = new Map<string, SessionOption[]>();
  for (const session of sessions) {
    const bucket = byMonth.get(session.monthKey);
    if (bucket) bucket.push(session);
    else byMonth.set(session.monthKey, [session]);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, monthSessions]) => ({
      key,
      label: formatInTimeZone(
        new Date(`${key}-01T00:00:00Z`),
        "UTC",
        "MMMM yyyy",
      ),
      sessions: monthSessions,
    }));
}

export function courseWeekdayIndices(
  repeatEvery: string[] | null | undefined,
  sessions: SessionOption[],
): number[] {
  const fromLabels = (repeatEvery || [])
    .map((label) => weekdayNames.indexOf(label))
    .filter((index) => index >= 0);
  if (fromLabels.length > 0) {
    return Array.from(new Set(fromLabels)).sort((a, b) => a - b);
  }
  return Array.from(new Set(sessions.map((s) => s.weekday))).sort((a, b) => a - b);
}

export function sessionIdsForWeekdays(
  sessions: SessionOption[],
  weekdays: number[],
): number[] {
  if (weekdays.length === 0) return [];
  const allowed = new Set(weekdays);
  return sessions.filter((s) => allowed.has(s.weekday)).map((s) => s.id);
}

export function lastSelectedIsoDate(
  sessions: SessionOption[],
  selectedIds: Set<number>,
): string | null {
  let latest: string | null = null;
  for (const session of sessions) {
    if (!selectedIds.has(session.id)) continue;
    if (latest === null || session.isoDate > latest) latest = session.isoDate;
  }
  return latest;
}
