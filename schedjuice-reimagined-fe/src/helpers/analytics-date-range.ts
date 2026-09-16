import { getDateISOString } from "@/helpers/date";
import { endOfDay, startOfDay, subDays, subMonths } from "date-fns";

export const ANALYTICS_PRESET_IDS = [
  "last_week",
  "last_month",
  "last_three_months",
  "lifetime",
  "custom",
] as const;

export type AnalyticsPreset = (typeof ANALYTICS_PRESET_IDS)[number];

export const ANALYTICS_PRESET_LABELS: Record<AnalyticsPreset, string> = {
  last_week: "Last week",
  last_month: "Last month",
  last_three_months: "Last 3 months",
  lifetime: "Lifetime",
  custom: "Custom",
};

export function resolveAnalyticsDateRange(
  preset: AnalyticsPreset,
  customFrom: string | null,
  customTo: string | null,
): { start: string; end: string } | null {
  const now = new Date();
  const end = getDateISOString(endOfDay(now));
  switch (preset) {
    case "last_week": {
      const s = getDateISOString(startOfDay(subDays(now, 7)));
      return { start: s, end };
    }
    case "last_month": {
      const s = getDateISOString(startOfDay(subDays(now, 30)));
      return { start: s, end };
    }
    case "last_three_months": {
      const s = getDateISOString(startOfDay(subMonths(now, 3)));
      return { start: s, end };
    }
    case "lifetime": {
      return { start: "2010-01-01", end: getDateISOString(endOfDay(now)) };
    }
    case "custom": {
      if (!customFrom || !customTo) {
        return null;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(customFrom)) {
        return null;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(customTo)) {
        return null;
      }
      if (customFrom > customTo) {
        return null;
      }
      return { start: customFrom, end: customTo };
    }
    default:
      return null;
  }
}
