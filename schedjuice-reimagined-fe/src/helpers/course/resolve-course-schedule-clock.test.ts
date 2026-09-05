import { describe, expect, it } from "vitest";

import { resolveCourseScheduleClockDisplay } from "@/helpers/course/resolve-course-schedule-clock";

const timeFormat = "12h" as const;

describe("resolveCourseScheduleClockDisplay", () => {
  it("prefers checkin current event when checkin is enabled", () => {
    const result = resolveCourseScheduleClockDisplay(
      {
        nearest_event_time_from: "14:00:00",
        nearest_event_time_to: "15:30:00",
      },
      {
        event: { time_from: "09:00:00", time_to: "10:30:00" },
      },
      true,
      "Asia/Yangon",
      timeFormat,
    );
    expect(result?.label).toBe("09:00 AM – 10:30 AM");
  });

  it("uses nearest event times when checkin is disabled", () => {
    const result = resolveCourseScheduleClockDisplay(
      {
        nearest_event_time_from: "14:00:00",
        nearest_event_time_to: "15:30:00",
      },
      undefined,
      false,
      "Asia/Yangon",
      timeFormat,
    );
    expect(result?.label).toBe("02:00 PM – 03:30 PM");
  });

  it("returns null when no schedule source is available", () => {
    const result = resolveCourseScheduleClockDisplay(
      {},
      undefined,
      false,
      "Asia/Yangon",
      timeFormat,
    );
    expect(result).toBeNull();
  });
});
