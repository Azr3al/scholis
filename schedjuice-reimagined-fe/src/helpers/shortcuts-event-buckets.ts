import { eventInstantInTimezone } from "@/helpers/shortcuts-time";

/** Buckets for classifying a session relative to "now" in a tenant timezone. */
export enum ShortcutEventBucket {
  InProgress = "in_progress",
  Upcoming = "upcoming",
  Completed = "completed",
}

/** Minimal event shape for time bucketing (Today's classes, user schedule lookup, etc.). */
export type ShortcutEventLike = {
  date: string;
  time_from: string;
  time_to: string;
};

export function classifyEvent(
  ev: ShortcutEventLike,
  now: Date,
  tz: string,
): ShortcutEventBucket | null {
  const start = eventInstantInTimezone(ev.date, ev.time_from, tz);
  const end = eventInstantInTimezone(ev.date, ev.time_to, tz);
  if (!start || !end) return null;
  if (now >= start && now <= end) return ShortcutEventBucket.InProgress;
  if (now < start) return ShortcutEventBucket.Upcoming;
  return ShortcutEventBucket.Completed;
}

export function groupByTimeFrom<T extends { time_from: string }>(
  events: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const ev of events) {
    const key = (ev.time_from || "").trim().slice(0, 8) || "—";
    const list = map.get(key) ?? [];
    list.push(ev);
    map.set(key, list);
  }
  return map;
}
