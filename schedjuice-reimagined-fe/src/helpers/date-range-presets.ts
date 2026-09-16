import { getDateISOString } from "@/helpers/date";
import {
  endOfDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";

export const DATE_RANGE_PRESET_IDS = [
  "today",
  "week",
  "month",
  "last30d",
  "last3m",
  "custom",
] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESET_IDS)[number];

export function isDateRangePreset(s: string | null): s is DateRangePreset {
  return s != null && (DATE_RANGE_PRESET_IDS as readonly string[]).includes(s);
}

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  last30d: "Last 30 days",
  last3m: "Last 3 months",
  custom: "Custom",
};

/** Monday-based week (ISO-style), same as login activity. */
export function resolveDateRange(
  preset: DateRangePreset,
  customFrom: string | null,
  customTo: string | null,
): { start: string; end: string } | null {
  const now = new Date();
  const end = getDateISOString(endOfDay(now));
  switch (preset) {
    case "today": {
      const s = getDateISOString(startOfDay(now));
      return { start: s, end: s };
    }
    case "week": {
      const s = getDateISOString(startOfWeek(now, { weekStartsOn: 1 }));
      return { start: s, end };
    }
    case "month": {
      const s = getDateISOString(startOfMonth(now));
      return { start: s, end };
    }
    case "last30d": {
      const s = getDateISOString(startOfDay(subDays(now, 30)));
      return { start: s, end };
    }
    case "last3m": {
      const s = getDateISOString(startOfDay(subMonths(now, 3)));
      return { start: s, end };
    }
    case "custom": {
      if (
        !customFrom ||
        !customTo ||
        !/^\d{4}-\d{2}-\d{2}$/.test(customFrom) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(customTo)
      ) {
        return null;
      }
      if (customFrom > customTo) return null;
      return { start: customFrom, end: customTo };
    }
    default:
      return null;
  }
}
