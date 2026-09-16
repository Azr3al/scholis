import { describe, expect, it } from "vitest";
import {
  courseDatesDifferFromIntake,
  courseDatesMatchIntake,
  effectiveCourseDatesDifferFromIntake,
  getEffectiveCourseDates,
  toDateOnlyIso,
} from "./intake-course-dates";

describe("intake-course-dates", () => {
  it("normalizes ISO date strings", () => {
    expect(toDateOnlyIso("2026-01-01")).toBe("2026-01-01");
    expect(toDateOnlyIso("2026-01-01T00:00:00.000Z")).toBe("2026-01-01");
  });

  it("detects matching course and intake dates", () => {
    expect(
      courseDatesMatchIntake(
        { start_date: "2026-01-01", end_date: "2026-06-30" },
        { start_date: "2026-01-01", end_date: "2026-06-30" },
      ),
    ).toBe(true);
  });

  it("detects differing course and intake dates", () => {
    expect(
      courseDatesDifferFromIntake(
        { start_date: "2026-02-01", end_date: "2026-03-31" },
        { start_date: "2026-01-01", end_date: "2026-06-30" },
      ),
    ).toBe(true);
  });

  it("resolves effective course dates from defaults and overrides", () => {
    expect(
      getEffectiveCourseDates(
        { start_date: "2026-01-01", end_date: "2026-06-30" },
        { start_date: "2026-02-01" },
      ),
    ).toEqual({
      start_date: "2026-02-01",
      end_date: "2026-06-30",
    });
  });

  it("detects when effective dates differ from intake", () => {
    expect(
      effectiveCourseDatesDifferFromIntake(
        { start_date: "2026-02-01", end_date: "2026-03-31" },
        { start_date: "2026-01-01", end_date: "2026-06-30" },
      ),
    ).toBe(true);
    expect(
      effectiveCourseDatesDifferFromIntake(
        { start_date: "2026-01-01", end_date: "2026-06-30" },
        { start_date: "2026-01-01", end_date: "2026-06-30" },
      ),
    ).toBe(false);
  });
});
