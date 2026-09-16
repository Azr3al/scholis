import * as z from "zod";

export enum UserPaymentStatus {
  pending_payment = "pending_payment",
  cannot_extract = "cannot_extract",
  awaiting_extraction = "awaiting_extraction",
  awaiting_metadata_extraction = "awaiting_metadata_extraction",
  pending_verification = "pending_verification",
  duplicated = "duplicated",
  verified = "verified",
  // will be used when parsed_amount != actual_amount
  amount_mismatch = "amount_mismatch",
}

/** Set by the extraction pipeline only — not user-selectable in status editors. */
export const SYSTEM_ONLY_USER_PAYMENT_STATUSES = new Set<UserPaymentStatus>([
  UserPaymentStatus.cannot_extract,
  UserPaymentStatus.awaiting_extraction,
  UserPaymentStatus.awaiting_metadata_extraction,
]);

export function isSystemOnlyUserPaymentStatus(
  status: UserPaymentStatus,
): boolean {
  return SYSTEM_ONLY_USER_PAYMENT_STATUSES.has(status);
}

export function isUserPaymentStatusManuallyEditable(
  status: UserPaymentStatus,
): boolean {
  if (!isSystemOnlyUserPaymentStatus(status)) return true;
  return status === UserPaymentStatus.cannot_extract;
}

export const MANUAL_USER_PAYMENT_STATUSES: UserPaymentStatus[] = (
  Object.values(UserPaymentStatus) as UserPaymentStatus[]
).filter((status) => !SYSTEM_ONLY_USER_PAYMENT_STATUSES.has(status));
export type UserPayment = {
  id: number;
  screenshot: string;
  // the system-generated invoiced amount
  invoiced_amount: string;
  // OCR parsed amount from the screenshot
  parsed_amount: string;
  // actual amount from the verification csv file
  actual_amount: string;
  transaction_id: string;
  status: UserPaymentStatus;
  billing_start_date: string;
  billing_end_date: string;
  remarks?: string;
  user?: number;
  course?: number;
};

export enum PaymentPlanBillingType {
  per_period = "per_period",
  whole_term = "whole_term",
}

export const paymentPlanSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  price: z.coerce.number(),
  billing_type: z
    .nativeEnum(PaymentPlanBillingType)
    .default(PaymentPlanBillingType.per_period)
    .describe("Billing Type"),
  // Optional on BE (null/blank); omitted from create UI when legacy discount is off.
  discount_price: z.coerce.number().optional().nullable().describe("Discount Price"),
  per_hour_price: z.coerce
    .number()
    .optional()
    .nullable()
    .describe("Per Hour Price"),

  early_payment_days: z.coerce.number().describe("Early Payment Days"),
  days_before_course_locked: z.coerce.number().describe("Grace Period Days"),
});

export const paymentPlanCreateEditSchema = paymentPlanSchema.pick({
  name: true,
  price: true,
  billing_type: true,
  discount_price: true,
  early_payment_days: true,
  days_before_course_locked: true,
  per_hour_price: true,
});

/** Admin-upload tenants omit payment timing from create/edit; BE defaults apply. */
export const paymentPlanCreateEditSchemaWithoutTiming =
  paymentPlanCreateEditSchema.omit({
    early_payment_days: true,
    days_before_course_locked: true,
  });

export const paymentPlanDescription = {
  billing_type: {
    description:
      "Whether the plan price is charged per billing period (e.g. monthly) or once for the whole course term.",
  },
  early_payment_days: {
    description:
      "Days before the invoice issued date when students can start making payments.",
  },
  days_before_course_locked: {
    description:
      "Days after the invoice issued date when the course will be locked.",
  },
};

export enum DiscountType {
  percent = "percent",
  fixed_amount = "fixed_amount",
}

export enum DiscountScope {
  first_period = "first_period",
  whole_enrollment = "whole_enrollment",
}

export const DISCOUNT_SCOPE_LABELS: Record<DiscountScope, string> = {
  [DiscountScope.first_period]: "single month",
  [DiscountScope.whole_enrollment]: "Whole enrollment",
};

export function formatDiscountScope(
  scope: DiscountScope | string | null | undefined,
): string {
  if (scope == null || scope === "") return "";
  return (
    DISCOUNT_SCOPE_LABELS[scope as DiscountScope] ??
    String(scope).replaceAll("_", " ")
  );
}

export enum DiscountEligibilityType {
  none = "none",
  early_bird = "early_bird",
  loyalty = "loyalty",
  bulk = "bulk",
}

export const discountSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  discount_type: z.nativeEnum(DiscountType),
  percent_value: z.coerce.number().nullable().optional(),
  fixed_amount: z.coerce.number().nullable().optional(),
  scope: z.nativeEnum(DiscountScope),
  eligibility_type: z
    .nativeEnum(DiscountEligibilityType)
    .default(DiscountEligibilityType.none)
    .optional(),
  early_bird_days: z.coerce.number().nullable().optional(),
  bulk_min_courses: z.coerce.number().nullable().optional(),
  is_active: z.coerce.boolean().default(true),
  description: z.string().optional(),
});

export const discountCreateEditSchema = discountSchema
  .pick({
    name: true,
    discount_type: true,
    percent_value: true,
    fixed_amount: true,
    scope: true,
    eligibility_type: true,
    early_bird_days: true,
    bulk_min_courses: true,
    is_active: true,
    description: true,
  })
  .superRefine((data, ctx) => {
    if (data.discount_type === DiscountType.percent) {
      if (
        data.percent_value == null ||
        data.percent_value <= 0 ||
        data.percent_value > 100
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Percent must be between 0 and 100.",
          path: ["percent_value"],
        });
      }
    } else if (data.discount_type === DiscountType.fixed_amount) {
      if (data.fixed_amount == null || data.fixed_amount <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Fixed amount must be greater than 0.",
          path: ["fixed_amount"],
        });
      }
    }

    const etype = data.eligibility_type ?? DiscountEligibilityType.none;
    if (etype === DiscountEligibilityType.none) {
      if (data.early_bird_days != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Plain discounts cannot set eligibility params.",
          path: ["early_bird_days"],
        });
      }
      if (data.bulk_min_courses != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Plain discounts cannot set eligibility params.",
          path: ["bulk_min_courses"],
        });
      }
    } else if (etype === DiscountEligibilityType.early_bird) {
      if (data.early_bird_days == null || data.early_bird_days < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Required for early bird (≥ 1).",
          path: ["early_bird_days"],
        });
      }
      if (data.bulk_min_courses != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Must be empty for early_bird.",
          path: ["bulk_min_courses"],
        });
      }
    } else if (etype === DiscountEligibilityType.loyalty) {
      if (data.early_bird_days != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Loyalty discounts cannot set eligibility params.",
          path: ["early_bird_days"],
        });
      }
      if (data.bulk_min_courses != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Loyalty discounts cannot set eligibility params.",
          path: ["bulk_min_courses"],
        });
      }
    } else if (etype === DiscountEligibilityType.bulk) {
      if (data.bulk_min_courses == null || data.bulk_min_courses < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Required for bulk (≥ 2).",
          path: ["bulk_min_courses"],
        });
      }
      if (data.early_bird_days != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Must be empty for bulk.",
          path: ["early_bird_days"],
        });
      }
    }
  });

export type Discount = z.infer<typeof discountSchema>;

export type EnrollmentDiscount = {
  id: number;
  discount?: number | null;
  discount_name?: string | null;
  snapshot_discount_type: DiscountType;
  snapshot_scope: DiscountScope;
  snapshot_percent_value?: string | null;
  snapshot_fixed_amount?: string | null;
  snapshot_eligibility_type?: DiscountEligibilityType;
  reason?: string;
  is_active: boolean;
};

export type DiscountPreviewPeriod = {
  index: number;
  base_amount: string;
  discount_amount: string;
  invoiced_amount: string;
  currency: string;
};

export enum PaymentBank {
  KBZ = "KBZ",
  KPAY = "KPAY",
  UAB = "UAB",
  CB = "CB",
  AYA = "AYA",
  YOMA = "YOMA",
  CASH = "CASH",
  MOB = "MOB",
}

export const paymentMethodSchema = z.object({
  id: z.number(),
  name: z.string().describe("Account name"),
  payment_bank: z.nativeEnum(PaymentBank).describe("Bank"),
  description: z.string().optional().nullable(),
  bank_account_number: z
    .string()
    .optional()
    .nullable()
    .describe("Bank account number"),
  is_retired: z.boolean().optional().describe("Retired"),
});

export const paymentMethodCreateEditSchema = paymentMethodSchema.pick({
  name: true,
  description: true,
  payment_bank: true,
  bank_account_number: true,
});
export type paymentMethodType = z.infer<typeof paymentMethodSchema>;

export const paymentInfoSchema = z.object({
  id: z.number(),
  user: z.number().describe("Staff member"),
  account_name: z.string().max(512).describe("Account name"),
  bank_type: z.nativeEnum(PaymentBank).describe("Bank type"),
  description: z.string().describe("Account/wallet number"),
  is_default: z.boolean().describe("Default"),
});

export function paymentInfoRequiresAccountNumber(
  bankType: PaymentBank | undefined | null,
): boolean {
  return bankType != null && bankType !== PaymentBank.CASH;
}

export const paymentInfoCreateEditSchema = paymentInfoSchema
  .pick({
    user: true,
    account_name: true,
    bank_type: true,
  })
  .extend({
    description: z.string().default("").describe("Account/wallet number"),
    is_default: z.boolean().default(false).describe("Default"),
  })
  .superRefine((data, ctx) => {
    if (!paymentInfoRequiresAccountNumber(data.bank_type)) {
      return;
    }
    if (!data.description?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Account/wallet number is required for this payout type.",
        path: ["description"],
      });
    }
  });

export type paymentInfoType = z.infer<typeof paymentInfoSchema>;
