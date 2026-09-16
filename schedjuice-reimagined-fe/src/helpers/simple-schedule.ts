import { weekdayNames } from "@/components/calendar/types";
import type { RecurringSlot } from "@/types/intake";

export const DEFAULT_SESSION_START = "19:00";
export const DEFAULT_SESSION_DURATION_MINUTES = 90;
export const WD_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu"] as const;
export const WE_WEEKDAYS = ["Sat", "Sun"] as const;

export type CourseTypeWdWe = "WD" | "WE";

export type SimpleScheduleValue = {
  weekdays: string[];
  time_from: string;
  time_to: string;
  course_type: CourseTypeWdWe | null;
};

export type OrgSessionDefaults = {
  default_session_start_time?: string | null;
  default_session_duration_minutes?: number | null;
};

const WEEKDAY_ORDER = Object.fromEntries(
  weekdayNames.map((day, index) => [day, index]),
);

export function timeStringToMinutesDuration(time: string): number {
  const [h, m] = (time || "0:0").split(":").map((x) => parseInt(x || "0", 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

export function normalizeTimeToHhMm(
  value: string | null | undefined,
): string {
  if (!value?.trim()) return "";
  const parts = value.trim().split(":");
  const hours = (parts[0] ?? "0").padStart(2, "0");
  const minutes = (parts[1] ?? "00").padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function addMinutesToHhMm(start: string, minutes: number): string {
  const normalized = normalizeTimeToHhMm(start);
  if (!normalized) return "";
  const total = timeStringToMinutesDuration(normalized) + minutes;
  const clamped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function resolveSessionDefaults(org?: OrgSessionDefaults | null): {
  time_from: string;
  time_to: string;
  durationMinutes: number;
} {
  const rawDuration = org?.default_session_duration_minutes;
  const durationMinutes =
    typeof rawDuration === "number" &&
    Number.isFinite(rawDuration) &&
    rawDuration > 0
      ? Math.floor(rawDuration)
      : DEFAULT_SESSION_DURATION_MINUTES;

  const normalizedStart = normalizeTimeToHhMm(org?.default_session_start_time);
  const time_from = normalizedStart || DEFAULT_SESSION_START;
  const time_to = addMinutesToHhMm(time_from, durationMinutes);

  return { time_from, time_to, durationMinutes };
}

export function orgUsesWdWeNomenclature(
  enabled: boolean | null | undefined,
): boolean {
  return enabled === true;
}

export function weekdaysForCourseType(type: CourseTypeWdWe): string[] {
  return type === "WD" ? [...WD_WEEKDAYS] : [...WE_WEEKDAYS];
}

function sortedUniqueWeekdays(weekdays: string[]): string[] {
  return Array.from(new Set(weekdays.filter((d) => weekdayNames.includes(d)))).sort(
    (a, b) => (WEEKDAY_ORDER[a] ?? 0) - (WEEKDAY_ORDER[b] ?? 0),
  );
}

function sameWeekdaySet(a: string[], b: readonly string[]): boolean {
  const left = sortedUniqueWeekdays(a);
  const right = sortedUniqueWeekdays([...b]);
  if (left.length !== right.length) return false;
  return left.every((day, i) => day === right[i]);
}

export function courseTypeForWeekdays(
  weekdays: string[],
): CourseTypeWdWe | null {
  if (sameWeekdaySet(weekdays, WD_WEEKDAYS)) return "WD";
  if (sameWeekdaySet(weekdays, WE_WEEKDAYS)) return "WE";
  return null;
}

export function simpleValueToSlots(value: SimpleScheduleValue): RecurringSlot[] {
  const time_from = normalizeTimeToHhMm(value.time_from);
  const time_to = normalizeTimeToHhMm(value.time_to);
  return sortedUniqueWeekdays(value.weekdays).map((weekday) => ({
    weekday,
    time_from,
    time_to,
  }));
}

export function slotsToSimpleValue(
  slots: RecurringSlot[],
): SimpleScheduleValue | null {
  if (!slots.length) {
    return {
      weekdays: [],
      time_from: "",
      time_to: "",
      course_type: null,
    };
  }

  const first = slots[0];
  const time_from = normalizeTimeToHhMm(first.time_from);
  const time_to = normalizeTimeToHhMm(first.time_to);
  const uniform = slots.every(
    (slot) =>
      normalizeTimeToHhMm(slot.time_from) === time_from &&
      normalizeTimeToHhMm(slot.time_to) === time_to,
  );
  if (!uniform) return null;

  const weekdays = sortedUniqueWeekdays(slots.map((slot) => slot.weekday));
  return {
    weekdays,
    time_from,
    time_to,
    course_type: courseTypeForWeekdays(weekdays),
  };
}

export function canCollapseSlotsToSimple(
  slots: RecurringSlot[],
  useWdWe: boolean,
): boolean {
  if (!slots.length) return true;
  const simple = slotsToSimpleValue(slots);
  if (!simple || !simple.weekdays.length) return false;
  if (!useWdWe) return true;
  return simple.course_type === "WD" || simple.course_type === "WE";
}

export function createDefaultSimpleValue(
  org?: OrgSessionDefaults | null,
): SimpleScheduleValue {
  const defaults = resolveSessionDefaults(org);
  return {
    weekdays: [],
    time_from: defaults.time_from,
    time_to: defaults.time_to,
    course_type: null,
  };
}
