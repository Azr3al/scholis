import { describe, expect, it, vi } from "vitest";

vi.mock("mm-cal-js", () => ({
  isSabbath: () => 0,
}));

import {
  dateOnlyFromLocalDate,
  eventDateYmd,
  formatEventTeachingDayLabel,
  formatTeachingDayYmd,
  getEventIndicesForDate,
  isTeachingDay,
  resolveCourseDateBounds,
  resolveEventYmd,
  type MarkingEvent,
} from "@/helpers/attendance-marking";
import { isYmdWithinInclusive } from "@/helpers/teaching-day-calendar-utils";

const yangonEvent = {
  id: 1,
  date: "2026-06-29T12:30:00.000Z",
  date_ymd: "2026-06-29",
  time_from: "19:00:00",
  time_to: "20:30:00",
  title: "KET 100 WD",
} as MarkingEvent;

describe("dateOnlyFromLocalDate", () => {
  it("uses local calendar components, not UTC", () => {
    const localMidnight = new Date(2026, 5, 29);
    expect(dateOnlyFromLocalDate(localMidnight)).toBe("2026-06-29");
  });
});

describe("eventDateYmd", () => {
  it("returns tenant-local calendar date for UTC ISO datetimes", () => {
    expect(eventDateYmd("2026-06-29T12:30:00.000Z", "Asia/Yangon")).toBe(
      "2026-06-29",
    );
  });

  it("returns plain calendar date strings unchanged", () => {
    expect(eventDateYmd("2026-06-29", "Asia/Yangon")).toBe("2026-06-29");
  });
});

describe("isTeachingDay", () => {
  it("matches evening session on last day of month in Asia/Yangon", () => {
    const events = [yangonEvent];
    const calendarCell = new Date(2026, 5, 29);
    expect(isTeachingDay(events, calendarCell, "Asia/Yangon")).toBe(true);
  });

  it("prefers server-provided date_ymd when present", () => {
    const events: MarkingEvent[] = [
      { ...yangonEvent, date_ymd: "2026-06-29" },
    ];
    const calendarCell = new Date(2026, 5, 29);
    expect(isTeachingDay(events, calendarCell, "UTC")).toBe(true);
  });
});

describe("resolveCourseDateBounds", () => {
  it("includes course end date without UTC midnight parse shift", () => {
    const events = [yangonEvent];
    const { fromYmd, toYmd } = resolveCourseDateBounds(
      events,
      "2026-06-01",
      "2026-06-29",
      "America/New_York",
    );
    expect(fromYmd).toBe("2026-06-01");
    expect(toYmd).toBe("2026-06-29");
    expect(isYmdWithinInclusive("2026-06-29", fromYmd, toYmd)).toBe(true);
  });
});

describe("getEventIndicesForDate", () => {
  it("finds events by tenant-local ymd", () => {
    const indices = getEventIndicesForDate(
      [yangonEvent],
      "2026-06-29",
      "Asia/Yangon",
    );
    expect(indices).toEqual([0]);
  });
});

describe("resolveEventYmd", () => {
  it("uses date_ymd from bootstrap when available", () => {
    expect(resolveEventYmd(yangonEvent, "UTC")).toBe("2026-06-29");
  });
});

describe("formatTeachingDayYmd", () => {
  it("formats YMD as calendar date regardless of runner timezone", () => {
    expect(formatTeachingDayYmd("2026-07-06")).toBe("Monday, 6 July 2026");
  });

  it("returns empty string for empty input", () => {
    expect(formatTeachingDayYmd("")).toBe("");
  });
});

describe("formatEventTeachingDayLabel", () => {
  it("uses tenant date_ymd instead of raw event.date", () => {
    const event = {
      ...yangonEvent,
      date: "2026-07-05T17:30:00.000Z",
      date_ymd: "2026-07-06",
    } as MarkingEvent;

    expect(formatEventTeachingDayLabel(event, "Asia/Yangon")).toBe(
      "Monday, 6 July 2026",
    );
  });
});
