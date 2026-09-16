import { describe, expect, it } from "vitest";
import {
  formatPaymentPlanBillingType,
  formatPaymentPlanOptionLabel,
} from "./payment-plan-label";
import { PaymentPlanBillingType } from "@/types/finance";

describe("formatPaymentPlanOptionLabel", () => {
  it("appends formatted fee with em dash", () => {
    expect(
      formatPaymentPlanOptionLabel({ name: "Monthly", price: 10000 }, "Ks"),
    ).toBe("Monthly — Ks 10,000");
  });

  it("returns name only when showFee is false", () => {
    expect(
      formatPaymentPlanOptionLabel(
        { name: "Monthly", price: 10000 },
        "Ks",
        { showFee: false },
      ),
    ).toBe("Monthly");
  });

  it("returns name only when price is missing", () => {
    expect(formatPaymentPlanOptionLabel({ name: "Monthly" }, "Ks")).toBe(
      "Monthly",
    );
    expect(
      formatPaymentPlanOptionLabel({ name: "Monthly", price: null }, "Ks"),
    ).toBe("Monthly");
    expect(
      formatPaymentPlanOptionLabel({ name: "Monthly", price: "" }, "Ks"),
    ).toBe("Monthly");
  });
});

describe("formatPaymentPlanBillingType", () => {
  it("labels whole term and per period", () => {
    expect(formatPaymentPlanBillingType(PaymentPlanBillingType.whole_term)).toBe(
      "Whole term",
    );
    expect(formatPaymentPlanBillingType(PaymentPlanBillingType.per_period)).toBe(
      "Per period",
    );
  });
});
