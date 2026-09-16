import { formatInTimeZone } from "date-fns-tz";

import { formatMyanmarDateline } from "./myanmar-date-format";
import { formatTimezoneAbbrev } from "./timezone-abbrev";

export type HomeDatetimeFormat = "12h" | "24h";

function formatDatelineClock(
  now: Date,
  timeZone: string,
  timeFormat: HomeDatetimeFormat,
): string {
  if (timeFormat === "24h") {
    return formatInTimeZone(now, timeZone, "HH:mm");
  }
  const raw = formatInTimeZone(now, timeZone, "h:mm");
  const period = formatInTimeZone(now, timeZone, "a").toLowerCase();
  return `${raw}${period}`;
}

export function formatHomeDatetimeLines(args: {
  now: Date;
  timeZone: string;
  timeFormat: HomeDatetimeFormat;
}): { gregorian: string; myanmar: string } {
  const { now, timeZone, timeFormat } = args;
  let tz = timeZone;
  try {
    formatInTimeZone(now, tz, "yyyy");
  } catch {
    tz = "UTC";
  }
  const datePart = formatInTimeZone(now, tz, "EEE d MMM yyyy");
  const clock = formatDatelineClock(now, tz, timeFormat);
  const abbrev = formatTimezoneAbbrev(tz);
  return {
    gregorian: `${datePart} · ${clock} ${abbrev}`,
    myanmar: formatMyanmarDateline(now, tz),
  };
}
