import { describe, expect, it } from "vitest";
import {
  addCreditEvent,
  activeEventCount,
  activeReserveCount,
  activeTeachingCount,
  allowsMultipleSessionsPerDay,
  canSubmitCreate,
  creditPicksHaveSameDayOverlap,
  impliedSpan,
  isSessionCreditProgram,
  overrideCreditPick,
  reservePicks,
  setCreditMaxSessions,
  setSharedCreditTimes,
  substitutionReserveCap,
  teachingPicks,
  toggleCreditDate,
  type SessionCreditDraft,
} from "./session-credit-draft";

const empty = (): SessionCreditDraft => ({
  maxSessions: 8,
  reserveCap: 0,
  timeFrom: "19:00",
  timeTo: "20:30",
  picks: [],
  capNote: null,
});

describe("isSessionCreditProgram", () => {
  it("is true only when the flag is true", () => {
    expect(isSessionCreditProgram(undefined)).toBe(false);
    expect(isSessionCreditProgram({ is_session_credit_scheduling: false })).toBe(
      false,
    );
    expect(isSessionCreditProgram({ is_session_credit_scheduling: true })).toBe(
      true,
    );
  });
});

describe("allowsMultipleSessionsPerDay", () => {
  it("requires session-credit and the program flag", () => {
    expect(allowsMultipleSessionsPerDay(undefined)).toBe(false);
    expect(
      allowsMultipleSessionsPerDay({
        is_session_credit_scheduling: true,
        allow_multiple_sessions_per_day: false,
      }),
    ).toBe(false);
    expect(
      allowsMultipleSessionsPerDay({
        is_session_credit_scheduling: true,
        allow_multiple_sessions_per_day: true,
      }),
    ).toBe(true);
    expect(
      allowsMultipleSessionsPerDay({
        is_session_credit_scheduling: false,
        allow_multiple_sessions_per_day: true,
      }),
    ).toBe(false);
  });
});

describe("substitutionReserveCap", () => {
  it("returns 0 unless session-credit, reserve enabled, and days set", () => {
    expect(substitutionReserveCap(null)).toBe(0);
    expect(
      substitutionReserveCap({
        is_session_credit_scheduling: true,
        is_substitution_reserve_enabled: false,
        default_substitution_reserve_days: 2,
      }),
    ).toBe(0);
    expect(
      substitutionReserveCap({
        is_session_credit_scheduling: true,
        is_substitution_reserve_enabled: true,
        default_substitution_reserve_days: 0,
      }),
    ).toBe(0);
    expect(
      substitutionReserveCap({
        is_session_credit_scheduling: true,
        is_substitution_reserve_enabled: true,
        default_substitution_reserve_days: 2,
      }),
    ).toBe(2);
  });
});

describe("toggleCreditDate", () => {
  it("adds then removes a date", () => {
    const once = toggleCreditDate(empty(), "2026-08-03");
    expect(once.picks).toHaveLength(1);
    expect(once.picks[0]).toMatchObject({
      date: "2026-08-03",
      time_from: "19:00",
      time_to: "20:30",
      overridden: false,
      isSubstitutionReserve: false,
    });
    expect(toggleCreditDate(once, "2026-08-03").picks).toEqual([]);
  });

  it("ignores a 9th teaching click when max is 8 and reserve is off", () => {
    let draft = empty();
    for (let d = 1; d <= 8; d += 1) {
      draft = toggleCreditDate(draft, `2026-08-${String(d).padStart(2, "0")}`);
    }
    const blocked = toggleCreditDate(draft, "2026-08-09");
    expect(teachingPicks(blocked.picks)).toHaveLength(8);
    expect(blocked.capNote).toMatch(/raise max sessions to add more/i);
  });

  it("adds reserve picks after teaching cap when reserveCap allows", () => {
    let draft = { ...empty(), maxSessions: 2, reserveCap: 2 };
    draft = toggleCreditDate(draft, "2026-08-03");
    draft = toggleCreditDate(draft, "2026-08-04");
    draft = toggleCreditDate(draft, "2026-08-05");
    expect(teachingPicks(draft.picks)).toHaveLength(2);
    expect(reservePicks(draft.picks)).toHaveLength(1);
    expect(reservePicks(draft.picks)[0].date).toBe("2026-08-05");
  });

  it("allows multiple picks on the same date when multi-per-day is enabled", () => {
    let draft = { ...empty(), maxSessions: 2 };
    draft = toggleCreditDate(draft, "2026-08-03", {
      allowMultiplePerDay: true,
    });
    draft = toggleCreditDate(draft, "2026-08-03", {
      allowMultiplePerDay: true,
    });
    expect(draft.picks).toHaveLength(2);
    expect(draft.picks.every((pick) => pick.date === "2026-08-03")).toBe(true);
    expect(new Set(draft.picks.map((pick) => pick.clientId)).size).toBe(2);
  });
});

describe("canSubmitCreate / impliedSpan", () => {
  it("blocks 7 of 8 teaching and allows 8 of 8 with first/last span", () => {
    let draft = empty();
    for (let d = 3; d <= 9; d += 1) {
      draft = toggleCreditDate(draft, `2026-08-${String(d).padStart(2, "0")}`);
    }
    expect(teachingPicks(draft.picks)).toHaveLength(7);
    expect(canSubmitCreate(draft)).toBe(false);
    draft = toggleCreditDate(draft, "2026-08-10");
    expect(canSubmitCreate(draft)).toBe(true);
    expect(impliedSpan(draft.picks)).toEqual({
      start: "2026-08-03",
      end: "2026-08-10",
    });
  });

  it("allows submit with teaching full and optional reserve picks", () => {
    let draft = { ...empty(), maxSessions: 2, reserveCap: 2 };
    draft = toggleCreditDate(draft, "2026-08-03");
    draft = toggleCreditDate(draft, "2026-08-04");
    expect(canSubmitCreate(draft)).toBe(true);
    draft = toggleCreditDate(draft, "2026-08-05");
    expect(canSubmitCreate(draft)).toBe(true);
  });

  it("blocks submit when multi-per-day picks overlap on the same date", () => {
    let draft = { ...empty(), maxSessions: 2 };
    draft = toggleCreditDate(draft, "2026-08-03", {
      allowMultiplePerDay: true,
    });
    draft = toggleCreditDate(draft, "2026-08-03", {
      allowMultiplePerDay: true,
    });
    expect(creditPicksHaveSameDayOverlap(draft.picks)).toBe(true);
    expect(canSubmitCreate(draft, { allowMultiplePerDay: true })).toBe(false);
  });
});

describe("shared times vs override", () => {
  it("updates non-overridden picks only", () => {
    let draft = toggleCreditDate(empty(), "2026-08-03");
    draft = toggleCreditDate(draft, "2026-08-10");
    const firstId = draft.picks[0].clientId;
    draft = overrideCreditPick(draft, firstId, "09:00", "10:00");
    draft = setSharedCreditTimes(draft, "18:00", "19:30");
    expect(draft.picks.find((p) => p.clientId === firstId)).toMatchObject({
      time_from: "09:00",
      time_to: "10:00",
      overridden: true,
    });
    expect(draft.picks.find((p) => p.date === "2026-08-10")).toMatchObject({
      time_from: "18:00",
      time_to: "19:30",
      overridden: false,
    });
  });
});

describe("setCreditMaxSessions", () => {
  it("refuses to lower max below the current teaching pick count", () => {
    let draft = toggleCreditDate(empty(), "2026-08-03");
    draft = toggleCreditDate(draft, "2026-08-10");
    const next = setCreditMaxSessions(draft, 1);
    expect(next.maxSessions).toBe(8);
    expect(next.capNote).toMatch(/delete/i);
  });
});

describe("addCreditEvent", () => {
  it("blocks at teaching cap and allows after raising max", () => {
    const atCap = addCreditEvent({
      events: [
        {
          id: 1,
          date: "2026-08-03",
          time_from: "19:00",
          time_to: "20:30",
        },
      ],
      isoDate: "2026-08-10",
      timeFrom: "19:00",
      timeTo: "20:30",
      maxSessions: 1,
      reserveCap: 0,
      title: "Physics",
    });
    expect(atCap.blockedReason).toBe("at_teaching_cap");
    expect(atCap.events).toHaveLength(1);

    const added = addCreditEvent({
      events: atCap.events,
      isoDate: "2026-08-10",
      timeFrom: "19:00",
      timeTo: "20:30",
      maxSessions: 2,
      reserveCap: 0,
      title: "Physics",
    });
    expect(added.blockedReason).toBeNull();
    expect(added.events).toHaveLength(2);
  });

  it("adds reserve events after teaching cap when reserveCap allows", () => {
    const withTeaching = addCreditEvent({
      events: [],
      isoDate: "2026-08-03",
      timeFrom: "19:00",
      timeTo: "20:30",
      maxSessions: 1,
      reserveCap: 1,
      title: "Physics",
    });
    const withReserve = addCreditEvent({
      events: withTeaching.events,
      isoDate: "2026-08-10",
      timeFrom: "19:00",
      timeTo: "20:30",
      maxSessions: 1,
      reserveCap: 1,
      title: "Physics",
    });
    expect(withReserve.blockedReason).toBeNull();
    expect(withReserve.events).toHaveLength(2);
    expect(withReserve.events[1]?.is_substitution_reserve).toBe(true);
  });

  it("blocks duplicate dates unless multi-per-day is enabled", () => {
    const blocked = addCreditEvent({
      events: [
        {
          id: 1,
          date: "2026-08-03",
          time_from: "09:00",
          time_to: "10:00",
        },
      ],
      isoDate: "2026-08-03",
      timeFrom: "19:00",
      timeTo: "20:30",
      maxSessions: 2,
      reserveCap: 0,
      title: "Physics",
    });
    expect(blocked.blockedReason).toBe("duplicate");

    const allowed = addCreditEvent({
      events: blocked.events,
      isoDate: "2026-08-03",
      timeFrom: "19:00",
      timeTo: "20:30",
      maxSessions: 2,
      reserveCap: 0,
      title: "Physics",
      allowMultiplePerDay: true,
    });
    expect(allowed.blockedReason).toBeNull();
    expect(allowed.events).toHaveLength(2);
    expect(allowed.events[1]?.id).toBe("new2026-08-03-2");
  });
});

describe("activeEventCount", () => {
  it("skips deleted rows", () => {
    expect(
      activeEventCount([
        { is_deleted: true },
        { is_deleted: false },
        { is_deleted: false },
      ]),
    ).toBe(2);
  });
});

describe("activeTeachingCount / activeReserveCount", () => {
  it("splits teaching and reserve rows", () => {
    const events = [
      { id: 1 },
      { id: 2, is_substitution_reserve: true },
      { is_deleted: true, is_substitution_reserve: true },
    ];
    expect(activeTeachingCount(events)).toBe(1);
    expect(activeReserveCount(events)).toBe(1);
  });
});
