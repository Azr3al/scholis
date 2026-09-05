import { describe, expect, it } from "vitest";

import {
  courseWeekdayIndices,
  groupSessionsByMonth,
  lastSelectedIsoDate,
  sessionIdsForWeekdays,
  toSessionOptions,
} from "./session-grouping";

const TZ = "Asia/Rangoon";

const events = [
  { id: 1, date: "2026-08-03T02:30:00Z", time_from: "09:00:00", time_to: "11:00:00" },
  { id: 2, date: "2026-08-05T02:30:00Z", time_from: "09:00:00", time_to: "11:00:00" },
  { id: 3, date: "2026-09-02T02:30:00Z", time_from: "09:00:00", time_to: "11:00:00" },
];

describe("toSessionOptions", () => {
  it("resolves the local date in the org timezone, not UTC", () => {
    const [session] = toSessionOptions(
      [{ id: 9, date: "2026-08-03T18:30:00Z", time_from: "01:00:00", time_to: "03:00:00" }],
      TZ,
    );
    expect(session.isoDate).toBe("2026-08-04");
    expect(session.monthKey).toBe("2026-08");
    expect(session.weekday).toBe(2);
  });

  it("skips events without an id or date", () => {
    expect(toSessionOptions([{ date: "2026-08-03T02:30:00Z" }], TZ)).toEqual([]);
    expect(toSessionOptions([{ id: 4 }], TZ)).toEqual([]);
  });

  it("sorts by local date then start time", () => {
    const sorted = toSessionOptions(
      [
        { id: 2, date: "2026-08-05T02:30:00Z", time_from: "09:00:00", time_to: "11:00:00" },
        { id: 1, date: "2026-08-03T02:30:00Z", time_from: "13:00:00", time_to: "15:00:00" },
        { id: 3, date: "2026-08-03T02:30:00Z", time_from: "09:00:00", time_to: "11:00:00" },
      ],
      TZ,
    );
    expect(sorted.map((s) => s.id)).toEqual([3, 1, 2]);
  });
});

describe("groupSessionsByMonth", () => {
  it("groups in chronological order with human labels", () => {
    const groups = groupSessionsByMonth(toSessionOptions(events, TZ));
    expect(groups.map((g) => g.key)).toEqual(["2026-08", "2026-09"]);
    expect(groups[0].label).toBe("August 2026");
    expect(groups[0].sessions.map((s) => s.id)).toEqual([1, 2]);
  });

  it("returns an empty array for no sessions", () => {
    expect(groupSessionsByMonth([])).toEqual([]);
  });
});

describe("courseWeekdayIndices", () => {
  it("maps repeat_every labels to indices", () => {
    expect(courseWeekdayIndices(["Mon", "Wed"], [])).toEqual([1, 3]);
  });

  it("ignores unknown labels", () => {
    expect(courseWeekdayIndices(["Mon", "Funday"], [])).toEqual([1]);
  });

  it("falls back to weekdays observed in the sessions when repeat_every is empty", () => {
    const sessions = toSessionOptions(events, TZ);
    expect(courseWeekdayIndices(null, sessions)).toEqual([1, 3]);
  });
});

describe("sessionIdsForWeekdays", () => {
  it("returns nothing when no weekdays are selected", () => {
    expect(sessionIdsForWeekdays(toSessionOptions(events, TZ), [])).toEqual([]);
  });

  it("selects every session on the chosen weekdays", () => {
    expect(sessionIdsForWeekdays(toSessionOptions(events, TZ), [3])).toEqual([2, 3]);
  });
});

describe("lastSelectedIsoDate", () => {
  it("returns the latest local date among the selected ids", () => {
    const sessions = toSessionOptions(events, TZ);
    expect(lastSelectedIsoDate(sessions, new Set([1, 3]))).toBe("2026-09-02");
  });

  it("returns null when nothing is selected", () => {
    expect(lastSelectedIsoDate(toSessionOptions(events, TZ), new Set())).toBeNull();
  });
});
