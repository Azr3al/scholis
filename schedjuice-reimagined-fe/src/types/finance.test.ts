import { describe, expect, it } from "vitest";

import { resolveAutoFormSchema } from "@/components/auto-form";
import {
  discountCreateEditSchema,
  DiscountEligibilityType,
  DiscountScope,
  DiscountType,
  paymentInfoCreateEditSchema,
  paymentPlanCreateEditSchema,
  paymentPlanCreateEditSchemaWithoutTiming,
  PaymentBank,
  PaymentPlanBillingType,
} from "@/types/finance";

const resolvedDiscountSchema = resolveAutoFormSchema(discountCreateEditSchema);
const resolvedPaymentInfoSchema = resolveAutoFormSchema(
  paymentInfoCreateEditSchema,
);
const resolvedPaymentPlanSchema = resolveAutoFormSchema(
  paymentPlanCreateEditSchema,
);
const resolvedPaymentPlanWithoutTimingSchema = resolveAutoFormSchema(
  paymentPlanCreateEditSchemaWithoutTiming,
);

const validPaymentInfoBase = {
  user: 1,
  account_name: "Jane Teacher",
  bank_type: PaymentBank.KBZ,
  description: "09123456789",
  is_default: false,
};

const validBase = {
  name: "Summer sale",
  discount_type: DiscountType.fixed_amount,
  fixed_amount: 5000,
  scope: DiscountScope.whole_enrollment,
  eligibility_type: DiscountEligibilityType.none,
  is_active: true,
};

function issueAt(result: { success: false; error: { issues: { path: (string | number)[]; message: string }[] } }, field: string) {
  return result.error.issues.find((issue) => issue.path[0] === field);
}

describe("discountCreateEditSchema validation", () => {

  it("rejects empty name with field-specific copy", () => {
    const result = resolvedDiscountSchema.safeParse({ ...validBase, name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(issueAt(result, "name")?.message).toBe("Name is required");
    }
  });

  it("requires fixed_amount when discount_type is fixed_amount", () => {
    const result = resolvedDiscountSchema.safeParse({
      ...validBase,
      fixed_amount: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(issueAt(result, "fixed_amount")?.message).toBe(
        "Fixed amount must be greater than 0.",
      );
    }
  });

  it("requires percent_value in range when discount_type is percent", () => {
    const result = resolvedDiscountSchema.safeParse({
      ...validBase,
      discount_type: DiscountType.percent,
      fixed_amount: null,
      percent_value: 150,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(issueAt(result, "percent_value")?.message).toBe(
        "Percent must be between 0 and 100.",
      );
    }
  });

  it("requires early_bird_days for early bird eligibility", () => {
    const result = resolvedDiscountSchema.safeParse({
      ...validBase,
      eligibility_type: DiscountEligibilityType.early_bird,
      early_bird_days: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(issueAt(result, "early_bird_days")?.message).toBe(
        "Required for early bird (≥ 1).",
      );
    }
  });

  it("rejects eligibility params on loyalty discounts", () => {
    const result = resolvedDiscountSchema.safeParse({
      ...validBase,
      eligibility_type: DiscountEligibilityType.loyalty,
      early_bird_days: 7,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(issueAt(result, "early_bird_days")?.message).toBe(
        "Loyalty discounts cannot set eligibility params.",
      );
    }
  });
});

describe("paymentInfoCreateEditSchema validation", () => {
  it("requires account/wallet number for non-cash payout types", () => {
    const result = resolvedPaymentInfoSchema.safeParse({
      ...validPaymentInfoBase,
      description: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(issueAt(result, "description")?.message).toBe(
        "Account/wallet number is required for this payout type.",
      );
    }
  });

  it("allows cash payouts without account/wallet number", () => {
    const result = resolvedPaymentInfoSchema.safeParse({
      ...validPaymentInfoBase,
      bank_type: PaymentBank.CASH,
      description: "",
    });
    expect(result.success).toBe(true);
  });

  it("defaults is_default to false when omitted", () => {
    const { is_default: _isDefault, ...withoutDefault } = validPaymentInfoBase;
    const result = resolvedPaymentInfoSchema.safeParse(withoutDefault);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_default).toBe(false);
    }
  });
});

describe("paymentPlanCreateEditSchema validation", () => {
  it("accepts create payload without legacy discount money fields", () => {
    // When is_legacy_discount_visible is off, those inputs are omitted from the form.
    const result = resolvedPaymentPlanSchema.safeParse({
      name: "EC\\test",
      price: 23,
      billing_type: PaymentPlanBillingType.per_period,
      early_payment_days: 3,
      days_before_course_locked: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejects create payload missing payment timing fields", () => {
    const result = resolvedPaymentPlanSchema.safeParse({
      name: "EC\\test",
      price: 23,
      billing_type: PaymentPlanBillingType.per_period,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(issueAt(result, "early_payment_days")).toBeTruthy();
      expect(issueAt(result, "days_before_course_locked")).toBeTruthy();
    }
  });
});

describe("paymentPlanCreateEditSchemaWithoutTiming validation", () => {
  it("accepts create payload without payment timing fields", () => {
    // admin_upload tenants omit timing from the form; BE model defaults apply.
    const result = resolvedPaymentPlanWithoutTimingSchema.safeParse({
      name: "EC\\test",
      price: 23,
      billing_type: PaymentPlanBillingType.per_period,
    });
    expect(result.success).toBe(true);
  });
});
