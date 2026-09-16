import { weekdayNames } from "@/components/calendar/types";
import { eventType } from "@/types/course";
import { getDateISOString, toISODateString } from "./date";
import { v4 as uuid } from "uuid";
import { isSabbath } from "mm-cal-js";
import { convertEventDateToUserTimezone, toUtcFromTenant } from "./timeslot";
import {
  eventBoundsUtc,
  eventsOverlapUtc,
  isOvernightSession,
  overnightEndIsoDate,
} from "./session-time";
export type FormattedEvents = { [date: string]: Partial<eventType>[] };

export const EVENT_OVERLAP_ERROR =
  "This session overlaps with another session on the same day.";

export const SAVE_OVERLAP_ERROR =
  "Sessions cannot overlap on the same day. Use Fix or Replace before saving.";

export type OverlapCheckOptions = {
  orgTimezone?: string;
  now?: Date;
  /** Default true when orgTimezone is set; false when unset (keeps unit tests stable). */
  ignorePast?: boolean;
};

export function recurringOverlapError(isoDate: string): string {
  return `Recurring sessions cannot be added because they overlap with existing sessions on ${isoDate}.`;
}

function shouldIgnorePast(options?: OverlapCheckOptions): boolean {
  if (!options?.orgTimezone) return false;
  return options.ignorePast !== false;
}

export function isPastEvent(
  event: Partial<eventType>,
  orgTimezone: string,
  now: Date = new Date()
): boolean {
  const dateRaw = event.date as string | Date | undefined;
  if (!dateRaw || !event.time_to) return false;
  const dateStr =
    typeof dateRaw === "string"
      ? dateRaw.split("T")[0]
      : toISODateString(dateRaw);
  if (!dateStr) return false;
  const endDate =
    event.time_from &&
    isOvernightSession(event.time_from, event.time_to)
      ? overnightEndIsoDate(dateStr)
      : dateStr;
  const endUtc = toUtcFromTenant(endDate, event.time_to, orgTimezone);
  return endUtc.getTime() < now.getTime();
}

/** True if the formatted calendar map has at least one non-deleted event. */
export function hasAnyUndeletedEvents(events: FormattedEvents): boolean {
  return Object.values(events).some((list) =>
    (list || []).some((e) => !e.is_deleted)
  );
}

const timeStringToMinutes = (time: string) => {
  const [h, m] = (time || "0:0").split(":").map((x) => parseInt(x || "0", 10));
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Intervals overlap when startA < endB && endA > startB (back-to-back allowed). Same-day clock times only. */
export function timeRangesOverlap(
  time_from: string,
  time_to: string,
  other_from: string,
  other_to: string
): boolean {
  const aStart = timeStringToMinutes(time_from);
  const aEnd = timeStringToMinutes(time_to);
  const bStart = timeStringToMinutes(other_from);
  const bEnd = timeStringToMinutes(other_to);
  return aStart < bEnd && aEnd > bStart;
}

function sessionRangesOverlap(
  isoDate: string,
  time_from: string,
  time_to: string,
  other: Partial<eventType>,
  orgTimezone?: string
): boolean {
  if (!orgTimezone || !other.date || !other.time_from || !other.time_to) {
    return timeRangesOverlap(
      time_from,
      time_to,
      other.time_from || "0:0",
      other.time_to || "0:0"
    );
  }
  const otherDate = toISODateString(other.date as string | Date);
  if (!otherDate) return false;
  return eventsOverlapUtc(
    { date: isoDate, time_from, time_to },
    {
      date: otherDate,
      time_from: other.time_from,
      time_to: other.time_to,
    },
    orgTimezone,
    toUtcFromTenant
  );
}

function getActiveEvents(
  flatEvents: Partial<eventType>[],
  excludeId?: eventType["id"],
  options?: OverlapCheckOptions
): Partial<eventType>[] {
  return flatEvents.filter((event) => {
    if (event.is_deleted) return false;
    if (excludeId != null && eventIdsMatch(event.id, excludeId)) return false;
    if (
      shouldIgnorePast(options) &&
      options?.orgTimezone &&
      isPastEvent(event, options.orgTimezone, options.now)
    ) {
      return false;
    }
    return true;
  });
}

function eventIdsMatch(
  a: eventType["id"] | undefined,
  b: eventType["id"] | undefined
): boolean {
  return a != null && b != null && String(a) === String(b);
}

export function getActiveEventsOnDate(
  flatEvents: Partial<eventType>[],
  isoDate: string,
  excludeId?: eventType["id"],
  options?: OverlapCheckOptions
): Partial<eventType>[] {
  return flatEvents.filter((event) => {
    if (event.is_deleted) return false;
    if (excludeId != null && eventIdsMatch(event.id, excludeId)) return false;
    if (
      shouldIgnorePast(options) &&
      options?.orgTimezone &&
      isPastEvent(event, options.orgTimezone, options.now)
    ) {
      return false;
    }
    return toISODateString(event.date as string | Date) === isoDate;
  });
}

export function findOverlappingEventOnDate(
  flatEvents: Partial<eventType>[],
  isoDate: string,
  time_from: string,
  time_to: string,
  excludeId?: eventType["id"],
  options?: OverlapCheckOptions
): Partial<eventType> | null {
  const active = options?.orgTimezone
    ? getActiveEvents(flatEvents, excludeId, options)
    : getActiveEventsOnDate(flatEvents, isoDate, excludeId, options);
  return (
    active.find((event) => {
      if (options?.orgTimezone) {
        return sessionRangesOverlap(
          isoDate,
          time_from,
          time_to,
          event,
          options.orgTimezone
        );
      }
      return timeRangesOverlap(
        time_from,
        time_to,
        event.time_from || "0:0",
        event.time_to || "0:0"
      );
    }) ?? null
  );
}

/** All same-day future conflicts for a proposed time range (for Fix). */
export function findOverlappingEventsOnDate(
  flatEvents: Partial<eventType>[],
  isoDate: string,
  time_from: string,
  time_to: string,
  excludeId?: eventType["id"],
  options?: OverlapCheckOptions
): Partial<eventType>[] {
  const active = options?.orgTimezone
    ? getActiveEvents(flatEvents, excludeId, options)
    : getActiveEventsOnDate(flatEvents, isoDate, excludeId, options);
  return active.filter((event) => {
    if (options?.orgTimezone) {
      return sessionRangesOverlap(
        isoDate,
        time_from,
        time_to,
        event,
        options.orgTimezone
      );
    }
    return timeRangesOverlap(
      time_from,
      time_to,
      event.time_from || "0:0",
      event.time_to || "0:0"
    );
  });
}

export function isDraftEventId(id: eventType["id"] | undefined): boolean {
  return id != null && String(id).toLowerCase().includes("new");
}

/** Mirror backend connected-component overlap clusters on a flat event list. */
export function findOverlapClusters(
  flatEvents: Partial<eventType>[],
  options?: OverlapCheckOptions
): Partial<eventType>[][] {
  if (options?.orgTimezone) {
    const active = getActiveEvents(flatEvents, undefined, options);
    if (active.length < 2) return [];
    const ordered = [...active].sort((a, b) => {
      const aDate = toISODateString(a.date as string | Date) || "";
      const bDate = toISODateString(b.date as string | Date) || "";
      const { start: a0 } = eventBoundsUtc(
        aDate,
        a.time_from || "0:0",
        a.time_to || "0:0",
        options.orgTimezone!,
        toUtcFromTenant
      );
      const { start: b0 } = eventBoundsUtc(
        bDate,
        b.time_from || "0:0",
        b.time_to || "0:0",
        options.orgTimezone!,
        toUtcFromTenant
      );
      return (
        a0.getTime() - b0.getTime() ||
        String(a.id ?? "").localeCompare(String(b.id ?? ""))
      );
    });
    const clusters: Partial<eventType>[][] = [];
    for (const ev of ordered) {
      const evDate = toISODateString(ev.date as string | Date) || "";
      const touched = clusters.filter((cluster) =>
        cluster.some((other) => {
          const otherDate = toISODateString(other.date as string | Date) || "";
          return eventsOverlapUtc(
            {
              date: evDate,
              time_from: ev.time_from || "0:0",
              time_to: ev.time_to || "0:0",
            },
            {
              date: otherDate,
              time_from: other.time_from || "0:0",
              time_to: other.time_to || "0:0",
            },
            options.orgTimezone!,
            toUtcFromTenant
          );
        })
      );
      if (!touched.length) {
        clusters.push([ev]);
      } else if (touched.length === 1) {
        touched[0].push(ev);
      } else {
        const merged = [ev, ...touched.flat()];
        for (const cluster of touched) {
          clusters.splice(clusters.indexOf(cluster), 1);
        }
        clusters.push(merged);
      }
    }
    return clusters.filter((cluster) => cluster.length > 1);
  }

  const byDate = new Map<string, Partial<eventType>[]>();
  for (const event of flatEvents) {
    if (event.is_deleted) continue;
    if (
      shouldIgnorePast(options) &&
      options?.orgTimezone &&
      isPastEvent(event, options.orgTimezone, options.now)
    ) {
      continue;
    }
    const isoDate = toISODateString(event.date as string | Date);
    if (!isoDate) continue;
    const list = byDate.get(isoDate) ?? [];
    list.push(event);
    byDate.set(isoDate, list);
  }

  const clusters: Partial<eventType>[][] = [];
  for (const dayEvents of Array.from(byDate.values())) {
    if (dayEvents.length < 2) continue;
    const ordered = [...dayEvents].sort(
      (a, b) =>
        timeStringToMinutes(a.time_from || "0:0") -
          timeStringToMinutes(b.time_from || "0:0") ||
        String(a.id ?? "").localeCompare(String(b.id ?? ""))
    );
    let current: Partial<eventType>[] = [ordered[0]];
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const curr = ordered[i];
      if (
        timeStringToMinutes(curr.time_from || "0:0") <
        timeStringToMinutes(prev.time_to || "0:0")
      ) {
        current.push(curr);
      } else {
        if (current.length > 1) clusters.push(current);
        current = [curr];
      }
    }
    if (current.length > 1) clusters.push(current);
  }
  return clusters;
}

/** Mirror backend cluster detection on a flat event list. */
export function hasOverlappingEventsInFlatList(
  flatEvents: Partial<eventType>[],
  options?: OverlapCheckOptions
): boolean {
  return findOverlapClusters(flatEvents, options).length > 0;
}

export function wouldRecurringEventsOverlap(
  startDate: Date,
  endDate: Date,
  repeatEvery: string[],
  existingEvents: FormattedEvents,
  isCloseOnSabbath: boolean,
  time_from: string,
  time_to: string,
  repeat_start_date?: Date,
  repeat_end_date?: Date,
  options?: OverlapCheckOptions
): string | null {
  const rangeStart = repeat_start_date ?? startDate;
  const rangeEnd = repeat_end_date ?? endDate;
  const currentDate = new Date(rangeStart);
  const flatExisting = Object.values(existingEvents).flat();
  const now = options?.now ?? new Date();

  while (currentDate <= rangeEnd) {
    if (isCloseOnSabbath && isSabbath(currentDate) === 1) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    if (repeatEvery.includes(weekdayNames[currentDate.getDay()])) {
      const isoDate = getDateISOString(currentDate);
      // Skip proposed occurrences that are already past (end before now).
      if (options?.orgTimezone && shouldIgnorePast(options)) {
        const endDate = isOvernightSession(time_from, time_to)
          ? overnightEndIsoDate(isoDate)
          : isoDate;
        const proposedEnd = toUtcFromTenant(
          endDate,
          time_to,
          options.orgTimezone
        );
        if (proposedEnd.getTime() < now.getTime()) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }
      }
      if (
        findOverlappingEventOnDate(
          flatExisting,
          isoDate,
          time_from,
          time_to,
          undefined,
          options
        )
      ) {
        return isoDate;
      }
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return null;
}

/** Collect conflicting event ids across a recurring add (for Fix). */
export function findRecurringOverlapConflictIds(
  startDate: Date,
  endDate: Date,
  repeatEvery: string[],
  existingEvents: FormattedEvents,
  isCloseOnSabbath: boolean,
  time_from: string,
  time_to: string,
  repeat_start_date?: Date,
  repeat_end_date?: Date,
  options?: OverlapCheckOptions
): eventType["id"][] {
  const rangeStart = repeat_start_date ?? startDate;
  const rangeEnd = repeat_end_date ?? endDate;
  const currentDate = new Date(rangeStart);
  const flatExisting = Object.values(existingEvents).flat();
  const now = options?.now ?? new Date();
  const ids = new Set<string>();

  while (currentDate <= rangeEnd) {
    if (isCloseOnSabbath && isSabbath(currentDate) === 1) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    if (repeatEvery.includes(weekdayNames[currentDate.getDay()])) {
      const isoDate = getDateISOString(currentDate);
      if (options?.orgTimezone && shouldIgnorePast(options)) {
        const endDate = isOvernightSession(time_from, time_to)
          ? overnightEndIsoDate(isoDate)
          : isoDate;
        const proposedEnd = toUtcFromTenant(
          endDate,
          time_to,
          options.orgTimezone
        );
        if (proposedEnd.getTime() < now.getTime()) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }
      }
      for (const conflict of findOverlappingEventsOnDate(
        flatExisting,
        isoDate,
        time_from,
        time_to,
        undefined,
        options
      )) {
        if (conflict.id != null) ids.add(String(conflict.id));
      }
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return Array.from(ids).map((id) => {
    const numeric = Number(id);
    return Number.isNaN(numeric) || String(numeric) !== id
      ? (id as eventType["id"])
      : (numeric as eventType["id"]);
  });
}

/** Saved course events use numeric ids; draft rows use ids containing `new`. */
export function isPersistedEventId(id: eventType["id"] | undefined): boolean {
  return typeof id === "number";
}

export function countPersistedEventsInFlatList(
  flatEvents: Partial<eventType>[]
): number {
  return flatEvents.filter(
    (e) => !e.is_deleted && isPersistedEventId(e.id as eventType["id"] | undefined)
  ).length;
}

/** End strictly after start on the same calendar day (intake / course-create only). */
export function isClassTimeRangeValid(
  time_from: string | null | undefined,
  time_to: string | null | undefined
): boolean {
  if (!time_from?.trim() || !time_to?.trim()) return false;
  return timeStringToMinutes(time_to) > timeStringToMinutes(time_from);
}

export const rawToFormattedEvents = (
  rawEvents: eventType[] = [],
  tenantTimezone?: string | undefined
) => {
  const formattedEvents: FormattedEvents = {};
  rawEvents.forEach((e) => {
    const eventDate = convertEventDateToUserTimezone(
      e.date,
      e.time_from || "",
      tenantTimezone
    );
    if (!formattedEvents[eventDate]) {
      formattedEvents[eventDate] = [];
    }
    formattedEvents[eventDate].push(e);
  });
  return formattedEvents;
};

const processDateRange = (
  startDate: Date,
  endDate: Date,
  repeatEvery: string[],
  existingEvents: FormattedEvents,
  isCloseOnSabbath: boolean,
  title: string,
  time_from: string,
  time_to: string,
  options?: { collisionEnabled?: boolean }
) => {
  const pendingNewEvents: eventType[] = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    if (isCloseOnSabbath && isSabbath(currentDate) === 1) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    if (repeatEvery.includes(weekdayNames[currentDate.getDay()])) {
      const isoDate = getDateISOString(currentDate);
      const eventsOnDate = [
        ...((existingEvents[isoDate] || []) as Partial<eventType>[]),
        ...pendingNewEvents.filter((evt) => evt.date === isoDate),
      ];
      const hasTimeOverlap = eventsOnDate.some((existingEvent) =>
        timeRangesOverlap(
          time_from,
          time_to,
          existingEvent.time_from || "0:0",
          existingEvent.time_to || "0:0"
        )
      );
      if (!hasTimeOverlap || options?.collisionEnabled === false) {
        const newEvent = {
          id: "new" + uuid(),
          title: title,
          time_from: time_from,
          time_to: time_to,
          date: isoDate,
        } as eventType;
        pendingNewEvents.push(newEvent);
      }
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return pendingNewEvents;
};

export const addRecurringEvents = (
  startDate: Date,
  endDate: Date,
  repeatEvery: string[],
  existingEvents: FormattedEvents,
  isCloseOnSabbath: boolean,
  title: string,
  time_from: string,
  time_to: string,
  repeat_start_date?: Date,
  repeat_end_date?: Date,
  options?: { collisionEnabled?: boolean }
) => {
  if (repeat_start_date && repeat_end_date) {
    return processDateRange(
      repeat_start_date,
      repeat_end_date,
      repeatEvery,
      existingEvents,
      isCloseOnSabbath,
      title,
      time_from,
      time_to,
      options
    );
  }
  return processDateRange(
    startDate,
    endDate,
    repeatEvery,
    existingEvents,
    isCloseOnSabbath,
    title,
    time_from,
    time_to,
    options
  );
};
