import {
  calendarMonthsBetweenInclusive,
  formatMonthLong,
  monthKey,
  type CoverageMonthOption,
} from "@/helpers/payment-coverage-months";
import { validateUploadPlan } from "@/lib/finances/upload-part-validation";
import { DefaultStudentPaymentPlan } from "@/types/organization";

export type PaymentPlanMode =
  | DefaultStudentPaymentPlan.single_month
  | DefaultStudentPaymentPlan.multiple_months
  | DefaultStudentPaymentPlan.installment;

export type CoveragePlanState = {
  mode: PaymentPlanMode;
  monthDate: Date;
  selectedMonthKeys: Set<string>;
  installmentThroughKey: string;
  installmentPercent: string;
  customPercentMode: boolean;
};

export const PAYMENT_PLAN_OPTIONS: {
  value: PaymentPlanMode;
  label: string;
  description: string;
}[] = [
  {
    value: DefaultStudentPaymentPlan.single_month,
    label: "Single month",
    description: "One screenshot for one billing month.",
  },
  {
    value: DefaultStudentPaymentPlan.multiple_months,
    label: "Multiple months",
    description: "One screenshot covering several months.",
  },
  {
    value: DefaultStudentPaymentPlan.installment,
    label: "Installment",
    description: "Partial payment covering tuition through a chosen month.",
  },
];

export const INSTALLMENT_PERCENT_PRESETS = [30, 50, 70] as const;

export function createEmptyCoveragePlan(preferredMonth: Date): CoveragePlanState {
  const monthDate = new Date(
    preferredMonth.getFullYear(),
    preferredMonth.getMonth(),
    1,
  );
  const key = monthKey(monthDate.getFullYear(), monthDate.getMonth() + 1);
  return {
    mode: DefaultStudentPaymentPlan.single_month,
    monthDate,
    selectedMonthKeys: new Set([key]),
    installmentThroughKey: key,
    installmentPercent: "",
    customPercentMode: false,
  };
}

function parseCourseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Clamp preferredMonth into [courseStart, courseEnd] calendar months. */
export function clampMonthToCourseRange(
  preferredMonth: Date,
  courseStart: string | null | undefined,
  courseEnd: string | null | undefined,
): Date {
  const start = parseCourseDate(courseStart);
  const end = parseCourseDate(courseEnd ?? courseStart);
  if (!start) {
    return new Date(preferredMonth.getFullYear(), preferredMonth.getMonth(), 1);
  }
  const effectiveEnd = end ?? start;
  const preferred = new Date(
    preferredMonth.getFullYear(),
    preferredMonth.getMonth(),
    1,
  );
  const startAnchor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endAnchor = new Date(
    effectiveEnd.getFullYear(),
    effectiveEnd.getMonth(),
    1,
  );
  if (preferred < startAnchor) return startAnchor;
  if (preferred > endAnchor) return endAnchor;
  return preferred;
}

export function defaultCoveragePlanForCourse(
  courseStart: string | null | undefined,
  courseEnd: string | null | undefined,
  preferredMonth: Date,
): CoveragePlanState {
  const monthDate = clampMonthToCourseRange(
    preferredMonth,
    courseStart,
    courseEnd,
  );
  const key = monthKey(monthDate.getFullYear(), monthDate.getMonth() + 1);
  return {
    mode: DefaultStudentPaymentPlan.single_month,
    monthDate,
    selectedMonthKeys: new Set([key]),
    installmentThroughKey: key,
    installmentPercent: "",
    customPercentMode: false,
  };
}

export function selectableMonthsFromCourseDates(
  courseStart: string | null | undefined,
  courseEnd: string | null | undefined,
): CoverageMonthOption[] {
  const start = parseCourseDate(courseStart);
  if (!start) return [];
  const end = parseCourseDate(courseEnd ?? courseStart) ?? start;
  return calendarMonthsBetweenInclusive(start, end);
}

export function coverageClampNote(
  preferredMonth: Date,
  clampedMonth: Date,
  courseStart: string | null | undefined,
): string | null {
  const start = parseCourseDate(courseStart);
  if (!start) return null;
  const preferredKey = monthKey(
    preferredMonth.getFullYear(),
    preferredMonth.getMonth() + 1,
  );
  const clampedKey = monthKey(
    clampedMonth.getFullYear(),
    clampedMonth.getMonth() + 1,
  );
  if (preferredKey === clampedKey) return null;
  return `Course starts ${formatMonthLong(start.getFullYear(), start.getMonth() + 1)} — adjusted from ${formatMonthLong(preferredMonth.getFullYear(), preferredMonth.getMonth() + 1)}.`;
}

export type ResolvedCoveragePayload = {
  coveredMonths: { year: number; month_index: number }[] | null;
  issuedAnchor: Date;
  periodCount: number;
  isInstallment: boolean;
  installmentPercent: string | null;
  installmentThroughMonth: { year: number; month_index: number } | null;
};

export function countInstallmentUnlockMonths(
  selectableMonths: CoverageMonthOption[],
  installmentThroughKey: string,
  furthestCoveredKey: string | null,
): number {
  const throughIndex = selectableMonths.findIndex(
    (m) => monthKey(m.year, m.month_index) === installmentThroughKey,
  );
  if (throughIndex < 0) return 0;

  if (!furthestCoveredKey) {
    return throughIndex + 1;
  }

  const furthestIndex = selectableMonths.findIndex(
    (m) => monthKey(m.year, m.month_index) === furthestCoveredKey,
  );
  if (furthestIndex < 0) {
    return throughIndex + 1;
  }
  if (throughIndex <= furthestIndex) return 0;
  return throughIndex - furthestIndex;
}

export function resolveCoveragePayload(
  plan: CoveragePlanState,
  selectableMonths: CoverageMonthOption[],
  options?: { furthestCoveredKey?: string | null },
): ResolvedCoveragePayload {
  if (plan.mode === DefaultStudentPaymentPlan.multiple_months) {
    const picked = selectableMonths.filter((m) =>
      plan.selectedMonthKeys.has(monthKey(m.year, m.month_index)),
    );
    picked.sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month_index - b.month_index,
    );
    const issuedAnchor =
      picked.length > 0
        ? new Date(picked[0].year, picked[0].month_index - 1, 1)
        : plan.monthDate;
    const coveredMonths =
      picked.length > 1
        ? picked.map((p) => ({ year: p.year, month_index: p.month_index }))
        : null;
    return {
      coveredMonths,
      issuedAnchor,
      periodCount: Math.max(picked.length, 1),
      isInstallment: false,
      installmentPercent: null,
      installmentThroughMonth: null,
    };
  }

  if (plan.mode === DefaultStudentPaymentPlan.installment) {
    const through = selectableMonths.find(
      (m) => monthKey(m.year, m.month_index) === plan.installmentThroughKey,
    );
    const issuedAnchor = through
      ? new Date(through.year, through.month_index - 1, 1)
      : plan.monthDate;
    const pctTrim = plan.installmentPercent.trim();
    let installmentPercent: string | null = null;
    if (pctTrim) {
      const pct = Number.parseFloat(pctTrim);
      if (!Number.isNaN(pct) && pct >= 0 && pct <= 100) {
        installmentPercent = String(pct);
      }
    }
    const periodCount = countInstallmentUnlockMonths(
      selectableMonths,
      plan.installmentThroughKey,
      options?.furthestCoveredKey ?? null,
    );
    return {
      coveredMonths: null,
      issuedAnchor,
      periodCount: Math.max(periodCount, 1),
      isInstallment: true,
      installmentPercent,
      installmentThroughMonth: through
        ? { year: through.year, month_index: through.month_index }
        : null,
    };
  }

  return {
    coveredMonths: null,
    issuedAnchor: plan.monthDate,
    periodCount: 1,
    isInstallment: false,
    installmentPercent: null,
    installmentThroughMonth: null,
  };
}

export function validateCoveragePlan(
  plan: CoveragePlanState,
  selectableMonths: CoverageMonthOption[],
): string | undefined {
  return validateUploadPlan({
    paymentPlan: plan.mode,
    multipleMonthsSelectedCount: plan.selectedMonthKeys.size,
    installmentThroughKey: plan.installmentThroughKey,
    selectableMonthKeys: selectableMonths.map((m) =>
      monthKey(m.year, m.month_index),
    ),
  });
}

export function furthestCoveredMonthKeyFromPayments(
  payments: Array<{
    covered_months?: { year: number; month_index: number }[];
    issued_at?: string | null;
  }>,
): string | null {
  let furthest: { year: number; month_index: number } | null = null;
  for (const payment of payments) {
    const months =
      payment.covered_months && payment.covered_months.length > 0
        ? payment.covered_months
        : payment.issued_at
          ? (() => {
              const d = new Date(payment.issued_at);
              if (Number.isNaN(d.getTime())) return [];
              return [{ year: d.getFullYear(), month_index: d.getMonth() + 1 }];
            })()
          : [];
    for (const m of months) {
      if (
        furthest == null ||
        m.year > furthest.year ||
        (m.year === furthest.year && m.month_index > furthest.month_index)
      ) {
        furthest = m;
      }
    }
  }
  return furthest ? monthKey(furthest.year, furthest.month_index) : null;
}
