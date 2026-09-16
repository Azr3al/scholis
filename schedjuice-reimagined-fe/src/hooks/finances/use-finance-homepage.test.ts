import { describe, expect, it } from "vitest";
import {
  buildFinanceHomepageRequest,
  getCurrentMonthCustomRange,
  isFinanceHomepageCustomPeriodIncomplete,
} from "./use-finance-homepage";

describe("buildFinanceHomepageRequest", () => {
  it("returns null when program is missing", () => {
    expect(
      buildFinanceHomepageRequest({
        programId: "",
        intakeId: "",
        period: "single_month",
        dateFrom: null,
        dateTo: null,
        pieGroupBy: "payment_status",
      }),
    ).toBeNull();
  });

  it("maps program, period, and pie group by", () => {
    expect(
      buildFinanceHomepageRequest({
        programId: "12",
        intakeId: "",
        period: "last_3_months",
        dateFrom: new Date("2026-08-01"),
        dateTo: null,
        pieGroupBy: "payment_status",
      }),
    ).toEqual({
      program_id: 12,
      period: "last_3_months",
      date_from: "2026-08-01",
      pie_group_by: "payment_status",
    });
  });

  it("returns null for custom period without both dates", () => {
    expect(
      buildFinanceHomepageRequest({
        programId: "12",
        intakeId: "",
        period: "custom",
        dateFrom: new Date("2026-08-01"),
        dateTo: null,
        pieGroupBy: "payment_status",
      }),
    ).toBeNull();
  });

  it("maps custom period when both dates are set", () => {
    expect(
      buildFinanceHomepageRequest({
        programId: "12",
        intakeId: "",
        period: "custom",
        dateFrom: new Date("2026-08-01"),
        dateTo: new Date("2026-08-31"),
        pieGroupBy: "payment_status",
      }),
    ).toEqual({
      program_id: 12,
      period: "custom",
      date_from: "2026-08-01",
      date_to: "2026-08-31",
      pie_group_by: "payment_status",
    });
  });
});

describe("getCurrentMonthCustomRange", () => {
  it("returns the start and end of the reference month", () => {
    const reference = new Date("2026-08-15T12:00:00");
    expect(getCurrentMonthCustomRange(reference)).toEqual({
      dateFrom: new Date("2026-08-01T00:00:00"),
      dateTo: new Date("2026-08-31T23:59:59.999"),
    });
  });
});

describe("isFinanceHomepageCustomPeriodIncomplete", () => {
  it("is true when custom period is missing dates", () => {
    expect(
      isFinanceHomepageCustomPeriodIncomplete({
        period: "custom",
        dateFrom: null,
        dateTo: null,
      }),
    ).toBe(true);
  });

  it("is false for preset periods", () => {
    expect(
      isFinanceHomepageCustomPeriodIncomplete({
        period: "last_12_months",
        dateFrom: null,
        dateTo: null,
      }),
    ).toBe(false);
  });
});

describe("buildFinanceHomepageRequest intake", () => {
  it("includes intake_id when set", () => {
    expect(
      buildFinanceHomepageRequest({
        programId: "3",
        intakeId: "9",
        period: "intake_range",
        dateFrom: null,
        dateTo: null,
        pieGroupBy: "course",
      }),
    ).toEqual({
      program_id: 3,
      intake_id: 9,
      period: "intake_range",
      pie_group_by: "course",
    });
  });
});
