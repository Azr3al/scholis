import { describe, expect, it } from "vitest";
import {
  computeEnrollmentFeeBreakdown,
  computeRemainingAmount,
  previewTermFeeWithDiscount,
  previewTermFeeWithDiscounts,
  resolveTermFee,
  resolveTermFeeFromDiscounts,
  sumVerifiedPaymentAmounts,
} from "./remaining-amount";
import {
  DiscountScope,
  DiscountType,
  PaymentPlanBillingType,
} from "@/types/finance";

describe("sumVerifiedPaymentAmounts", () => {
  it("sums actual_amount for verified payments, falling back to parsed_amount", () => {
    const total = sumVerifiedPaymentAmounts([
      { status: "verified", actual_amount: "100", parsed_amount: "50" },
      { status: "verified", parsed_amount: "75" },
      { status: "pending_payment", actual_amount: "999" },
    ]);

    expect(total).toBe(175);
  });
});

describe("previewTermFeeWithDiscount", () => {
  it("applies whole-enrollment percent discount to every period", () => {
    const total = previewTermFeeWithDiscount({
      planPrice: 100,
      periodCount: 3,
      discount: {
        discount_type: DiscountType.percent,
        scope: DiscountScope.whole_enrollment,
        percent_value: 10,
      },
    });

    expect(total).toBe(270);
  });

  it("absorbs leftover cents on the last period for fixed whole-enrollment discounts", () => {
    const total = previewTermFeeWithDiscount({
      planPrice: 100_000,
      periodCount: 7,
      discount: {
        discount_type: DiscountType.fixed_amount,
        scope: DiscountScope.whole_enrollment,
        fixed_amount: 10_000,
      },
    });

    // 7 * 100000 - 10000 = 690000 (not 690000.01 from share rounding)
    expect(total).toBe(690_000);
  });
});

describe("previewTermFeeWithDiscounts", () => {
  it("stacks two percent discounts independently off base for term fee", () => {
    const total = previewTermFeeWithDiscounts({
      planPrice: 500,
      periodCount: 2,
      discounts: [
        {
          discount_type: DiscountType.percent,
          scope: DiscountScope.whole_enrollment,
          percent_value: 10,
        },
        {
          discount_type: DiscountType.percent,
          scope: DiscountScope.whole_enrollment,
          percent_value: 5,
        },
      ],
    });
    // per period: 500 - 50 - 25 = 425; term = 850
    expect(total).toBe(850);
  });

  it("scales when stacked discounts exceed base", () => {
    const total = previewTermFeeWithDiscounts({
      planPrice: 100,
      periodCount: 1,
      discounts: [
        {
          discount_type: DiscountType.percent,
          scope: DiscountScope.whole_enrollment,
          percent_value: 60,
        },
        {
          discount_type: DiscountType.percent,
          scope: DiscountScope.whole_enrollment,
          percent_value: 60,
        },
      ],
    });
    expect(total).toBe(0);
  });
});

describe("resolveTermFee", () => {
  it("uses plan price once for whole_term even when the course spans multiple months", () => {
    const termFee = resolveTermFee({
      planPrice: 100_000,
      periodCount: 3,
      billingType: PaymentPlanBillingType.whole_term,
      selectedDiscount: null,
    });

    expect(termFee).toBe(100_000);
  });

  it("multiplies plan price by period count for per_period billing", () => {
    const termFee = resolveTermFee({
      planPrice: 100_000,
      periodCount: 3,
      billingType: PaymentPlanBillingType.per_period,
      selectedDiscount: null,
    });

    expect(termFee).toBe(300_000);
  });

  it("applies a whole-enrollment percent discount once for whole_term", () => {
    const termFee = resolveTermFee({
      planPrice: 100_000,
      periodCount: 3,
      billingType: PaymentPlanBillingType.whole_term,
      selectedDiscount: {
        discount_type: DiscountType.percent,
        scope: DiscountScope.whole_enrollment,
        percent_value: 10,
      },
    });

    expect(termFee).toBe(90_000);
  });
});

describe("computeEnrollmentFeeBreakdown", () => {
  it("returns subtotal with no discounts for whole_term", () => {
    const breakdown = computeEnrollmentFeeBreakdown({
      planPrice: 200_000,
      periodCount: 3,
      billingType: PaymentPlanBillingType.whole_term,
      discounts: [],
    });
    expect(breakdown).toEqual({
      subtotal: 200_000,
      discountLines: [],
      total: 200_000,
    });
  });

  it("returns per-discount lines for stacked percent discounts", () => {
    const breakdown = computeEnrollmentFeeBreakdown({
      planPrice: 500,
      periodCount: 2,
      billingType: PaymentPlanBillingType.per_period,
      discounts: [
        {
          name: "Early bird",
          discount_type: DiscountType.percent,
          scope: DiscountScope.whole_enrollment,
          percent_value: 10,
        },
        {
          name: "Loyalty",
          discount_type: DiscountType.percent,
          scope: DiscountScope.whole_enrollment,
          percent_value: 5,
        },
      ],
    });
    expect(breakdown?.subtotal).toBe(1000);
    expect(breakdown?.discountLines).toEqual([
      { label: "Early bird", amount: 100 },
      { label: "Loyalty", amount: 50 },
    ]);
    expect(breakdown?.total).toBe(850);
    expect(
      resolveTermFeeFromDiscounts({
        planPrice: 500,
        periodCount: 2,
        billingType: PaymentPlanBillingType.per_period,
        selectedDiscounts: [
          {
            discount_type: DiscountType.percent,
            scope: DiscountScope.whole_enrollment,
            percent_value: 10,
          },
          {
            discount_type: DiscountType.percent,
            scope: DiscountScope.whole_enrollment,
            percent_value: 5,
          },
        ],
      }),
    ).toBe(breakdown?.total);
  });

  it("returns a single line for fixed whole-enrollment discount", () => {
    const breakdown = computeEnrollmentFeeBreakdown({
      planPrice: 100_000,
      periodCount: 7,
      billingType: PaymentPlanBillingType.per_period,
      discounts: [
        {
          name: "Bulk",
          discount_type: DiscountType.fixed_amount,
          scope: DiscountScope.whole_enrollment,
          fixed_amount: 10_000,
        },
      ],
    });
    expect(breakdown?.subtotal).toBe(700_000);
    expect(breakdown?.discountLines).toEqual([
      { label: "Bulk", amount: 10_000 },
    ]);
    expect(breakdown?.total).toBe(690_000);
  });
});

describe("computeRemainingAmount", () => {
  it("returns term fee minus verified payments and current invoice amount", () => {
    const remaining = computeRemainingAmount({
      termFee: 600,
      payments: [
        { status: "verified", actual_amount: "250" },
        { status: "verified", parsed_amount: "50" },
      ],
      currentPaymentAmount: 100,
    });

    expect(remaining).toBe(200);
  });

  it("rounds away floating-point noise", () => {
    const remaining = computeRemainingAmount({
      termFee: 690_000.004,
      payments: [],
      currentPaymentAmount: 0,
    });

    expect(remaining).toBe(690_000);
  });

  it("clamps remaining at zero", () => {
    const remaining = computeRemainingAmount({
      termFee: 200,
      payments: [{ status: "verified", actual_amount: "500" }],
      currentPaymentAmount: 50,
    });

    expect(remaining).toBe(0);
  });

  it("returns null when term fee is unavailable", () => {
    expect(
      computeRemainingAmount({
        termFee: null,
        payments: [],
      }),
    ).toBeNull();
  });
});
