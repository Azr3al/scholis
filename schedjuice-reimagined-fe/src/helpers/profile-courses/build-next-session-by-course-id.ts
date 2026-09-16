import { getUpcomingSessions } from "@/helpers/record-academic/calendar-sessions";
import type { TimeDisplayFormatValue } from "@/helpers/time-format";
import type { ProfileCalendarEventLike } from "@/helpers/user-profile";

export function buildNextSessionByCourseId(
  events: ProfileCalendarEventLike[],
  tenantTimezone?: string | null,
  timeDisplayFormat: TimeDisplayFormatValue = "12h",
): Map<number, string> {
  const upcoming = getUpcomingSessions(
    events,
    tenantTimezone,
    500,
    timeDisplayFormat,
  );
  const map = new Map<number, string>();
  for (const row of upcoming) {
    if (!map.has(row.courseId)) {
      map.set(row.courseId, row.label);
    }
  }
  return map;
}
