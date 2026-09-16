import { describe, expect, it } from "vitest";
import { buildFeeLifecycleRequest } from "./use-fee-lifecycle";

describe("buildFeeLifecycleRequest", () => {
  it("returns null when program is missing", () => {
    expect(
      buildFeeLifecycleRequest({
        programId: "",
        intakeId: "",
        period: "single_month",
        dateFrom: null,
        dateTo: null,
        breakdown: "none",
      }),
    ).toBeNull();
  });

  it("returns null for custom period without both dates", () => {
    expect(
      buildFeeLifecycleRequest({
        programId: "12",
        intakeId: "",
        period: "custom",
        dateFrom: new Date("2026-08-01"),
        dateTo: null,
        breakdown: "none",
      }),
    ).toBeNull();
  });

  it("maps program, period, and breakdown", () => {
    expect(
      buildFeeLifecycleRequest({
        programId: "12",
        intakeId: "",
        period: "last_3_months",
        dateFrom: new Date("2026-08-01"),
        dateTo: null,
        breakdown: "payment_method",
      }),
    ).toEqual({
      program_id: 12,
      period: "last_3_months",
      date_from: "2026-08-01",
      breakdown: "payment_method",
    });
  });

  it("includes intake_id when set", () => {
    expect(
      buildFeeLifecycleRequest({
        programId: "3",
        intakeId: "9",
        period: "intake_range",
        dateFrom: null,
        dateTo: null,
        breakdown: "none",
      }),
    ).toEqual({
      program_id: 3,
      intake_id: 9,
      period: "intake_range",
      breakdown: "none",
    });
  });
});
