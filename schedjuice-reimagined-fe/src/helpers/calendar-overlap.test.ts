import { describe, expect, it, vi } from "vitest";

vi.mock("mm-cal-js", () => ({
  isSabbath: () => 0,
}));

import { eventType } from "@/types/course";
import {
  findOverlappingEventOnDate,
  findOverlapClusters,
  hasOverlappingEventsInFlatList,
  isPastEvent,
  timeRangesOverlap,
  wouldRecurringEventsOverlap,
} from "./calendar";

const baseEvent = (
  overrides: Partial<eventType> & { id: eventType["id"] }
): Partial<eventType> => ({
  title: "Session",
  date: "2026-07-07",
  time_from: "09:00:00",
  time_to: "10:00:00",
  ...overrides,
});

describe("timeRangesOverlap", () => {
  it("allows back-to-back sessions", () => {
    expect(timeRangesOverlap("09:00", "10:00", "10:00", "11:00")).toBe(false);
  });

  it("detects overlapping intervals", () => {
    expect(timeRangesOverlap("09:00", "10:00", "09:30", "11:00")).toBe(true);
  });
});

describe("findOverlappingEventOnDate", () => {
  const flat = [
    baseEvent({ id: 1 }),
    baseEvent({ id: 2, time_from: "11:00:00", time_to: "12:00:00" }),
  ];

  it("returns null for non-overlapping add", () => {
    expect(
      findOverlappingEventOnDate(flat, "2026-07-07", "10:00:00", "11:00:00")
    ).toBeNull();
  });

  it("returns conflicting event for overlap", () => {
    const conflict = findOverlappingEventOnDate(
      flat,
      "2026-07-07",
      "09:30:00",
      "11:00:00"
    );
    expect(conflict?.id).toBe(1);
  });

  it("ignores deleted events", () => {
    const withDeleted = [
      {
        ...baseEvent({ id: 3, time_from: "09:15:00", time_to: "10:15:00" }),
        is_deleted: true,
      },
    ];
    expect(
      findOverlappingEventOnDate(
        withDeleted,
        "2026-07-07",
        "09:30:00",
        "10:30:00"
      )
    ).toBeNull();
  });

  it("excludes the event being edited", () => {
    expect(
      findOverlappingEventOnDate(
        flat,
        "2026-07-07",
        "09:00:00",
        "10:00:00",
        1
      )
    ).toBeNull();
  });
});

describe("overnight overlap", () => {
  it("detects overnight tail conflicting with next-morning session", () => {
    const flat = [
      baseEvent({
        id: 1,
        date: "2026-07-24",
        time_from: "22:30:00",
        time_to: "00:30:00",
      }),
      baseEvent({
        id: 2,
        date: "2026-07-25",
        time_from: "00:00:00",
        time_to: "01:00:00",
      }),
    ];
    expect(
      hasOverlappingEventsInFlatList(flat, { orgTimezone: "UTC" })
    ).toBe(true);
  });

  it("allows back-to-back overnight ending at midnight", () => {
    const flat = [
      baseEvent({
        id: 1,
        date: "2026-07-24",
        time_from: "22:30:00",
        time_to: "00:00:00",
      }),
      baseEvent({
        id: 2,
        date: "2026-07-25",
        time_from: "00:00:00",
        time_to: "01:00:00",
      }),
    ];
    expect(
      hasOverlappingEventsInFlatList(flat, { orgTimezone: "UTC" })
    ).toBe(false);
  });

  it("allows overnight session when no other events conflict", () => {
    expect(
      findOverlappingEventOnDate(
        [],
        "2026-07-24",
        "22:30:00",
        "00:00:00",
        undefined,
        { orgTimezone: "UTC" }
      )
    ).toBeNull();
  });
});

describe("isPastEvent", () => {
  it("treats ended slots as past in org timezone", () => {
    const now = new Date("2026-07-07T12:00:00.000Z");
    const past = baseEvent({
      id: 1,
      date: "2026-07-07",
      time_from: "09:00:00",
      time_to: "10:00:00",
    });
    const boundary = baseEvent({
      id: 2,
      date: "2026-07-07",
      time_from: "11:00:00",
      time_to: "12:00:00",
    });
    expect(isPastEvent(past, "UTC", now)).toBe(true);
    expect(isPastEvent(boundary, "UTC", now)).toBe(false);
  });
});

describe("findOverlappingEventOnDate ignores past", () => {
  it("does not return a past conflict", () => {
    const now = new Date("2026-07-07T12:00:00.000Z");
    const flat = [
      baseEvent({ id: 1, time_from: "09:00:00", time_to: "10:00:00" }),
    ];
    expect(
      findOverlappingEventOnDate(
        flat,
        "2026-07-07",
        "09:30:00",
        "10:30:00",
        undefined,
        { orgTimezone: "UTC", now, ignorePast: true }
      )
    ).toBeNull();
  });
});

describe("findOverlapClusters", () => {
  it("groups transitive overlaps", () => {
    const flat = [
      baseEvent({ id: 1, time_from: "09:00:00", time_to: "10:30:00" }),
      baseEvent({ id: 2, time_from: "09:30:00", time_to: "10:00:00" }),
      baseEvent({ id: 3, time_from: "09:45:00", time_to: "11:00:00" }),
    ];
    const clusters = findOverlapClusters(flat);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(3);
  });
});

describe("hasOverlappingEventsInFlatList", () => {
  it("returns false for adjacent sessions on the same day", () => {
    const flat = [
      baseEvent({ id: 1, time_from: "09:00:00", time_to: "10:00:00" }),
      baseEvent({ id: 2, time_from: "10:00:00", time_to: "11:00:00" }),
    ];
    expect(hasOverlappingEventsInFlatList(flat)).toBe(false);
  });

  it("returns true for overlapping sessions on the same day", () => {
    const flat = [
      baseEvent({ id: 1, time_from: "09:00:00", time_to: "10:00:00" }),
      baseEvent({ id: 2, time_from: "09:30:00", time_to: "11:00:00" }),
    ];
    expect(hasOverlappingEventsInFlatList(flat)).toBe(true);
  });

  it("ignores deleted events", () => {
    const flat = [
      baseEvent({ id: 1, time_from: "09:00:00", time_to: "10:00:00" }),
      {
        ...baseEvent({ id: 2, time_from: "09:30:00", time_to: "11:00:00" }),
        is_deleted: true,
      },
    ];
    expect(hasOverlappingEventsInFlatList(flat)).toBe(false);
  });
});

describe("wouldRecurringEventsOverlap", () => {
  const existingEvents = {
    "2026-07-07": [baseEvent({ id: 1 })],
  };

  it("returns first conflicting date when a weekday would overlap", () => {
    const conflict = wouldRecurringEventsOverlap(
      new Date("2026-07-01"),
      new Date("2026-07-31"),
      ["Tue"],
      existingEvents,
      false,
      "09:30:00",
      "11:00:00"
    );
    expect(conflict).toBe("2026-07-07");
  });

  it("returns null when recurring sessions do not overlap", () => {
    const conflict = wouldRecurringEventsOverlap(
      new Date("2026-07-01"),
      new Date("2026-07-31"),
      ["Tue"],
      existingEvents,
      false,
      "10:00:00",
      "11:00:00"
    );
    expect(conflict).toBeNull();
  });
});
