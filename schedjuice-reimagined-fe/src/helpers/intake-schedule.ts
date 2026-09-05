import { weekdayNames } from "@/components/calendar/types";
import { createDefaultSimpleValue } from "@/helpers/simple-schedule";
import {
  formatSessionTimeRange,
  isValidSessionTimeRange,
  validateSessionTimeRange,
} from "@/helpers/session-time";
import type { RecurringSlot } from "@/types/intake";

const WEEKDAY_ORDER = Object.fromEntries(
  weekdayNames.map((day, index) => [day, index]),
);

export function recurringSlotTimeError(
  slot: Pick<RecurringSlot, "time_from" | "time_to">,
): string | null {
  return validateSessionTimeRange(slot.time_from, slot.time_to);
}

export function isValidRecurringSlot(slot: RecurringSlot): boolean {
  return (
    weekdayNames.includes(slot.weekday) &&
    isValidSessionTimeRange(slot.time_from, slot.time_to)
  );
}

export function areRecurringSlotsValid(slots: RecurringSlot[]): boolean {
  const seen = new Set<string>();
  for (const slot of slots) {
    if (!isValidRecurringSlot(slot)) return false;
    const key = `${slot.weekday}|${slot.time_from}|${slot.time_to}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export function getEffectiveSlotsForRow(
  rowKey: string,
  defaultSlots: RecurringSlot[],
  slotOverrides?: Record<string, RecurringSlot[]>,
): RecurringSlot[] {
  if (slotOverrides && rowKey in slotOverrides) {
    return slotOverrides[rowKey] ?? [];
  }
  return defaultSlots ?? [];
}

export function hasNoRecurringSessions(slots: RecurringSlot[]): boolean {
  return slots.length === 0;
}

export function formatRecurringSlotsDisplay(slots: RecurringSlot[]): string {
  if (!slots.length) return "No sessions configured";
  return formatRecurringSlotsSummary(slots) ?? "No sessions configured";
}

export function countIncludedCoursesWithNoSessions(
  rowKeys: string[],
  excluded: Record<string, boolean>,
  defaultSlots: RecurringSlot[],
  slotOverrides?: Record<string, RecurringSlot[]>,
): number {
  return rowKeys.filter((key) => {
    if (excluded[key] === true) return false;
    const slots = getEffectiveSlotsForRow(key, defaultSlots, slotOverrides);
    return hasNoRecurringSessions(slots);
  }).length;
}

export function formatRecurringSlotsSummary(slots: RecurringSlot[]): string | null {
  if (!slots.length) return null;
  const weekdays = Array.from(new Set(slots.map((slot) => slot.weekday))).sort(
    (a, b) => (WEEKDAY_ORDER[a] ?? 0) - (WEEKDAY_ORDER[b] ?? 0),
  );
  const first = slots[0];
  const timeLabel = formatSessionTimeRange(
    first.time_from,
    first.time_to,
    formatTimeLabel,
  );
  const hasMultipleTimes = slots.some(
    (slot) =>
      slot.time_from !== first.time_from || slot.time_to !== first.time_to,
  );
  if (hasMultipleTimes) {
    return `${weekdays.join("/")} · ${slots.length} sessions`;
  }
  return `${weekdays.join("/")} ${timeLabel}`;
}

function formatTimeLabel(time: string): string {
  const [hours, minutes] = time.split(":");
  return `${hours}:${minutes ?? "00"}`;
}

export function createEmptyRecurringSlot(
  org?: {
    default_session_start_time?: string | null;
    default_session_duration_minutes?: number | null;
  } | null,
): RecurringSlot {
  const simple = createDefaultSimpleValue(org);
  return {
    weekday: "Mon",
    time_from: simple.time_from,
    time_to: simple.time_to,
  };
}
