import {
  addWeeks,
  differenceInMonths,
  differenceInMilliseconds,
  endOfWeek,
  format,
  getDaysInMonth as getDaysInMonthFn,
  isAfter,
  isBefore,
  parse,
  isValid,
  startOfWeek,
  sub,
  subYears,
} from "date-fns";
import { isSabbath } from "mm-cal-js";
import { useForm, UseFormReturn } from "react-hook-form";
import { z } from "zod";

import { Time } from "@internationalized/date";
import { TimeValue } from "react-aria";
import { getObjectFormSchema } from "@/components/auto-form";
import { partiallyOmittedCourseSchema } from "@/types/course";
import { accountType } from "@/types/user";
import { getTimezoneOffset } from "./timeslot";
import { filterParam, operatorEnum } from "@/types/api";
import { getOrdinalSuffix } from "./number";
import {
  formatOrgTime,
  resolveTimeDisplayFormat,
  type TimeDisplayFormatValue,
} from "@/helpers/time-format";

/** Numeric day title for shortcuts (e.g. 3.4.2026). */
export const formatClassesShortcutDayTitle = (ymd: string): string => {
  try {
    const parsed = parse(ymd, "yyyy-MM-dd", new Date());
    if (!isValid(parsed)) return ymd;
    return format(parsed, "d.M.yyyy");
  } catch {
    return ymd;
  }
};

export const formatDate = (
  dateString: string | Date,
  formatString = "MMM do yyyy"
) => {
  try {
    const date =
      typeof dateString === "string" ? new Date(dateString) : dateString;
    return format(date, formatString);
  } catch (error) {
    // Return original string if parsing fails
    return String(dateString);
  }
};

export const formatDateRange = (
  from: string,
  to: string,
  formatString = "MMM d, yyyy",
) => {
  if (from === to) {
    return formatDate(from, formatString);
  }
  const fromLabel = formatDate(from, "MMM d");
  const toLabel = formatDate(to, formatString);
  return `${fromLabel} – ${toLabel}`;
};

export const formatTime = (timeString: string) => {
  // Handle cases where timeString might already be a full datetime
  const date = timeString.includes("T")
    ? new Date(timeString)
    : new Date(`2000-01-01T${timeString}`);
  return format(date, "HH:mm");
};

export const formatDateTime = (dateString: string | Date) => {
  try {
    const date =
      typeof dateString === "string" ? new Date(dateString) : dateString;
    return format(date, "MMMM do yyyy HH:mm");
  } catch (error) {
    // Return original string if parsing fails
    return String(dateString);
  }
};

export const formatRelativeTime = (dateString: string | Date): string => {
  const date =
    typeof dateString === "string" ? new Date(dateString) : dateString;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;
  return date.toLocaleDateString();
};

export const formateEventTime = (
  timeString: string,
  format: TimeDisplayFormatValue = "12h",
) => formatOrgTime(timeString, resolveTimeDisplayFormat(format));

/** API times may be `HH:mm` or `HH:mm:ss` — for session clock labels (cards, shortcuts). */
export function formatSessionClock(
  raw: string,
  format: TimeDisplayFormatValue = "12h",
) {
  const t = raw.trim();
  if (!t) return "—";
  return formatOrgTime(t, resolveTimeDisplayFormat(format));
}

export const getDaysInMonth = (month: number, year: number) => {
  let date = new Date(year, month, 1);
  let days = [];
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

export const getDateISOString = (date: Date) => {
  date = new Date(date);
  return `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
};

export const toISODateString = (
  input: string | Date | null | undefined
): string => {
  if (input == null) return "";

  if (input instanceof Date && !isNaN(input.getTime())) {
    return getDateISOString(input);
  }

  if (typeof input === "string") {
    const directParsedDate = new Date(input);
    if (!isNaN(directParsedDate.getTime())) {
      return getDateISOString(directParsedDate);
    }
    // Fallback incase the input doesn't match; will try all supported date formats
    for (const formatPattern of DateFormats) {
      const parsedDate = parse(input, formatPattern, new Date());
      if (isValid(parsedDate)) {
        return getDateISOString(parsedDate);
      }
    }
  }
  return String(input);
};

export const MONTH_TYPE_FM = "FM";
export const MONTH_TYPE_HM = "HM";
export type MonthType = typeof MONTH_TYPE_FM | typeof MONTH_TYPE_HM;

/** Determine month type from course start_date: day < 10 -> FM (full-month), else HM (half-month) */
export const getCourseMonthType = (startDate: string | Date): MonthType =>
  (typeof startDate === "string" ? new Date(startDate) : startDate).getDate() < 10
    ? MONTH_TYPE_FM
    : MONTH_TYPE_HM;

/** School-facing labels for month-type grouping (same rule as getCourseMonthType). */
export const COURSE_START_TIMING_LABEL_EARLY = "Full month";
export const COURSE_START_TIMING_LABEL_LATER = "Half month";

export function formatCourseMonthTypeLabel(startDate: string | Date): string {
  return getCourseMonthType(startDate) === MONTH_TYPE_FM
    ? COURSE_START_TIMING_LABEL_EARLY
    : COURSE_START_TIMING_LABEL_LATER;
}

export const DateFormats: string[] = [
  "yyyy-MM-dd",
  "yyyy/MM/dd",
  "MM/dd/yyyy",
  "M/d/yyyy",
  "dd/MM/yyyy",
  "d/M/yyyy",
  "dd-MM-yyyy",
  "MM-dd-yyyy",
  "MMM d, yyyy",
  "MMM d yyyy",
  "d MMM yyyy",
];

//detect date format sample dates and return the first format found; null if input is already a date
export const detectDateFormat = (
  dateSamples: Array<string | Date | null | undefined>
): string | null => {
  for (const sample of dateSamples) {
    if (sample == null) continue;
    if (sample instanceof Date && !isNaN(sample.getTime())) {
      return null;
    }
    if (typeof sample === "string" && sample.trim().length > 0) {
      for (const formatpattern of DateFormats) {
        const parsedDate = parse(sample, formatpattern, new Date());
        if (isValid(parsedDate)) {
          return formatpattern;
        }
      }
    }
  }
  return null;
};
// normalize date to ISO
export const normalizeDateUsingFormat = (
  input: string | Date | null | undefined,
  finalFormat: string | null | undefined
): string => {
  if (input == null) return "";
  if (finalFormat && typeof input === "string" && input.trim().length > 0) {
    const parsedDate = parse(input, finalFormat, new Date());
    if (isValid(parsedDate)) {
      return getDateISOString(parsedDate);
    }
  }
  // Return original string if parsing fails
  return toISODateString(input);
};

export const cleanDatesForBackend = (obj: any, dateKeys: string[]) => {
  Object.keys(obj).map((k) => {
    if (dateKeys.includes(k) && obj[k]) {
      obj[k] = getDateISOString(obj[k]);
    }
  });
  return obj;
};
export const sortEvents = (eventATimeFrom: string, eventBTimeFrom: string) => {
  return (eventATimeFrom &&
    eventBTimeFrom &&
    Number(eventATimeFrom.replaceAll(":", "")) -
    Number(eventBTimeFrom.replaceAll(":", ""))) as number;
};

export const dateToTimeValue = (date: string | Date) => {
  if (typeof date === "string" || date instanceof String) {
    date = new Date(date);
  }
  return stringToTimeValue(date.toTimeString());
};

export const stringToTimeValue = (timeString: string) => {
  if (!timeString) return new Time(0, 0);
  const [h, m] = timeString.split(":").map(Number);
  return new Time(h ?? 0, m ?? 0);
};

export const timeValueToString = (timeValue: TimeValue) => {
  if (!timeValue) return "00:00";
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${pad2(timeValue.hour)}:${pad2(timeValue.minute)}`;
};

export const secondsToHHmmss = (seconds: number) => {
  return new Date(seconds * 1000).toISOString().slice(11, 19);
};

export const calculateDifference = (date1: Date, date2: Date) => {
  const milliseconds = differenceInMilliseconds(date2, date1);
  const seconds = Math.abs(Math.ceil((milliseconds / 1000) % 60));
  const minutes = Math.abs(Math.ceil((milliseconds / 1000 / 60) % 60));
  const hours = Math.abs(Math.ceil((milliseconds / 1000 / 60 / 60) % 24));
  const days = Math.ceil(Math.abs(milliseconds / 1000 / 60 / 60 / 24));
  return {
    days,
    hours,
    minutes,
    seconds,
    milliseconds: Math.abs(milliseconds % 1000),
  };
};

export const getSundaysAndSabbathDaysOfMonth = (
  year: number,
  month: number
) => {
  const sundaysAndSabbathDays: number[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(year, month, i);
    if (date.getDay() === 0 || isSabbath(date) === 1) {
      sundaysAndSabbathDays.push(i);
    }
  }
  return sundaysAndSabbathDays;
};

export const formatEventDay = (day: Date) => {
  if (typeof window !== "undefined") {
    // If the screen width is small (e.g., mobile)
    const isMobile = window.innerWidth <= 768;
    return format(day, isMobile ? "EEE" : "EEEE");
  }

  // Default to desktop format when server-side rendering
  return format(day, "EEEE");
};

export const convert12hourTo24hour = (hour: number) => {
  const amPm = hour >= 12 ? "PM" : "AM";
  const hour24 = hour > 12 ? hour - 12 : hour;
  return `${hour24}:00 ${amPm}`;
};

export function formatForCalendarCell(input: string | Date) {
  const d = typeof input === "string" ? new Date(input) : input;
  return {
    day: format(d, "d"), // 4
    weekdayShort: format(d, "EEE"), // Sat
    weekdayLong: format(d, "EEEE"),
  };
}
const objectFormSchema = getObjectFormSchema(partiallyOmittedCourseSchema);

export const showCourseDuration = (
  form: UseFormReturn<z.infer<typeof objectFormSchema>>
) => {
  const startDate = form.getValues("start_date");
  const endDate = form.getValues("end_date");

  return `${format(new Date(startDate), "PP")} → ${format(
    new Date(endDate),
    "PP"
  )}`;
};

export const getTodayISO = (): string => {
  return getDateISOString(new Date());
};

export const combineDateAndTime = (
  date: string,
  time: string | null | undefined
): string | null => {
  if (!time || time.trim() === "") return null;
  return `${date}T${time}:00`;
};

export const getUserTimezoneInfo = () => {
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezoneOffset = getTimezoneOffset(userTimezone);

  return {
    timezone: userTimezone,
    offset: timezoneOffset,
    full: `${userTimezone} (${timezoneOffset})`,
  };
};

export const getFirstDayOfMonth = (date: Date) => {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0);
};
export const getLastDayOfMonth = (date: Date) => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
};

/**
 * Month-window bounds for API datetime filters (issued_at / billing_start_date / billing_end_date).
 *
 * Anchored at **noon UTC** on the first and last calendar day of the month picked by the user
 * (using `monthAnchor.getFullYear()` / `.getMonth()`). Using noon keeps `toISOString()` inside the
 * same UTC calendar month regardless of browser timezone offset.
 *
 * Finance search endpoints (e.g. UserPayment admin report) derive the report month from `gte`
 * only and read its UTC calendar parts, so local midnight + `.toISOString()` would roll the
 * month backward in zones ahead of UTC and hide matching payments.
 */
export const getCalendarMonthUtcFilterBounds = (
  monthAnchor: Date,
): { start: Date; end: Date } => {
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  return {
    start: new Date(Date.UTC(year, month, 1, 12, 0, 0, 0)),
    end: new Date(Date.UTC(year, month + 1, 0, 12, 0, 0, 0)),
  };
};

/** Monday–Sunday ISO weeks that overlap the calendar month of `monthAnchor`. */
export function getIsoWeeksOverlappingMonth(monthAnchor: Date): {
  monday: Date;
  label: string;
}[] {
  const firstDay = getFirstDayOfMonth(monthAnchor);
  const lastDay = getLastDayOfMonth(monthAnchor);
  let monday = startOfWeek(firstDay, { weekStartsOn: 1 });
  const out: { monday: Date; label: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const weekEnd = endOfWeek(monday, { weekStartsOn: 1 });
    if (isBefore(weekEnd, firstDay)) {
      monday = addWeeks(monday, 1);
      continue;
    }
    if (isAfter(monday, lastDay)) break;
    out.push({
      monday: new Date(monday),
      label: `${format(monday, "d MMM")} – ${format(weekEnd, "d MMM")}`,
    });
    monday = addWeeks(monday, 1);
  }
  return out;
}

/** Inclusive calendar range (yyyy-MM-dd) for the ISO week containing `anchorInWeek` (Mon–Sun, weekStartsOn 1). */
export function getIsoWeekRangeBounds(anchorInWeek: Date): {
  startIso: string;
  endIso: string;
} {
  const s = startOfWeek(anchorInWeek, { weekStartsOn: 1 });
  const e = endOfWeek(anchorInWeek, { weekStartsOn: 1 });
  return { startIso: getDateISOString(s), endIso: getDateISOString(e) };
}

/** Planned + active + recently ended (30-day end grace). No start_date cap. */
export const getActiveCourseFilterParams = () => {
  const fParams: filterParam[] = [
    {
      field_name: "end_date",
      operator: operatorEnum.gte,
      value: getDateISOString(sub(new Date(), { days: 30 })) // grace period
    }
  ]
  return fParams
}
export const diffInMonths = (startDate: Date, endDate: Date) => {
  const yearDiff = endDate.getFullYear() - startDate.getFullYear();
  const monthDiff = endDate.getMonth() - startDate.getMonth();

  return yearDiff * 12 + monthDiff + 1; 
};


export const getOrdinalMonth = (startDate: Date, targetDate: Date) => {
  return getOrdinalSuffix(
    diffInMonths(
      new Date(startDate.getFullYear(), startDate.getMonth(), 1),
      new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
    )
  );
};

/**
 * Format exam_session_date (ISO 8601 UTC) as month only in org timezone (e.g. "June 2025").
 */
/** Default calendar focus for date-of-birth pickers — opens N years before today. */
export function birthdayFocusDate(yearsAgo = 20): Date {
  return subYears(new Date(), yearsAgo);
}

export const formatExamIntakeMonth = (
  isoString: string | null | undefined,
  timezone?: string
): string => {
  if (isoString == null || isoString === "") return "-";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: timezone ?? "UTC",
    }).format(date);
  } catch {
    return "-";
  }
};
