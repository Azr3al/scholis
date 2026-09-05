import { differenceInCalendarDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

import { addCalendarDaysToTenantYmd } from "@/helpers/shortcuts-time";

export type FeedTimestampFormatters = {
  time: { format: (d: Date) => string };
  weekday: { format: (d: Date) => string };
  monthDay: { format: (d: Date) => string };
  fullDate: { format: (d: Date) => string };
};

export function formatFeedPostTimestamp(
  iso: string,
  timezone: string,
  formatters: FeedTimestampFormatters,
  now: Date = new Date(),
): string {
  const date = new Date(iso);
  const ymd = formatInTimeZone(date, timezone, "yyyy-MM-dd");
  const todayYmd = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  const time = formatters.time.format(date);

  if (ymd === todayYmd) return time;

  const yesterday = addCalendarDaysToTenantYmd(todayYmd, timezone, -1);
  if (ymd === yesterday) return `Yesterday ${time}`;

  const dayDiff = differenceInCalendarDays(
    new Date(`${todayYmd}T12:00:00`),
    new Date(`${ymd}T12:00:00`),
  );
  if (dayDiff > 0 && dayDiff <= 7) {
    return `${formatters.weekday.format(date)} ${time}`;
  }

  const postYear = formatInTimeZone(date, timezone, "yyyy");
  const nowYear = formatInTimeZone(now, timezone, "yyyy");
  if (postYear === nowYear) {
    return `${formatters.monthDay.format(date)} · ${time}`;
  }
  return `${formatters.fullDate.format(date)} · ${time}`;
}
