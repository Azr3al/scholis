import { formatSessionClock } from "@/helpers/date";
import type { CourseScheduleLike } from "@/helpers/course-identity/schedule-pattern";
import { convertTimePatternToUserTimezone } from "@/helpers/timeslot";
import {
  orgTimeDateFnsPattern,
  type TimeDisplayFormatValue,
} from "@/helpers/time-format";
import type { courseType } from "@/types/course";

type CheckinCurrentEvent = {
  event?: { time_from?: string; time_to?: string };
};

export type CourseScheduleClockCourse = Pick<
  courseType,
  "nearest_event_time_from" | "nearest_event_time_to"
> &
  CourseScheduleLike;

export function resolveCourseScheduleClockDisplay(
  course: CourseScheduleClockCourse,
  currentEvent: unknown,
  showCheckin: boolean,
  tenantTimezone: string | undefined,
  timeFormat: TimeDisplayFormatValue,
): { label: string } | null {
  if (showCheckin) {
    const event = (currentEvent as CheckinCurrentEvent | undefined)?.event;
    if (event?.time_from && event?.time_to) {
      return {
        label: `${formatSessionClock(event.time_from, timeFormat)} – ${formatSessionClock(event.time_to, timeFormat)}`,
      };
    }
  }

  const timePattern = course.time_pattern?.trim();
  if (timePattern) {
    return {
      label: convertTimePatternToUserTimezone(
        timePattern,
        tenantTimezone,
        orgTimeDateFnsPattern(timeFormat),
      ),
    };
  }

  if (course.nearest_event_time_from && course.nearest_event_time_to) {
    return {
      label: `${formatSessionClock(course.nearest_event_time_from, timeFormat)} – ${formatSessionClock(course.nearest_event_time_to, timeFormat)}`,
    };
  }

  return null;
}
