import { describe, expect, it } from "vitest";
import {
  clampMonthToCourseRange,
  countInstallmentUnlockMonths,
  defaultCoveragePlanForCourse,
  resolveCoveragePayload,
  selectableMonthsFromCourseDates,
} from "@/lib/finances/payment-coverage-plan";
import { monthKey } from "@/helpers/payment-coverage-months";
import { DefaultStudentPaymentPlan } from "@/types/organization";

describe("clampMonthToCourseRange", () => {
  const courseStart = "2026-10-03";
  const courseEnd = "2027-02-28";

  it("clamps a preferred month before course start to the start month", () => {
    const preferred = new Date(2026, 6, 1); // July 2026
    const clamped = clampMonthToCourseRange(preferred, courseStart, courseEnd);
    expect(clamped.getFullYear()).toBe(2026);
    expect(clamped.getMonth()).toBe(9); // October
  });

  it("clamps a preferred month after course end to the end month", () => {
    const preferred = new Date(2027, 5, 1); // June 2027
    const clamped = clampMonthToCourseRange(preferred, courseStart, courseEnd);
    expect(clamped.getFullYear()).toBe(2027);
    expect(clamped.getMonth()).toBe(1); // February
  });

  it("passes through a preferred month inside the course range", () => {
    const preferred = new Date(2026, 11, 1); // December 2026
    const clamped = clampMonthToCourseRange(preferred, courseStart, courseEnd);
    expect(clamped.getFullYear()).toBe(2026);
    expect(clamped.getMonth()).toBe(11);
  });
});

describe("defaultCoveragePlanForCourse", () => {
  it("seeds single-month plan at clamped month", () => {
    const plan = defaultCoveragePlanForCourse(
      "2026-10-03",
      "2027-02-28",
      new Date(2026, 6, 1),
    );
    expect(plan.mode).toBe(DefaultStudentPaymentPlan.single_month);
    expect(plan.monthDate.getMonth()).toBe(9);
  });
});

describe("resolveCoveragePayload", () => {
  const selectableMonths = selectableMonthsFromCourseDates(
    "2026-10-03",
    "2027-02-28",
  );

  it("returns periodCount 1 for single month", () => {
    const plan = defaultCoveragePlanForCourse(
      "2026-10-03",
      "2027-02-28",
      new Date(2026, 9, 1),
    );
    const payload = resolveCoveragePayload(plan, selectableMonths);
    expect(payload.periodCount).toBe(1);
    expect(payload.coveredMonths).toBeNull();
    expect(payload.isInstallment).toBe(false);
  });

  it("returns covered months and periodCount for multiple months", () => {
    const plan = defaultCoveragePlanForCourse(
      "2026-10-03",
      "2027-02-28",
      new Date(2026, 9, 1),
    );
    plan.mode = DefaultStudentPaymentPlan.multiple_months;
    plan.selectedMonthKeys = new Set([
      monthKey(2026, 10),
      monthKey(2026, 11),
    ]);
    const payload = resolveCoveragePayload(plan, selectableMonths);
    expect(payload.periodCount).toBe(2);
    expect(payload.coveredMonths).toEqual([
      { year: 2026, month_index: 10 },
      { year: 2026, month_index: 11 },
    ]);
  });

  it("counts installment unlock months from furthest covered", () => {
    const plan = defaultCoveragePlanForCourse(
      "2026-10-03",
      "2027-02-28",
      new Date(2026, 9, 1),
    );
    plan.mode = DefaultStudentPaymentPlan.installment;
    plan.installmentThroughKey = monthKey(2026, 12);
    const payload = resolveCoveragePayload(plan, selectableMonths, {
      furthestCoveredKey: monthKey(2026, 10),
    });
    expect(payload.periodCount).toBe(2);
    expect(payload.isInstallment).toBe(true);
    expect(payload.installmentThroughMonth).toEqual({
      year: 2026,
      month_index: 12,
    });
  });
});

describe("countInstallmentUnlockMonths", () => {
  const selectableMonths = selectableMonthsFromCourseDates(
    "2026-10-03",
    "2027-02-28",
  );

  it("returns zero when through month is not beyond furthest covered", () => {
    expect(
      countInstallmentUnlockMonths(
        selectableMonths,
        monthKey(2026, 10),
        monthKey(2026, 11),
      ),
    ).toBe(0);
  });
});
