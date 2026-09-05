import { describe, expect, it } from "vitest";
import {
  courseDurationCalendarDays,
  shouldWarnLongCourseDuration,
} from "@/helpers/course-duration-warning";

describe("courseDurationCalendarDays", () => {
  it("returns null when dates are missing or invalid", () => {
    expect(courseDurationCalendarDays(null, new Date("2026-02-01"))).toBeNull();
    expect(
      courseDurationCalendarDays(new Date("2026-01-01"), new Date("2025-12-01")),
    ).toBeNull();
  });

  it("counts inclusive calendar days between start and end", () => {
    expect(
      courseDurationCalendarDays(
        new Date("2026-01-01"),
        new Date("2026-01-31"),
      ),
    ).toBe(30);
  });
});

describe("shouldWarnLongCourseDuration", () => {
  it("does not warn when the org flag is off", () => {
    expect(
      shouldWarnLongCourseDuration(
        { warn_on_long_course_duration: false },
        new Date("2026-01-01"),
        new Date("2026-03-15"),
      ),
    ).toBe(false);
  });

  it("warns when the flag is on and duration exceeds 30 days", () => {
    expect(
      shouldWarnLongCourseDuration(
        { warn_on_long_course_duration: true },
        new Date("2026-01-01"),
        new Date("2026-02-02"),
      ),
    ).toBe(true);
  });

  it("does not warn at exactly 30 days", () => {
    expect(
      shouldWarnLongCourseDuration(
        { warn_on_long_course_duration: true },
        new Date("2026-01-01"),
        new Date("2026-01-31"),
      ),
    ).toBe(false);
  });
});
