import {
  DiscountScope,
  DiscountType,
  PaymentPlanBillingType,
} from "@/types/finance";

type RemainingAmountPayment = {
  status: string;
  actual_amount?: string | number | null;
  parsed_amount?: string | number | null;
};

type RemainingAmountDiscountSnapshot = {
  discount_type: DiscountType;
  scope: DiscountScope;
  percent_value?: number | null;
  fixed_amount?: number | null;
};

function moneyRound(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function sumVerifiedPaymentAmounts(
  payments: RemainingAmountPayment[],
): number {
  return moneyRound(
    payments
      .filter((payment) => payment.status === "verified")
      .reduce((sum, payment) => {
        const raw = payment.actual_amount ?? payment.parsed_amount ?? 0;
        const amount = parseFloat(String(raw));
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0),
  );
}

type DiscountPreviewState = {
  remainingCredit: number;
  perPeriodShare: number;
};

function computePeriodInvoicedAmount({
  basePrice,
  periodIndex,
  periodCount,
  discount,
  state,
}: {
  basePrice: number;
  periodIndex: number;
  periodCount: number;
  discount: RemainingAmountDiscountSnapshot | null;
  state: DiscountPreviewState;
}): { invoiced: number; discountAmount: number } {
  if (!discount) {
    return { invoiced: moneyRound(basePrice), discountAmount: 0 };
  }

  let discountAmount = 0;
  let invoiced = basePrice;

  if (discount.discount_type === DiscountType.percent) {
    const applies =
      discount.scope === DiscountScope.whole_enrollment || periodIndex === 0;
    if (applies) {
      const percent = discount.percent_value ?? 0;
      discountAmount = moneyRound(basePrice * (percent / 100));
      invoiced = moneyRound(basePrice - discountAmount);
    }
  } else if (discount.discount_type === DiscountType.fixed_amount) {
    if (discount.scope === DiscountScope.first_period) {
      if (periodIndex === 0) {
        const fixed = discount.fixed_amount ?? 0;
        discountAmount = moneyRound(Math.min(fixed, basePrice));
        invoiced = moneyRound(basePrice - discountAmount);
      }
    } else {
      // Last period absorbs leftover cents from per-period rounding.
      const share =
        periodIndex === periodCount - 1
          ? state.remainingCredit
          : state.perPeriodShare;
      discountAmount = moneyRound(
        Math.min(share, state.remainingCredit, basePrice),
      );
      invoiced = moneyRound(basePrice - discountAmount);
    }
  }

  return { invoiced: Math.max(0, invoiced), discountAmount };
}

export function previewTermFeeWithDiscount({
  planPrice,
  periodCount,
  discount,
}: {
  planPrice: number;
  periodCount: number;
  discount: RemainingAmountDiscountSnapshot | null;
}): number {
  if (periodCount <= 0) return 0;

  const state: DiscountPreviewState = {
    remainingCredit:
      discount?.discount_type === DiscountType.fixed_amount &&
      discount.scope === DiscountScope.whole_enrollment
        ? moneyRound(discount.fixed_amount ?? 0)
        : 0,
    perPeriodShare:
      discount?.discount_type === DiscountType.fixed_amount &&
      discount.scope === DiscountScope.whole_enrollment
        ? moneyRound((discount.fixed_amount ?? 0) / periodCount)
        : 0,
  };

  let total = 0;
  for (let index = 0; index < periodCount; index += 1) {
    const { invoiced, discountAmount } = computePeriodInvoicedAmount({
      basePrice: planPrice,
      periodIndex: index,
      periodCount,
      discount,
      state,
    });
    total = moneyRound(total + invoiced);

    if (
      discount?.discount_type === DiscountType.fixed_amount &&
      discount.scope === DiscountScope.whole_enrollment
    ) {
      state.remainingCredit = moneyRound(state.remainingCredit - discountAmount);
    }
  }

  return moneyRound(total);
}

export function resolveTermFee({
  planPrice,
  periodCount,
  billingType = PaymentPlanBillingType.per_period,
  selectedDiscount,
}: {
  planPrice: number | null | undefined;
  periodCount: number;
  billingType?: PaymentPlanBillingType | string | null;
  selectedDiscount: RemainingAmountDiscountSnapshot | null;
}): number | null {
  if (planPrice == null || !Number.isFinite(planPrice) || planPrice <= 0) {
    return null;
  }
  if (periodCount <= 0) {
    return null;
  }

  const effectivePeriodCount =
    billingType === PaymentPlanBillingType.whole_term ? 1 : periodCount;

  return previewTermFeeWithDiscount({
    planPrice,
    periodCount: effectivePeriodCount,
    discount: selectedDiscount,
  });
}

function resolveSelectedDiscountSnapshot({
  discountId,
  discounts,
}: {
  discountId: number | null;
  discounts: Array<{
    id: number;
    discount_type: DiscountType | string;
    scope: DiscountScope | string;
    percent_value?: number | null;
    fixed_amount?: number | null;
  }>;
}): RemainingAmountDiscountSnapshot | null {
  if (discountId == null) return null;
  const discount = discounts.find((item) => item.id === discountId);
  if (!discount) return null;
  return {
    discount_type: discount.discount_type as DiscountType,
    scope: discount.scope as DiscountScope,
    percent_value: discount.percent_value ?? null,
    fixed_amount:
      discount.fixed_amount == null ? null : Number(discount.fixed_amount),
  };
}

export function resolveSelectedDiscountSnapshots({
  discountIds,
  discounts,
}: {
  discountIds: number[];
  discounts: Array<{
    id: number;
    discount_type: DiscountType | string;
    scope: DiscountScope | string;
    percent_value?: number | null;
    fixed_amount?: number | null;
  }>;
}): RemainingAmountDiscountSnapshot[] {
  return discountIds
    .map((id) => resolveSelectedDiscountSnapshot({ discountId: id, discounts }))
    .filter((d): d is RemainingAmountDiscountSnapshot => d != null);
}

function lineAmountForDiscount(
  basePrice: number,
  discount: RemainingAmountDiscountSnapshot,
  periodIndex: number,
  state: DiscountPreviewState,
  periodCount: number,
): number {
  if (discount.discount_type === DiscountType.percent) {
    const applies =
      discount.scope === DiscountScope.whole_enrollment || periodIndex === 0;
    if (!applies) return 0;
    const percent = discount.percent_value ?? 0;
    return moneyRound(basePrice * (percent / 100));
  }
  if (discount.discount_type === DiscountType.fixed_amount) {
    if (discount.scope === DiscountScope.first_period) {
      if (periodIndex !== 0) return 0;
      return moneyRound(Math.min(discount.fixed_amount ?? 0, basePrice));
    }
    const share =
      periodIndex === periodCount - 1
        ? state.remainingCredit
        : state.perPeriodShare;
    return moneyRound(Math.min(share, state.remainingCredit, basePrice));
  }
  return 0;
}

function scaleLinesToBase(lines: number[], basePrice: number): number[] {
  const rawSum = moneyRound(lines.reduce((a, b) => a + b, 0));
  if (rawSum <= basePrice) return lines;
  if (rawSum <= 0) return lines.map(() => 0);
  const scale = basePrice / rawSum;
  const scaled: number[] = [];
  let running = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (i === lines.length - 1) {
      scaled.push(moneyRound(basePrice - running));
    } else {
      const amt = moneyRound(lines[i]! * scale);
      running = moneyRound(running + amt);
      scaled.push(amt);
    }
  }
  return scaled;
}

export function previewTermFeeWithDiscounts({
  planPrice,
  periodCount,
  discounts,
}: {
  planPrice: number;
  periodCount: number;
  discounts: RemainingAmountDiscountSnapshot[];
}): number {
  if (periodCount <= 0) return 0;
  if (discounts.length === 0) {
    return previewTermFeeWithDiscount({
      planPrice,
      periodCount,
      discount: null,
    });
  }
  if (discounts.length === 1) {
    return previewTermFeeWithDiscount({
      planPrice,
      periodCount,
      discount: discounts[0]!,
    });
  }

  const states: DiscountPreviewState[] = discounts.map((discount) => ({
    remainingCredit:
      discount.discount_type === DiscountType.fixed_amount &&
      discount.scope === DiscountScope.whole_enrollment
        ? moneyRound(discount.fixed_amount ?? 0)
        : 0,
    perPeriodShare:
      discount.discount_type === DiscountType.fixed_amount &&
      discount.scope === DiscountScope.whole_enrollment
        ? moneyRound((discount.fixed_amount ?? 0) / periodCount)
        : 0,
  }));

  let total = 0;
  for (let index = 0; index < periodCount; index += 1) {
    const rawLines = discounts.map((discount, i) =>
      lineAmountForDiscount(
        planPrice,
        discount,
        index,
        states[i]!,
        periodCount,
      ),
    );
    const lines = scaleLinesToBase(rawLines, planPrice);
    const discountAmount = moneyRound(lines.reduce((a, b) => a + b, 0));
    const invoiced = Math.max(0, moneyRound(planPrice - discountAmount));
    total = moneyRound(total + invoiced);

    discounts.forEach((discount, i) => {
      if (
        discount.discount_type === DiscountType.fixed_amount &&
        discount.scope === DiscountScope.whole_enrollment
      ) {
        states[i]!.remainingCredit = moneyRound(
          states[i]!.remainingCredit - lines[i]!,
        );
      }
    });
  }

  return moneyRound(total);
}

export function resolveTermFeeFromDiscounts({
  planPrice,
  periodCount,
  billingType = PaymentPlanBillingType.per_period,
  selectedDiscounts,
}: {
  planPrice: number | null | undefined;
  periodCount: number;
  billingType?: PaymentPlanBillingType | string | null;
  selectedDiscounts: RemainingAmountDiscountSnapshot[];
}): number | null {
  if (planPrice == null || !Number.isFinite(planPrice) || planPrice <= 0) {
    return null;
  }
  if (periodCount <= 0) {
    return null;
  }

  const effectivePeriodCount =
    billingType === PaymentPlanBillingType.whole_term ? 1 : periodCount;

  return previewTermFeeWithDiscounts({
    planPrice,
    periodCount: effectivePeriodCount,
    discounts: selectedDiscounts,
  });
}

export type EnrollmentFeeDiscountLine = { label: string; amount: number };

type EnrollmentFeeDiscountCatalogRow = {
  id?: number;
  name: string;
  discount_type: DiscountType | string;
  scope: DiscountScope | string;
  percent_value?: number | null;
  fixed_amount?: number | null;
};

export function computeEnrollmentFeeBreakdown({
  planPrice,
  periodCount = 1,
  billingType = PaymentPlanBillingType.per_period,
  discounts,
}: {
  planPrice: number | null | undefined;
  periodCount?: number;
  billingType?: PaymentPlanBillingType | string | null;
  discounts: EnrollmentFeeDiscountCatalogRow[];
}): {
  subtotal: number;
  discountLines: EnrollmentFeeDiscountLine[];
  total: number;
} | null {
  if (planPrice == null || !Number.isFinite(planPrice) || planPrice <= 0) {
    return null;
  }
  if (periodCount <= 0) {
    return null;
  }

  const effectivePeriodCount =
    billingType === PaymentPlanBillingType.whole_term ? 1 : periodCount;

  const subtotal = moneyRound(planPrice * effectivePeriodCount);
  const rows = discounts.map((d) => ({
    label: d.name,
    snapshot: {
      discount_type: d.discount_type as DiscountType,
      scope: d.scope as DiscountScope,
      percent_value: d.percent_value ?? null,
      fixed_amount:
        d.fixed_amount == null ? null : Number(d.fixed_amount),
    },
  }));

  if (rows.length === 0) {
    return { subtotal, discountLines: [], total: subtotal };
  }

  if (rows.length === 1) {
    const total = previewTermFeeWithDiscount({
      planPrice,
      periodCount: effectivePeriodCount,
      discount: rows[0]!.snapshot,
    });
    const discountAmount = moneyRound(subtotal - total);
    return {
      subtotal,
      discountLines:
        discountAmount > 0
          ? [{ label: rows[0]!.label, amount: discountAmount }]
          : [],
      total,
    };
  }

  const discountSnapshots = rows.map((r) => r.snapshot);
  const states: DiscountPreviewState[] = discountSnapshots.map((discount) => ({
    remainingCredit:
      discount.discount_type === DiscountType.fixed_amount &&
      discount.scope === DiscountScope.whole_enrollment
        ? moneyRound(discount.fixed_amount ?? 0)
        : 0,
    perPeriodShare:
      discount.discount_type === DiscountType.fixed_amount &&
      discount.scope === DiscountScope.whole_enrollment
        ? moneyRound((discount.fixed_amount ?? 0) / effectivePeriodCount)
        : 0,
  }));

  const discountTotals = discountSnapshots.map(() => 0);
  let total = 0;

  for (let index = 0; index < effectivePeriodCount; index += 1) {
    const rawLines = discountSnapshots.map((discount, i) =>
      lineAmountForDiscount(
        planPrice,
        discount,
        index,
        states[i]!,
        effectivePeriodCount,
      ),
    );
    const lines = scaleLinesToBase(rawLines, planPrice);
    const discountAmount = moneyRound(lines.reduce((a, b) => a + b, 0));
    const invoiced = Math.max(0, moneyRound(planPrice - discountAmount));
    total = moneyRound(total + invoiced);

    lines.forEach((amt, i) => {
      discountTotals[i] = moneyRound(discountTotals[i]! + amt);
    });

    discountSnapshots.forEach((discount, i) => {
      if (
        discount.discount_type === DiscountType.fixed_amount &&
        discount.scope === DiscountScope.whole_enrollment
      ) {
        states[i]!.remainingCredit = moneyRound(
          states[i]!.remainingCredit - lines[i]!,
        );
      }
    });
  }

  const discountLines: EnrollmentFeeDiscountLine[] = rows
    .map((row, i) => ({
      label: row.label,
      amount: discountTotals[i]!,
    }))
    .filter((line) => line.amount > 0);

  return {
    subtotal,
    discountLines,
    total: moneyRound(total),
  };
}

export function computeRemainingAmount({
  termFee,
  payments,
  currentPaymentAmount = 0,
}: {
  termFee: number | null | undefined;
  payments: RemainingAmountPayment[];
  currentPaymentAmount?: number;
}): number | null {
  if (termFee == null || !Number.isFinite(termFee) || termFee < 0) {
    return null;
  }

  const paid = sumVerifiedPaymentAmounts(payments);
  const current = moneyRound(
    Number.isFinite(currentPaymentAmount) ? currentPaymentAmount : 0,
  );
  return Math.max(0, moneyRound(termFee - paid - current));
}
