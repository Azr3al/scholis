import { format, parseISO } from "date-fns";
import {
  courseIdFromProfileEvent,
  eventDateToTenantCalendarDay,
  getTenantTodayDateString,
  profileEventDisplayTitle,
  type ProfileCalendarEventLike,
} from "@/helpers/user-profile";
import { formatSessionClock } from "@/helpers/date";
import type { TimeDisplayFormatValue } from "@/helpers/time-format";

export type UpcomingSessionRow = {
  courseId: number;
  courseTitle: string;
  calendarDay: string;
  timeFrom: string | null;
  timeTo: string | null;
  sortKey: string;
  label: string;
};

function normalizeTime(t: unknown): string | null {
  if (t == null || typeof t !== "string") return null;
  const x = t.trim();
  return x.length >= 5 ? x : null;
}

function eventSortKey(calendarDay: string, timeFrom: string | null): string {
  return `${calendarDay}T${timeFrom ?? "00:00:00"}`;
}

export function getUpcomingSessions(
  events: ProfileCalendarEventLike[],
  tenantTimezone?: string | null,
  limit = 7,
  timeDisplayFormat: TimeDisplayFormatValue = "12h",
): UpcomingSessionRow[] {
  const today = getTenantTodayDateString(tenantTimezone);
  const rows: UpcomingSessionRow[] = [];

  for (const event of events) {
    const courseId = courseIdFromProfileEvent(event);
    if (courseId == null) continue;
    const calendarDay = eventDateToTenantCalendarDay(
      typeof event.date === "string" ? event.date : String(event.date ?? ""),
      tenantTimezone,
    );
    if (!calendarDay || calendarDay < today) continue;

    const timeFrom = normalizeTime(event.time_from);
    const timeTo = normalizeTime(event.time_to);
    const courseTitle = profileEventDisplayTitle(event, "Course");

    const dayLabel = format(parseISO(`${calendarDay}T12:00:00`), "EEE");
    const timeLabel =
      timeFrom && timeTo
        ? `${formatSessionClock(timeFrom, timeDisplayFormat)}–${formatSessionClock(timeTo, timeDisplayFormat)}`
        : null;
    const label = timeLabel ? `${dayLabel} ${timeLabel}` : dayLabel;

    rows.push({
      courseId,
      courseTitle,
      calendarDay,
      timeFrom,
      timeTo,
      sortKey: eventSortKey(calendarDay, timeFrom),
      label,
    });
  }

  rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return rows.slice(0, limit);
}

export function nextSessionLabelForCourse(
  courseId: number,
  events: ProfileCalendarEventLike[],
  tenantTimezone?: string | null,
  precomputed?: Map<number, string>,
  timeDisplayFormat: TimeDisplayFormatValue = "12h",
): string | null {
  if (precomputed) return precomputed.get(courseId) ?? null;
  const upcoming = getUpcomingSessions(
    events,
    tenantTimezone,
    50,
    timeDisplayFormat,
  );
  const match = upcoming.find((row) => row.courseId === courseId);
  return match?.label ?? null;
}

export function filterEventsByCourseIds(
  events: ProfileCalendarEventLike[],
  courseIds: number[],
): ProfileCalendarEventLike[] {
  if (!courseIds.length) return events;
  const allowed = new Set(courseIds);
  return events.filter((event) => {
    const cid = courseIdFromProfileEvent(event);
    return cid != null && allowed.has(cid);
  });
}
