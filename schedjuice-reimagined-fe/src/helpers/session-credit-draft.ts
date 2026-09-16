import type { eventType } from "@/types/course";
import { timeRangesOverlap } from "@/helpers/calendar";

export type SessionCreditPick = {
  clientId: string;
  date: string;
  time_from: string;
  time_to: string;
  overridden: boolean;
  isSubstitutionReserve?: boolean;
};

export type SessionCreditDraft = {
  maxSessions: number;
  reserveCap: number;
  timeFrom: string;
  timeTo: string;
  picks: SessionCreditPick[];
  capNote: string | null;
};

const TEACHING_CAP_NOTE = "Raise Max sessions to add more.";
const RESERVE_CAP_NOTE =
  "Raise substitution reserve days to add more reserve dates.";
const LOWER_MAX_NOTE = "Delete extra sessions before lowering max.";
const OVERLAP_NOTE =
  "Sessions cannot overlap on the same day. Adjust times before saving.";

let pickIdCounter = 0;

function nextPickClientId(): string {
  pickIdCounter += 1;
  return `pick-${pickIdCounter}`;
}

export function createSessionCreditPick(
  isoDate: string,
  timeFrom: string,
  timeTo: string,
  isSubstitutionReserve = false,
): SessionCreditPick {
  return {
    clientId: nextPickClientId(),
    date: isoDate,
    time_from: timeFrom,
    time_to: timeTo,
    overridden: false,
    isSubstitutionReserve,
  };
}

function sortPicks(picks: SessionCreditPick[]): SessionCreditPick[] {
  return [...picks].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.time_from.localeCompare(b.time_from) ||
      a.clientId.localeCompare(b.clientId),
  );
}

function isReservePick(pick: SessionCreditPick): boolean {
  return pick.isSubstitutionReserve === true;
}

export function teachingPicks(picks: SessionCreditPick[]): SessionCreditPick[] {
  return picks.filter((pick) => !isReservePick(pick));
}

export function reservePicks(picks: SessionCreditPick[]): SessionCreditPick[] {
  return picks.filter(isReservePick);
}

export function substitutionReserveCap(
  program:
    | {
        is_session_credit_scheduling?: boolean | null;
        is_substitution_reserve_enabled?: boolean | null;
        default_substitution_reserve_days?: number | null;
      }
    | null
    | undefined,
): number {
  if (!program?.is_session_credit_scheduling) return 0;
  if (!program.is_substitution_reserve_enabled) return 0;
  return program.default_substitution_reserve_days ?? 0;
}

export function allowsMultipleSessionsPerDay(
  program:
    | {
        is_session_credit_scheduling?: boolean | null;
        allow_multiple_sessions_per_day?: boolean | null;
      }
    | null
    | undefined,
): boolean {
  return (
    program?.is_session_credit_scheduling === true &&
    program.allow_multiple_sessions_per_day === true
  );
}

export function eventCalendarDate(event: { date?: unknown }): string {
  const value = event.date;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return "";
}

export function isSessionCreditProgram(
  program:
    | {
        is_session_credit_scheduling?: boolean | null;
      }
    | null
    | undefined,
): boolean {
  return program?.is_session_credit_scheduling === true;
}

export function impliedSpan(
  picks: SessionCreditPick[],
): { start: string; end: string } | null {
  if (!picks.length) return null;
  const dates = picks.map((pick) => pick.date).sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

export function creditPicksHaveSameDayOverlap(
  picks: SessionCreditPick[],
): boolean {
  const byDate = new Map<string, SessionCreditPick[]>();
  for (const pick of picks) {
    const group = byDate.get(pick.date) ?? [];
    group.push(pick);
    byDate.set(pick.date, group);
  }
  for (const group of Array.from(byDate.values())) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        if (
          timeRangesOverlap(
            group[i].time_from,
            group[i].time_to,
            group[j].time_from,
            group[j].time_to,
          )
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

export function creditPicksOverlapNote(picks: SessionCreditPick[]): string | null {
  return creditPicksHaveSameDayOverlap(picks) ? OVERLAP_NOTE : null;
}

export function canSubmitCreate(
  draft: SessionCreditDraft,
  options?: { allowMultiplePerDay?: boolean },
): boolean {
  if (draft.maxSessions < 1) return false;
  if (teachingPicks(draft.picks).length !== draft.maxSessions) return false;
  if (options?.allowMultiplePerDay && creditPicksHaveSameDayOverlap(draft.picks)) {
    return false;
  }
  return true;
}

function addCreditPickToDraft(
  draft: SessionCreditDraft,
  isoDate: string,
): SessionCreditDraft {
  const teaching = teachingPicks(draft.picks);
  const reserve = reservePicks(draft.picks);

  if (teaching.length < draft.maxSessions) {
    return {
      ...draft,
      picks: sortPicks([
        ...draft.picks,
        createSessionCreditPick(isoDate, draft.timeFrom, draft.timeTo, false),
      ]),
      capNote: null,
    };
  }

  if (draft.reserveCap > 0 && reserve.length < draft.reserveCap) {
    return {
      ...draft,
      picks: sortPicks([
        ...draft.picks,
        createSessionCreditPick(isoDate, draft.timeFrom, draft.timeTo, true),
      ]),
      capNote: null,
    };
  }

  if (draft.reserveCap > 0 && reserve.length >= draft.reserveCap) {
    return { ...draft, capNote: RESERVE_CAP_NOTE };
  }

  return { ...draft, capNote: TEACHING_CAP_NOTE };
}

export function toggleCreditDate(
  draft: SessionCreditDraft,
  isoDate: string,
  options?: { allowMultiplePerDay?: boolean },
): SessionCreditDraft {
  if (options?.allowMultiplePerDay) {
    return addCreditPickToDraft(draft, isoDate);
  }

  const existing = draft.picks.find((pick) => pick.date === isoDate);
  if (existing) {
    return {
      ...draft,
      picks: draft.picks.filter((pick) => pick.date !== isoDate),
      capNote: null,
    };
  }

  return addCreditPickToDraft(draft, isoDate);
}

export function removeCreditPick(
  draft: SessionCreditDraft,
  clientId: string,
): SessionCreditDraft {
  return {
    ...draft,
    picks: draft.picks.filter((pick) => pick.clientId !== clientId),
    capNote: null,
  };
}

export function setSharedCreditTimes(
  draft: SessionCreditDraft,
  timeFrom: string,
  timeTo: string,
): SessionCreditDraft {
  return {
    ...draft,
    timeFrom,
    timeTo,
    picks: draft.picks.map((pick) =>
      pick.overridden
        ? pick
        : { ...pick, time_from: timeFrom, time_to: timeTo },
    ),
    capNote: null,
  };
}

export function overrideCreditPick(
  draft: SessionCreditDraft,
  clientId: string,
  timeFrom: string,
  timeTo: string,
): SessionCreditDraft {
  return {
    ...draft,
    picks: draft.picks.map((pick) =>
      pick.clientId === clientId
        ? {
            ...pick,
            time_from: timeFrom,
            time_to: timeTo,
            overridden: true,
          }
        : pick,
    ),
    capNote: null,
  };
}

export function setCreditMaxSessions(
  draft: SessionCreditDraft,
  maxSessions: number,
): SessionCreditDraft {
  if (maxSessions < teachingPicks(draft.picks).length) {
    return { ...draft, capNote: LOWER_MAX_NOTE };
  }
  return {
    ...draft,
    maxSessions,
    capNote: null,
  };
}

export function activeEventCount(events: { is_deleted?: boolean }[]): number {
  return events.filter((event) => !event.is_deleted).length;
}

export function activeTeachingCount(
  events: Array<{ is_deleted?: boolean; is_substitution_reserve?: boolean }>,
): number {
  return events.filter(
    (event) => !event.is_deleted && !event.is_substitution_reserve,
  ).length;
}

export function activeReserveCount(
  events: Array<{ is_deleted?: boolean; is_substitution_reserve?: boolean }>,
): number {
  return events.filter(
    (event) => !event.is_deleted && event.is_substitution_reserve,
  ).length;
}

function nextCreditEventId(
  events: Array<Partial<eventType>>,
  isoDate: string,
  allowMultiplePerDay: boolean,
): string {
  if (!allowMultiplePerDay) return `new${isoDate}`;
  const sameDayCount = events.filter(
    (event) =>
      !event.is_deleted && eventCalendarDate(event) === isoDate,
  ).length;
  return `new${isoDate}-${sameDayCount + 1}`;
}

export function addCreditEvent(args: {
  events: Array<Partial<eventType>>;
  isoDate: string;
  timeFrom: string;
  timeTo: string;
  maxSessions: number;
  reserveCap: number;
  title: string;
  allowMultiplePerDay?: boolean;
}): {
  events: Array<Partial<eventType>>;
  blockedReason:
    | "at_teaching_cap"
    | "at_reserve_cap"
    | "duplicate"
    | null;
} {
  const allowMultiple = args.allowMultiplePerDay === true;
  const active = args.events.filter((event) => !event.is_deleted);
  if (
    !allowMultiple &&
    active.some((event) => eventCalendarDate(event) === args.isoDate)
  ) {
    return { events: args.events, blockedReason: "duplicate" };
  }

  const teachingCount = activeTeachingCount(active);
  const reserveCount = activeReserveCount(active);
  const eventId = nextCreditEventId(args.events, args.isoDate, allowMultiple);

  if (teachingCount < args.maxSessions) {
    return {
      events: [
        ...args.events,
        {
          id: eventId,
          title: args.title,
          date: args.isoDate as unknown as Date,
          time_from: args.timeFrom,
          time_to: args.timeTo,
          is_substitution_reserve: false,
        },
      ],
      blockedReason: null,
    };
  }

  if (args.reserveCap > 0 && reserveCount < args.reserveCap) {
    return {
      events: [
        ...args.events,
        {
          id: eventId,
          title: args.title,
          date: args.isoDate as unknown as Date,
          time_from: args.timeFrom,
          time_to: args.timeTo,
          is_substitution_reserve: true,
        },
      ],
      blockedReason: null,
    };
  }

  if (args.reserveCap > 0 && reserveCount >= args.reserveCap) {
    return { events: args.events, blockedReason: "at_reserve_cap" };
  }

  return { events: args.events, blockedReason: "at_teaching_cap" };
}

export function picksToCreateEvents(
  picks: SessionCreditPick[],
  title: string,
  options?: { allowMultiplePerDay?: boolean },
): Array<Partial<eventType>> {
  const allowMultiple = options?.allowMultiplePerDay === true;
  return picks.map((pick) => ({
    id: allowMultiple ? `new${pick.clientId}` : `new${pick.date}`,
    title,
    date: pick.date as unknown as Date,
    time_from: pick.time_from,
    time_to: pick.time_to,
    ...(isReservePick(pick) ? { is_substitution_reserve: true } : {}),
  }));
}
