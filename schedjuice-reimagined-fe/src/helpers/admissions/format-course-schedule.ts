import { formatSessionClock } from "@/helpers/date";
import {
  convertTimePatternToUserTimezone,
  convertWeekdayPatternToUserTimezone,
} from "@/helpers/timeslot";
import {
  orgTimeDateFnsPattern,
  resolveTimeDisplayFormat,
} from "@/helpers/time-format";

export type AdmissionsCourseScheduleFields = {
  weekday_pattern?: string | null;
  time_pattern?: string | null;
  first_event_time_from?: string | null;
  first_event_time_to?: string | null;
};

export function formatAdmissionsCourseSchedule(
  row: AdmissionsCourseScheduleFields,
  timezone: string | undefined,
  timeFormat: ReturnType<typeof resolveTimeDisplayFormat>,
): string {
  const weekday = row.weekday_pattern
    ? convertWeekdayPatternToUserTimezone(row.weekday_pattern, timezone)
    : "";
  const clock =
    row.first_event_time_from && row.first_event_time_to
      ? `${formatSessionClock(row.first_event_time_from, timeFormat)} – ${formatSessionClock(row.first_event_time_to, timeFormat)}`
      : row.time_pattern
        ? convertTimePatternToUserTimezone(
            row.time_pattern,
            timezone,
            orgTimeDateFnsPattern(timeFormat),
          )
        : "";
  return [weekday, clock].filter(Boolean).join(" ") || "—";
}
