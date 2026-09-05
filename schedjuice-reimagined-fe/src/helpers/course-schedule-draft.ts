import { weekdayNames } from "@/components/calendar/types";
import {
  findOverlappingEventsOnDate,
  isPastEvent,
  isPersistedEventId,
  type OverlapCheckOptions,
} from "@/helpers/calendar";
import { getDateISOString, toISODateString } from "@/helpers/date";
import {
  isOvernightSession,
  overnightEndIsoDate,
} from "@/helpers/session-time";
import { toUtcFromTenant } from "@/helpers/timeslot";
import type { eventType } from "@/types/course";
import type { OverlapMergeEntry } from "@/types/course-schedule";
import type { RecurringSlot } from "@/types/intake";
import { isSabbath } from "mm-cal-js";
import { format } from "date-fns";
import { v4 as uuid } from "uuid";

type Draft = Partial<eventType>;

/** Weekday from a `YYYY-MM-DD` string without UTC day-shift. */
export function weekdayFromIsoDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return weekdayNames[new Date(y, m - 1, d).getDay()];
}

function sessionHasEnded(
  isoDate: string,
  timeFrom: string,
  timeTo: string,
  orgTimezone: string,
  now: Date,
): boolean {
  const endDate = isOvernightSession(timeFrom, timeTo)
    ? overnightEndIsoDate(isoDate)
    : isoDate;
  return toUtcFromTenant(endDate, timeTo, orgTimezone).getTime() < now.getTime();
}

export type GenerateArgs = {
  weekdays: string[];
  timeFrom: string;
  timeTo: string;
  from: Date;
  to: Date;
  skipSabbath: boolean;
  title: string;
  orgTimezone: string;
  now?: Date;
};

export function generateWeeklySessions(args: GenerateArgs): Draft[] {
  const { weekdays, timeFrom, timeTo, skipSabbath, title, orgTimezone } = args;
  const now = args.now ?? new Date();
  const out: Draft[] = [];
  if (!weekdays.length || !timeFrom || !timeTo) return out;

  const cursor = new Date(args.from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(args.to);
  end.setHours(23, 59, 59, 999);

  while (cursor <= end) {
    const isoDate = getDateISOString(cursor);
    const matchesDay = weekdays.includes(weekdayFromIsoDate(isoDate));
    const blockedBySabbath = skipSabbath && isSabbath(cursor) === 1;
    const alreadyOver = sessionHasEnded(
      isoDate,
      timeFrom,
      timeTo,
      orgTimezone,
      now,
    );

    if (matchesDay && !blockedBySabbath && !alreadyOver) {
      out.push({
        id: `new${uuid()}`,
        title,
        date: isoDate,
        time_from: timeFrom,
        time_to: timeTo,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export type GenerateFromSlotsArgs = {
  slots: RecurringSlot[];
  from: Date;
  to: Date;
  skipSabbath: boolean;
  title: string;
  orgTimezone: string;
  now?: Date;
};

export function generateWeeklySessionsFromSlots(
  args: GenerateFromSlotsArgs,
): Draft[] {
  const out: Draft[] = [];
  for (const slot of args.slots) {
    if (!slot.weekday || !slot.time_from || !slot.time_to) continue;
    out.push(
      ...generateWeeklySessions({
        weekdays: [slot.weekday],
        timeFrom: slot.time_from,
        timeTo: slot.time_to,
        from: args.from,
        to: args.to,
        skipSabbath: args.skipSabbath,
        title: args.title,
        orgTimezone: args.orgTimezone,
        now: args.now,
      }),
    );
  }
  return out;
}

export type AddPlan = {
  additions: Draft[];
  replacements: Array<{ draftId: string; replacedIds: Array<eventType["id"]> }>;
  replacedDates: string[];
  replacedCount: number;
};

function indexActiveEventsByDate(
  flatEvents: Draft[],
  options: OverlapCheckOptions & { orgTimezone: string },
): Map<string, Draft[]> {
  const now = options.now ?? new Date();
  const ignorePast = options.ignorePast !== false;
  const byDate = new Map<string, Draft[]>();

  for (const event of flatEvents) {
    if (event.is_deleted) continue;
    if (ignorePast && isPastEvent(event, options.orgTimezone, now)) continue;
    const isoDate = toISODateString(event.date as string | Date);
    if (!isoDate) continue;
    const bucket = byDate.get(isoDate);
    if (bucket) bucket.push(event);
    else byDate.set(isoDate, [event]);
  }
  return byDate;
}

export function buildAddSessionsPlan(
  flatEvents: Draft[],
  args: {
    repeatMode: "weekly" | "once";
    weekdays: string[];
    timeFrom: string;
    timeTo: string;
    slots?: RecurringSlot[];
    singleDate?: Date;
    skipSabbath: boolean;
    title: string;
    from: Date;
    to: Date;
    orgTimezone: string;
  },
): AddPlan | null {
  const {
    repeatMode,
    weekdays,
    timeFrom,
    timeTo,
    slots,
    singleDate,
    skipSabbath,
    title,
    from,
    to,
    orgTimezone,
  } = args;

  if (repeatMode === "weekly" && slots?.length) {
    const generated = generateWeeklySessionsFromSlots({
      slots,
      from,
      to,
      skipSabbath,
      title,
      orgTimezone,
    });
    if (!generated.length) return null;
    return planAddSessions(flatEvents, generated, { orgTimezone });
  }

  if (!weekdays.length && repeatMode === "weekly") return null;
  if (!timeFrom || !timeTo) return null;

  const generated =
    repeatMode === "weekly"
      ? generateWeeklySessions({
          weekdays,
          timeFrom,
          timeTo,
          from,
          to,
          skipSabbath,
          title,
          orgTimezone,
        })
      : singleDate
        ? generateWeeklySessions({
            weekdays: [weekdayFromIsoDate(format(singleDate, "yyyy-MM-dd"))],
            timeFrom,
            timeTo,
            from: singleDate,
            to: singleDate,
            skipSabbath: false,
            title,
            orgTimezone,
          })
        : [];

  if (!generated.length) return null;
  return planAddSessions(flatEvents, generated, { orgTimezone });
}

export function planAddSessions(
  flatEvents: Draft[],
  generated: Draft[],
  options: OverlapCheckOptions & { orgTimezone: string },
): AddPlan {
  const additions: Draft[] = [];
  const additionsByDate = new Map<string, Draft[]>();
  const replacements: AddPlan["replacements"] = [];
  const replacedIds = new Set<string>();
  const replacedDates = new Set<string>();
  const eventsByDate = indexActiveEventsByDate(flatEvents, options);

  for (const candidate of generated) {
    const isoDate = candidate.date as string;
    const baseOnDate = (eventsByDate.get(isoDate) ?? []).filter(
      (event) => !replacedIds.has(String(event.id)),
    );
    const draftOnDate = (additionsByDate.get(isoDate) ?? []).filter(
      (event) => !replacedIds.has(String(event.id)),
    );
    const pool = [...baseOnDate, ...draftOnDate];

    const conflicts = findOverlappingEventsOnDate(
      pool,
      isoDate,
      candidate.time_from!,
      candidate.time_to!,
      undefined,
      options,
    );

    const displaced = conflicts
      .map((conflict) => conflict.id)
      .filter((id): id is eventType["id"] => id != null);

    for (const id of displaced) {
      replacedIds.add(String(id));
      replacedDates.add(isoDate);
    }
    if (displaced.length) {
      replacements.push({ draftId: String(candidate.id), replacedIds: displaced });
    }
    additions.push(candidate);
    const bucket = additionsByDate.get(isoDate);
    if (bucket) bucket.push(candidate);
    else additionsByDate.set(isoDate, [candidate]);
  }

  const survivingAdditions = additions.filter(
    (event) => !replacedIds.has(String(event.id)),
  );

  return {
    additions: survivingAdditions,
    replacements,
    replacedDates: Array.from(replacedDates).sort(),
    replacedCount: replacedIds.size,
  };
}

export function applyAddPlan(
  flatEvents: Draft[],
  plan: AddPlan,
): { events: Draft[]; merges: OverlapMergeEntry[] } {
  const replacedPersisted = new Set<string>();
  const replacedDrafts = new Set<string>();
  const merges: OverlapMergeEntry[] = [];

  for (const { draftId, replacedIds } of plan.replacements) {
    const sourceEventIds: number[] = [];
    for (const id of replacedIds) {
      if (isPersistedEventId(id)) {
        replacedPersisted.add(String(id));
        sourceEventIds.push(Number(id));
      } else {
        replacedDrafts.add(String(id));
      }
    }
    if (sourceEventIds.length) {
      merges.push({ survivor_draft_id: draftId, source_event_ids: sourceEventIds });
    }
  }

  const kept = flatEvents
    .filter((event) => !replacedDrafts.has(String(event.id)))
    .map((event) =>
      replacedPersisted.has(String(event.id))
        ? { ...event, is_deleted: true }
        : event,
    );

  return { events: [...kept, ...plan.additions], merges };
}

export type SeriesScope = "only_this" | "future" | "all";

export type SeriesSelection = {
  deletable: Draft[];
  protectedByCheckin: Draft[];
};

export function matchingSeriesSessions(
  flatEvents: Draft[],
  anchor: Draft,
  scope: SeriesScope,
  options: { orgTimezone: string; now?: Date },
): SeriesSelection {
  const now = options.now ?? new Date();
  const anchorDate = toISODateString(anchor.date as string | Date)!;
  const anchorWeekday = weekdayFromIsoDate(anchorDate);

  const candidates = flatEvents.filter((event) => {
    if (event.is_deleted) return false;
    const isoDate = toISODateString(event.date as string | Date);
    if (!isoDate) return false;
    if (scope === "only_this") return String(event.id) === String(anchor.id);
    if (
      weekdayFromIsoDate(isoDate) !== anchorWeekday ||
      event.time_from !== anchor.time_from ||
      event.time_to !== anchor.time_to
    ) {
      return false;
    }
    if (scope === "future") return !isPastEvent(event, options.orgTimezone, now);
    return true;
  });

  return {
    deletable: candidates.filter((event) => event.has_checkin !== true),
    protectedByCheckin: candidates.filter((event) => event.has_checkin === true),
  };
}

export function markDeleted(flatEvents: Draft[], targets: Draft[]): Draft[] {
  const ids = new Set(targets.map((event) => String(event.id)));
  return flatEvents
    .filter(
      (event) => !(ids.has(String(event.id)) && !isPersistedEventId(event.id)),
    )
    .map((event) =>
      ids.has(String(event.id)) ? { ...event, is_deleted: true } : event,
    );
}

export function countDraftChanges(flatEvents: Draft[]): number {
  return flatEvents.filter(
    (event) =>
      event.is_deleted ||
      event.is_edit ||
      (!isPersistedEventId(event.id) && !event.is_deleted),
  ).length;
}

export function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDateList(dates: string[], max = 4): string {
  if (!dates.length) return "";
  const shown = dates.slice(0, max);
  const rest = dates.length - shown.length;
  const formatted = shown.join(", ");
  return rest > 0 ? `${formatted}, +${rest} more` : formatted;
}
