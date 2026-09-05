import { differenceInCalendarDays } from "date-fns";
import type { organizationType } from "@/types/organization";

export const LONG_COURSE_DURATION_WARNING_DAYS = 30;

export function courseDurationCalendarDays(
  start: Date | null | undefined,
  end: Date | null | undefined,
): number | null {
  if (!start || !end) return null;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end < start) return null;
  return differenceInCalendarDays(end, start);
}

export function shouldWarnLongCourseDuration(
  tenant: Pick<organizationType, "warn_on_long_course_duration"> | null | undefined,
  start: Date | null | undefined,
  end: Date | null | undefined,
): boolean {
  if (!tenant?.warn_on_long_course_duration) return false;
  const days = courseDurationCalendarDays(start, end);
  return days != null && days > LONG_COURSE_DURATION_WARNING_DAYS;
}
