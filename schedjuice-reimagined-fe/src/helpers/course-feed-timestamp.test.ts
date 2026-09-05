import { describe, expect, it } from "vitest";

import { formatFeedPostTimestamp } from "./course-feed-timestamp";

const tz = "Asia/Rangoon";

function mockFormatters() {
  const fmt = (pattern: string) => ({
    format: () => {
      if (pattern === "time") return "10:00 PM";
      if (pattern === "weekday") return "Monday";
      if (pattern === "monthDay") return "Jun 5";
      if (pattern === "fullDate") return "Jun 5, 2024";
      return "";
    },
  });
  return {
    time: fmt("time"),
    weekday: fmt("weekday"),
    monthDay: fmt("monthDay"),
    fullDate: fmt("fullDate"),
  };
}

describe("formatFeedPostTimestamp", () => {
  it("shows time only for tenant today", () => {
    const now = new Date("2025-06-15T14:00:00+06:30");
    const iso = "2025-06-15T10:00:00+06:30";
    const result = formatFeedPostTimestamp(iso, tz, mockFormatters(), now);
    expect(result).toBe("10:00 PM");
  });

  it("shows Yesterday prefix for prior tenant day", () => {
    const now = new Date("2025-06-15T14:00:00+06:30");
    const iso = "2025-06-14T16:30:00Z";
    const result = formatFeedPostTimestamp(iso, tz, mockFormatters(), now);
    expect(result).toBe("Yesterday 10:00 PM");
  });

  it("shows weekday for posts within last 7 days", () => {
    const now = new Date("2025-06-15T14:00:00+06:30");
    const iso = "2025-06-10T10:00:00+06:30";
    const result = formatFeedPostTimestamp(iso, tz, mockFormatters(), now);
    expect(result).toBe("Monday 10:00 PM");
  });
});
