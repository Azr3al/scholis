import { describe, it, expect } from "vitest";
import { formatCourseSchedulePattern } from "./schedule-pattern";

describe("formatCourseSchedulePattern", () => {
  it("returns null when weekday and start time are missing", () => {
    expect(
      formatCourseSchedulePattern({
        weekday_pattern: "  ",
        first_event_time_from: null,
        time_pattern: null,
      }),
    ).toBeNull();
  });

  it("formats weekday with truncated clock range", () => {
    expect(
      formatCourseSchedulePattern({
        weekday_pattern: "Mon Wed",
        first_event_time_from: "14:00:00",
        first_event_time_to: "16:00:00",
      }),
    ).toBe("Mon Wed 14:00–16:00");
  });

  it("falls back to time_pattern when end time is missing", () => {
    expect(
      formatCourseSchedulePattern({
        weekday_pattern: "Fri",
        first_event_time_from: "09:00:00",
        first_event_time_to: null,
        time_pattern: "Morning",
      }),
    ).toBe("Fri Morning");
  });
});
