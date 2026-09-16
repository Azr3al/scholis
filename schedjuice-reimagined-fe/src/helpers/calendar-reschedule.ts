import {
  findOverlapClusters,
  hasOverlappingEventsInFlatList,
  isPersistedEventId,
  type OverlapCheckOptions,
} from "@/helpers/calendar";
import { validateSessionTimeRange } from "@/helpers/session-time";
import { eventType } from "@/types/course";

/** Non-survivor members of each cluster (earliest time_from kept). */
export function conflictIdsToReschedule(
  flatEvents: Partial<eventType>[],
  options?: OverlapCheckOptions
): Array<eventType["id"]> {
  const clusters = findOverlapClusters(flatEvents, options);
  const ids: Array<eventType["id"]> = [];
  for (const cluster of clusters) {
    const ordered = [...cluster].sort(
      (a, b) =>
        String(a.time_from || "").localeCompare(String(b.time_from || "")) ||
        String(a.id ?? "").localeCompare(String(b.id ?? ""))
    );
    for (const event of ordered.slice(1)) {
      if (event.id != null) ids.push(event.id);
    }
  }
  return ids;
}

export function applySharedTimesToEvents(
  flatEvents: Partial<eventType>[],
  eventIds: Array<eventType["id"]>,
  time_from: string,
  time_to: string
): Partial<eventType>[] {
  const idSet = new Set(eventIds.map(String));
  return flatEvents.map((event) => {
    if (event.id == null || !idSet.has(String(event.id))) {
      return event;
    }
    return {
      ...event,
      time_from,
      time_to,
      ...(isPersistedEventId(event.id) ? { is_edit: true } : {}),
    };
  });
}

export function rescheduleClearsOverlaps(
  flatEvents: Partial<eventType>[],
  options?: OverlapCheckOptions
): boolean {
  return !hasOverlappingEventsInFlatList(flatEvents, options);
}

export function validateRescheduleTimes(
  time_from: string | null | undefined,
  time_to: string | null | undefined
): string | null {
  return validateSessionTimeRange(time_from, time_to);
}
