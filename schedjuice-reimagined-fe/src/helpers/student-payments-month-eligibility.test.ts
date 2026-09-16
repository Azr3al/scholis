import { describe, expect, it } from "vitest";
import {
  calendarMonthOverlapsCourse,
  formatMonthYearLabel,
  resolveMonthDateIfOutsideCourse,
  resolveSuggestedPaymentMonth,
} from "./student-payments-month-eligibility";

describe("calendarMonthOverlapsCourse", () => {
  it("returns false when selected month is before course start", () => {
    expect(
      calendarMonthOverlapsCourse("2026-10-03", "2027-02-28", 2026, 7),
    ).toBe(false);
  });

  it("returns true when selected month overlaps course", () => {
    expect(
      calendarMonthOverlapsCourse("2026-10-03", "2027-02-28", 2026, 10),
    ).toBe(true);
  });

  it("returns true when dates missing", () => {
    expect(calendarMonthOverlapsCourse(null, null, 2026, 7)).toBe(true);
  });
});

describe("resolveSuggestedPaymentMonth", () => {
  it("returns start month when today is before course", () => {
    expect(
      resolveSuggestedPaymentMonth(
        "2026-10-03",
        "2027-02-28",
        new Date(2026, 6, 15),
      ),
    ).toEqual({ year: 2026, month: 10 });
  });

  it("returns today month when today is within course", () => {
    expect(
      resolveSuggestedPaymentMonth(
        "2026-03-01",
        "2026-12-31",
        new Date(2026, 5, 10),
      ),
    ).toEqual({ year: 2026, month: 6 });
  });
});

describe("formatMonthYearLabel", () => {
  it("formats month label for button copy", () => {
    expect(formatMonthYearLabel(2026, 10)).toMatch(/October 2026/);
  });
});

describe("resolveMonthDateIfOutsideCourse", () => {
  const todayBeforeStart = new Date(2026, 6, 15);
  const todayAfterEnd = new Date(2026, 6, 15);

  it("returns start month for future-start course", () => {
    const result = resolveMonthDateIfOutsideCourse(
      "2026-10-03",
      "2027-02-28",
      new Date(2026, 6, 1),
      todayBeforeStart,
    );
    expect(result).toEqual(new Date(2026, 9, 1));
  });

  it("returns null when selected month is within course", () => {
    expect(
      resolveMonthDateIfOutsideCourse(
        "2026-03-01",
        "2026-12-31",
        new Date(2026, 5, 1),
        new Date(2026, 5, 10),
      ),
    ).toBeNull();
  });

  it("returns end month for long-ago ended course", () => {
    const result = resolveMonthDateIfOutsideCourse(
      "2024-01-01",
      "2025-02-28",
      new Date(2026, 6, 1),
      todayAfterEnd,
    );
    expect(result).toEqual(new Date(2025, 1, 1));
  });

  it("returns end month when selected month is after course end", () => {
    const result = resolveMonthDateIfOutsideCourse(
      "2026-01-01",
      "2026-03-31",
      new Date(2026, 5, 1),
      new Date(2026, 5, 10),
    );
    expect(result).toEqual(new Date(2026, 2, 1));
  });

  it("returns null when course dates are missing", () => {
    expect(
      resolveMonthDateIfOutsideCourse(null, null, new Date(2026, 6, 1)),
    ).toBeNull();
  });
});
