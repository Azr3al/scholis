import { describe, expect, it, vi } from "vitest";

vi.mock("mm-cal-js", () => ({
  isSabbath: () => 0,
}));

vi.mock("uuid", () => ({
  v4: () => "test-uuid",
}));

import type { eventType } from "@/types/course";
import {
  applyAddPlan,
  buildAddSessionsPlan,
  countDraftChanges,
  generateWeeklySessions,
  generateWeeklySessionsFromSlots,
  matchingSeriesSessions,
  markDeleted,
  planAddSessions,
  weekdayFromIsoDate,
} from "./course-schedule-draft";

const TZ = "Asia/Rangoon";

const baseEvent = (
  overrides: Partial<eventType> & { id: eventType["id"] },
): Partial<eventType> => ({
  title: "Physics",
  date: "2026-08-06",
  time_from: "19:00:00",
  time_to: "21:00:00",
  ...overrides,
});

describe("weekdayFromIsoDate", () => {
  it("returns Thu for 2026-08-06", () => {
    expect(weekdayFromIsoDate("2026-08-06")).toBe("Thu");
  });
});

describe("planAddSessions / applyAddPlan", () => {
  const overlapOptions = { orgTimezone: TZ, now: new Date("2026-08-01T12:00:00Z") };

  it("targets colliding future persisted ids and emits overlap_merges", () => {
    const existing = [baseEvent({ id: 42 })];
    const generated = generateWeeklySessions({
      weekdays: ["Thu"],
      timeFrom: "19:00:00",
      timeTo: "21:00:00",
      from: new Date("2026-08-06"),
      to: new Date("2026-08-06"),
      skipSabbath: false,
      title: "Physics",
      orgTimezone: TZ,
      now: overlapOptions.now,
    });
    const plan = planAddSessions(existing, generated, overlapOptions);
    expect(plan.replacedCount).toBe(1);
    expect(plan.replacements[0].replacedIds).toContain(42);

    const { events, merges } = applyAddPlan(existing, plan);
    expect(events.find((e) => e.id === 42)?.is_deleted).toBe(true);
    expect(merges).toEqual([
      { survivor_draft_id: "newtest-uuid", source_event_ids: [42] },
    ]);
  });

  it("does not replace past sessions with identical times", () => {
    const past = baseEvent({
      id: 99,
      date: "2026-07-02",
    });
    const generated = generateWeeklySessions({
      weekdays: ["Thu"],
      timeFrom: "19:00:00",
      timeTo: "21:00:00",
      from: new Date("2026-08-06"),
      to: new Date("2026-08-06"),
      skipSabbath: false,
      title: "Physics",
      orgTimezone: TZ,
      now: overlapOptions.now,
    });
    const plan = planAddSessions([past], generated, overlapOptions);
    expect(plan.replacedCount).toBe(0);
  });

  it("drops earlier draft when two additions collide in one pass", () => {
    const first = baseEvent({ id: "newfirst" });
    const second = baseEvent({ id: "newsecond" });
    const plan = planAddSessions(
      [first],
      [second],
      overlapOptions,
    );
    expect(plan.additions.map((e) => e.id)).toEqual(["newsecond"]);
    expect(plan.replacedCount).toBe(1);
  });
});

describe("matchingSeriesSessions", () => {
  const now = new Date("2026-08-01T12:00:00Z");

  it("separates checkin-protected sessions for all scope", () => {
    const anchor = baseEvent({ id: 1 });
    const future = baseEvent({ id: 2, date: "2026-08-13" });
    const protectedPast = {
      ...baseEvent({ id: 3, date: "2026-07-09" }),
      has_checkin: true,
    };
    const selection = matchingSeriesSessions(
      [anchor, future, protectedPast],
      anchor,
      "all",
      { orgTimezone: TZ, now },
    );
    expect(selection.deletable).toHaveLength(2);
    expect(selection.protectedByCheckin).toHaveLength(1);
    expect(selection.protectedByCheckin[0].id).toBe(3);
  });

  it("returns empty deletable for only_this on checked-in session", () => {
    const anchor = { ...baseEvent({ id: 5 }), has_checkin: true };
    const selection = matchingSeriesSessions(
      [anchor],
      anchor,
      "only_this",
      { orgTimezone: TZ, now },
    );
    expect(selection.deletable).toHaveLength(0);
    expect(selection.protectedByCheckin).toHaveLength(1);
  });
});

describe("generateWeeklySessions", () => {
  it("never emits before the from date", () => {
    const sessions = generateWeeklySessions({
      weekdays: ["Thu"],
      timeFrom: "19:00:00",
      timeTo: "21:00:00",
      from: new Date("2026-08-06"),
      to: new Date("2026-08-20"),
      skipSabbath: false,
      title: "Physics",
      orgTimezone: TZ,
      now: new Date("2026-08-01T12:00:00Z"),
    });
    expect(sessions.every((s) => (s.date as string) >= "2026-08-06")).toBe(true);
    expect(sessions.length).toBe(3);
  });
});

describe("generateWeeklySessionsFromSlots / buildAddSessionsPlan slots", () => {
  const now = new Date("2026-08-01T12:00:00Z");
  const from = new Date("2026-08-06");
  const to = new Date("2026-08-13");

  it("generates distinct times per weekday from mixed slots", () => {
    const sessions = generateWeeklySessionsFromSlots({
      slots: [
        { weekday: "Mon", time_from: "09:00", time_to: "10:00" },
        { weekday: "Wed", time_from: "14:00", time_to: "15:30" },
      ],
      from,
      to,
      skipSabbath: false,
      title: "Science",
      orgTimezone: TZ,
      now,
    });
    const mon = sessions.find((s) => s.date === "2026-08-10");
    const wed = sessions.find((s) => s.date === "2026-08-12");
    expect(mon?.time_from).toBe("09:00");
    expect(wed?.time_from).toBe("14:00");
    expect(sessions).toHaveLength(2);
  });

  it("returns null plan when weekly slots array is empty", () => {
    const plan = buildAddSessionsPlan([], {
      repeatMode: "weekly",
      weekdays: [],
      timeFrom: "",
      timeTo: "",
      slots: [],
      skipSabbath: false,
      title: "Physics",
      from,
      to,
      orgTimezone: TZ,
    });
    expect(plan).toBeNull();
  });

  it("builds plan from slots when provided for weekly mode", () => {
    const plan = buildAddSessionsPlan([], {
      repeatMode: "weekly",
      weekdays: [],
      timeFrom: "",
      timeTo: "",
      slots: [{ weekday: "Thu", time_from: "19:00", time_to: "21:00" }],
      skipSabbath: false,
      title: "Physics",
      from: new Date("2026-08-13"),
      to: new Date("2026-08-13"),
      orgTimezone: TZ,
    });
    expect(plan?.additions).toHaveLength(1);
    expect(plan?.additions[0]?.time_from).toBe("19:00");
  });
});

describe("countDraftChanges", () => {
  it("is zero when nothing changed", () => {
    expect(countDraftChanges([baseEvent({ id: 1 })])).toBe(0);
  });

  it("counts new and deleted rows", () => {
    expect(
      countDraftChanges([
        baseEvent({ id: "newabc" }),
        { ...baseEvent({ id: 2 }), is_deleted: true },
      ]),
    ).toBe(2);
  });
});

describe("markDeleted", () => {
  it("soft-deletes persisted and drops draft targets", () => {
    const flat = [baseEvent({ id: 1 }), baseEvent({ id: "newx" })];
    const next = markDeleted(flat, [baseEvent({ id: "newx" })]);
    expect(next.find((e) => e.id === "newx")).toBeUndefined();
    expect(next.find((e) => e.id === 1)?.is_deleted).toBeUndefined();
  });

  it("flags persisted targets with is_deleted for save payload", () => {
    const flat = [
      baseEvent({ id: 10, date: "2026-07-24", time_from: "10:30:00", time_to: "12:00:00" }),
      baseEvent({ id: 11, date: "2026-07-24", time_from: "09:30:00", time_to: "11:00:00" }),
    ];
    const next = markDeleted(flat, [flat[0]!]);
    expect(next.find((e) => e.id === 10)?.is_deleted).toBe(true);
    expect(next.find((e) => e.id === 11)?.is_deleted).toBeUndefined();
    expect(next).toHaveLength(2);
  });
});
