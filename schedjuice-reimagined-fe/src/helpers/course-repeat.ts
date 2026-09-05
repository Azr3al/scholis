import { differenceInWeeks } from "date-fns";

const ISO_WEEKDAY_SHORT = [
  "",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

/** Human-readable weekday list from `repeat_every` (1–7 = Mon–Sun), same as shortcut starting cards. */
export function formatRepeatEverySummary(
  repeatEvery: string[] | null | undefined,
): string | null {
  if (!repeatEvery?.length) return null;
  const labels = repeatEvery
    .map((d) => {
      const n = parseInt(d, 10);
      return n >= 1 && n <= 7 ? ISO_WEEKDAY_SHORT[n] : d;
    })
    .filter(Boolean);
  return labels.length ? labels.join(", ") : null;
}

/** Weekly schedule label for course headers (alias of `formatRepeatEverySummary`). */
export function formatCourseWeeklySchedule(
  repeatEvery: string[] | null | undefined,
): string | null {
  return formatRepeatEverySummary(repeatEvery);
}

/** Week count used on course list cards (`Math.max(1, ceil(differenceInWeeks))`). */
export function getCourseListWeekCount(start: Date, end: Date): number {
  return Math.max(1, Math.ceil(differenceInWeeks(end, start)));
}
