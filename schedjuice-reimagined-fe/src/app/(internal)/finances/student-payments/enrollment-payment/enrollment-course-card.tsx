"use client";

import {
  PaymentDiscountPicker,
  type PaymentDiscountSelection,
} from "@/components/finance/payment-discount-picker";
import { searchEntities } from "@/app/client-api/utils";
import { CoverageFields } from "@/components/finances/payment-upload/coverage-fields";
import { Button, Spinner } from "@/components/primitives";
import { formatMoney } from "@/helpers/money";
import { formatPaymentPlanBillingType } from "@/helpers/payment-plan-label";
import {
  coverageClampNote,
  furthestCoveredMonthKeyFromPayments,
  resolveCoveragePayload,
  selectableMonthsFromCourseDates,
  type CoveragePlanState,
} from "@/lib/finances/payment-coverage-plan";
import { formatMonthLong } from "@/helpers/payment-coverage-months";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { courseHasBillablePaymentPlan } from "@/lib/finances/upload-enrollment";
import { axiosClient } from "@/lib/api";
import {
  computeEnrollmentFeeBreakdown,
  type EnrollmentFeeDiscountLine,
  resolveSelectedDiscountSnapshots,
  resolveTermFeeFromDiscounts,
} from "@/lib/finances/remaining-amount";
import { operatorEnum } from "@/types/api";
import type { Discount } from "@/types/finance";
import { DiscountEligibilityType } from "@/types/finance";
import { useQuery } from "@tanstack/react-query";
import { Xmark } from "iconoir-react";
import { useCallback, useEffect, useMemo } from "react";

export type CourseMeta = {
  id: number;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  payment_plan?: {
    price?: string | number | null;
    billing_type?: string | null;
  } | number | null;
};

export type FeeBreakdown = {
  subtotal: number;
  discountLines: EnrollmentFeeDiscountLine[];
  total: number;
};

export type CourseSelection = {
  courseId: number;
  title: string;
  startDate: string | null;
  endDate: string | null;
  enrollmentId: number | null;
  paymentPlan: CourseMeta["payment_plan"];
  planPrice: number | null;
  discountSelection: PaymentDiscountSelection;
  invoicedAmount: number | null;
  feeBreakdown: FeeBreakdown | null;
  coverage: CoveragePlanState;
  coverageTouched: boolean;
  furthestCoveredKey: string | null;
  coverageError?: string;
};

export function EnrollmentCourseCard({
  course,
  userId,
  defaultBillingMonth,
  currencySymbol,
  isEnrolling,
  enrollError,
  onUpdateCourse,
  onRemove,
}: {
  course: CourseSelection;
  userId: string;
  defaultBillingMonth: Date;
  currencySymbol: string;
  isEnrolling: boolean;
  enrollError: string | null;
  onUpdateCourse: (
    courseId: number,
    patch: Partial<CourseSelection>,
  ) => void;
  onRemove: () => void;
}) {
  const applyPatch = useCallback(
    (patch: Partial<CourseSelection>) =>
      onUpdateCourse(course.courseId, patch),
    [course.courseId, onUpdateCourse],
  );

  const billingAsOf = course.coverage.monthDate.toISOString().slice(0, 10);

  const selectableMonths = useMemo(
    () => selectableMonthsFromCourseDates(course.startDate, course.endDate),
    [course.startDate, course.endDate],
  );

  const userPaymentsQuery = useQuery({
    queryKey: ["enrollment-payment-user-payments", userId, course.courseId],
    enabled: Boolean(userId.trim()) && isValidApiEntityIdParam(userId),
    queryFn: async () => {
      const res = await searchEntities(
        "user-payments",
        { size: -1 },
        {
          filter_params: [
            {
              field_name: "user_id",
              operator: operatorEnum.exact,
              value: userId.trim(),
            },
            {
              field_name: "course_id",
              operator: operatorEnum.exact,
              value: String(course.courseId),
            },
          ],
        },
      );
      return (res.data?.data ?? []) as Array<{
        covered_months?: { year: number; month_index: number }[];
        issued_at?: string | null;
      }>;
    },
  });

  const furthestCoveredKey = useMemo(
    () => furthestCoveredMonthKeyFromPayments(userPaymentsQuery.data ?? []),
    [userPaymentsQuery.data],
  );

  useEffect(() => {
    if (course.furthestCoveredKey === furthestCoveredKey) return;
    applyPatch({ furthestCoveredKey });
  }, [applyPatch, course.furthestCoveredKey, furthestCoveredKey]);

  const resolvedCoverage = useMemo(
    () =>
      resolveCoveragePayload(course.coverage, selectableMonths, {
        furthestCoveredKey,
      }),
    [course.coverage, selectableMonths, furthestCoveredKey],
  );

  const clampNote = useMemo(
    () =>
      coverageClampNote(
        defaultBillingMonth,
        course.coverage.monthDate,
        course.startDate,
      ),
    [course.coverage.monthDate, course.startDate, defaultBillingMonth],
  );

  const paymentPlan = course.paymentPlan;
  const planPrice = useMemo(() => {
    if (paymentPlan == null || typeof paymentPlan === "number") return null;
    const price = paymentPlan.price;
    if (price == null) return null;
    const parsed = Number(price);
    return Number.isFinite(parsed) ? parsed : null;
  }, [paymentPlan]);

  const billingType = useMemo(() => {
    if (paymentPlan == null || typeof paymentPlan === "number") return null;
    return paymentPlan.billing_type ?? null;
  }, [paymentPlan]);

  const planSummary = useMemo(() => {
    const parts: string[] = [];
    if (planPrice != null) {
      parts.push(formatMoney(planPrice, currencySymbol));
    }
    const billingLabel = formatPaymentPlanBillingType(billingType);
    if (billingLabel) parts.push(billingLabel);
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [billingType, currencySymbol, planPrice]);

  const eligibleDiscountsQuery = useQuery({
    queryKey: ["eligible-discounts", course.enrollmentId, billingAsOf],
    enabled: course.enrollmentId != null,
    queryFn: async () => {
      const res = await axiosClient.get(
        `user-courses/${course.enrollmentId}/eligible-discounts`,
        { params: { as_of: billingAsOf } },
      );
      return res.data?.data as {
        current:
          | {
              discount?: number | null;
              snapshot_discount_type: string;
              snapshot_scope: string;
              snapshot_percent_value?: string | null;
              snapshot_fixed_amount?: string | null;
              discount_name?: string | null;
            }
          | Array<{
              discount?: number | null;
              snapshot_discount_type: string;
              snapshot_scope: string;
              snapshot_percent_value?: string | null;
              snapshot_fixed_amount?: string | null;
              discount_name?: string | null;
            }>
          | null;
        discounts: Discount[];
      };
    },
  });

  const eligibleDiscountOptions = useMemo(() => {
    const list = [...(eligibleDiscountsQuery.data?.discounts ?? [])];
    const raw = eligibleDiscountsQuery.data?.current;
    const currents = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
    for (const current of currents) {
      if (
        current?.discount != null &&
        !list.some((discount) => discount.id === current.discount)
      ) {
        list.unshift({
          id: current.discount,
          name: current.discount_name ?? `Discount #${current.discount}`,
          discount_type: current.snapshot_discount_type as Discount["discount_type"],
          percent_value: current.snapshot_percent_value
            ? Number(current.snapshot_percent_value)
            : null,
          fixed_amount: current.snapshot_fixed_amount
            ? Number(current.snapshot_fixed_amount)
            : null,
          scope: current.snapshot_scope as Discount["scope"],
          eligibility_type: DiscountEligibilityType.none,
          is_active: true,
        });
      }
    }
    return list;
  }, [eligibleDiscountsQuery.data]);

  const invoicedAmount = useMemo(() => {
    if (planPrice == null) return null;
    const selectedDiscounts = resolveSelectedDiscountSnapshots({
      discountIds: course.discountSelection.discountIds,
      discounts: eligibleDiscountOptions,
    });
    return resolveTermFeeFromDiscounts({
      planPrice,
      periodCount: resolvedCoverage.periodCount,
      billingType,
      selectedDiscounts,
    });
  }, [
    billingType,
    course.discountSelection.discountIds,
    eligibleDiscountOptions,
    planPrice,
    resolvedCoverage.periodCount,
  ]);

  const selectedDiscountCatalog = useMemo(() => {
    const ids = new Set(course.discountSelection.discountIds);
    return eligibleDiscountOptions.filter((d) => ids.has(d.id));
  }, [course.discountSelection.discountIds, eligibleDiscountOptions]);

  const feeBreakdown = useMemo(() => {
    if (planPrice == null) return null;
    return computeEnrollmentFeeBreakdown({
      planPrice,
      periodCount: resolvedCoverage.periodCount,
      billingType,
      discounts: selectedDiscountCatalog,
    });
  }, [billingType, planPrice, resolvedCoverage.periodCount, selectedDiscountCatalog]);

  useEffect(() => {
    const patch: Partial<CourseSelection> = {};
    if (course.planPrice !== planPrice) patch.planPrice = planPrice;
    if (course.invoicedAmount !== invoicedAmount) {
      patch.invoicedAmount = invoicedAmount;
    }
    if (
      JSON.stringify(course.feeBreakdown) !== JSON.stringify(feeBreakdown)
    ) {
      patch.feeBreakdown = feeBreakdown;
    }
    if (Object.keys(patch).length > 0) applyPatch(patch);
  }, [
    applyPatch,
    course.feeBreakdown,
    course.invoicedAmount,
    course.planPrice,
    feeBreakdown,
    invoicedAmount,
    planPrice,
  ]);

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{course.title}</p>
          {planSummary ? (
            <p className="text-xs text-text-muted">{planSummary}</p>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2"
          onClick={onRemove}
          aria-label={`Remove ${course.title}`}
        >
          <Xmark className="size-4" aria-hidden />
        </Button>
      </div>
      {isEnrolling ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Spinner className="size-4" aria-hidden />
          Enrolling student…
        </div>
      ) : enrollError ? (
        <p className="text-sm text-amber-800">{enrollError}</p>
      ) : course.enrollmentId == null ? (
        <p className="text-sm text-amber-800">
          Student is not enrolled in this course.
        </p>
      ) : courseHasBillablePaymentPlan(paymentPlan) ? (
        <PaymentDiscountPicker
          userCourseId={course.enrollmentId}
          asOf={billingAsOf}
          value={course.discountSelection}
          onChange={(next) => applyPatch({ discountSelection: next })}
        />
      ) : null}
      <CoverageFields
        plan={course.coverage}
        onChange={(next) =>
          applyPatch({ coverage: next, coverageTouched: true, coverageError: undefined })
        }
        selectableMonths={selectableMonths}
        courseStartDate={course.startDate}
        scheduleLoading={false}
        disabled={isEnrolling}
        planError={course.coverageError}
        planErrorFieldName={`coverage-error-${course.courseId}`}
        clampNote={clampNote}
        legend="Coverage"
        idPrefix={`course-${course.courseId}`}
      />
      {furthestCoveredKey ? (
        <p className="text-xs text-text-muted">
          Already covered through{" "}
          {(() => {
            const [y, m] = furthestCoveredKey.split("-").map(Number);
            return formatMonthLong(y, m);
          })()}
          .
        </p>
      ) : null}
      {invoicedAmount != null ? (
        <p className="text-sm text-text-muted">
          Suggested amount: {formatMoney(invoicedAmount, currencySymbol)}
          {resolvedCoverage.periodCount > 1
            ? ` (${resolvedCoverage.periodCount} months)`
            : null}
        </p>
      ) : null}
    </div>
  );
}
