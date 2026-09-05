"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { CourseRange } from "@/components/course/course-range";
import { TeamsPaymentAssignmentStatusLine } from "@/components/finances/payments-grid/teams-payment-assignment-status-line";
import type {
  StudentPaymentAdminReportRow,
  StudentPaymentsAdminReportSummary,
  StudentPaymentsCourseMeta,
  StudentPaymentsCoursePaymentPlan,
} from "@/components/finances/student-payments-report";
import {
  computePaymentSummaryStats,
  type PaymentSummaryStats,
} from "@/components/finances/payments-grid/payment-grid-summary";
import {
  diffInMonths,
  getCourseMonthType,
  getOrdinalMonth,
} from "@/helpers/date";
import { canShowPaymentPlanFee } from "@/helpers/authorization";
import { formatMoney } from "@/helpers/money";
import {
  formatPaymentPlanBillingType,
} from "@/helpers/payment-plan-label";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";

type PaymentGridSummaryStripProps = {
  rows: StudentPaymentAdminReportRow[];
  apiSummary?: StudentPaymentsAdminReportSummary | null;
  currencySymbol: string;
  fixedCourseId?: string;
  courseMeta?: StudentPaymentsCourseMeta | null;
  selectedCourse?: StudentPaymentsCourseMeta | null;
  coursePaymentPlan?: StudentPaymentsCoursePaymentPlan | null;
  monthAnchor: Date;
  variant?: "report" | "recent-transactions";
  className?: string;
  monthApplicable?: boolean;
  totalCount?: number;
};

function StatPill({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-[4.5rem] flex-col gap-0.5 rounded-lg border border-border/60 bg-background/80 px-2.5 py-1.5",
        emphasis && "border-border bg-background shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
      )}
    >
      <span className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="truncate tabular-nums text-sm font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

function StatsRow({ stats, fixedCourseId }: { stats: PaymentSummaryStats; fixedCourseId?: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-stretch gap-2">
      <StatPill label="Total" value={stats.verifiedTotal} emphasis />
      <StatPill label="Unuploaded" value={stats.unuploaded} />
      <StatPill label="Uploaded" value={stats.uploaded} />
      <StatPill label="Verified" value={stats.verifiedCount} />
      {fixedCourseId ? (
        <>
          <StatPill label="Active" value={stats.activeStudents} />
          <StatPill label="Dropped" value={stats.droppedCount} />
        </>
      ) : (
        <StatPill label="Students" value={stats.activeStudents} />
      )}
    </div>
  );
}

function CoursePaymentPlanInline({
  plan,
  currencySymbol,
  showFee,
}: {
  plan: StudentPaymentsCoursePaymentPlan;
  currencySymbol: string;
  showFee: boolean;
}) {
  const name = plan.name?.trim() || "Plan";
  const billingLabel = formatPaymentPlanBillingType(plan.billing_type);
  const feeLabel =
    showFee && plan.price != null && plan.price !== ""
      ? formatMoney(plan.price, currencySymbol)
      : null;

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      <span>
        Plan <span className="font-medium text-foreground">{name}</span>
      </span>
      {feeLabel ? (
        <span>
          Fee <span className="font-medium text-foreground">{feeLabel}</span>
        </span>
      ) : null}
      {billingLabel ? (
        <span>
          Billing{" "}
          <span className="font-medium text-foreground">{billingLabel}</span>
        </span>
      ) : null}
    </div>
  );
}

function CourseMetaInline({
  course,
  monthAnchor,
  coursePaymentPlan,
  currencySymbol,
  showFee,
}: {
  course: StudentPaymentsCourseMeta;
  monthAnchor: Date;
  coursePaymentPlan?: StudentPaymentsCoursePaymentPlan | null;
  currencySymbol: string;
  showFee: boolean;
}) {
  const monthType =
    course.start_date != null ? getCourseMonthType(course.start_date) : null;
  const duration =
    course.start_date && course.end_date
      ? `${diffInMonths(
          new Date(course.start_date),
          new Date(course.end_date),
        )} mo · ${getOrdinalMonth(new Date(course.start_date), monthAnchor)}`
      : null;

  return (
    <div className="min-w-0 space-y-1">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className="truncate text-sm font-semibold tracking-tight text-foreground">
          {course.title ?? "Course"}
        </p>
        {course.id ? (
          <Link
            href={`/courses/${course.id}`}
            target="_blank"
            className="shrink-0 text-xs text-primary underline-offset-4 hover:underline"
          >
            View course
          </Link>
        ) : null}
      </div>
      {course.start_date || course.end_date ? (
        <CourseRange
          startDate={course.start_date}
          endDate={course.end_date}
          className="text-xs"
        />
      ) : null}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {monthType ? (
          <span>
            Month type{" "}
            <span className="font-medium text-foreground">{monthType}</span>
          </span>
        ) : null}
        {duration ? (
          <span>
            Duration{" "}
            <span className="font-medium text-foreground">{duration}</span>
          </span>
        ) : null}
      </div>
      {coursePaymentPlan ? (
        <CoursePaymentPlanInline
          plan={coursePaymentPlan}
          currencySymbol={currencySymbol}
          showFee={showFee}
        />
      ) : null}
      {course.id != null ? (
        <TeamsPaymentAssignmentStatusLine
          courseId={course.id}
          monthAnchor={monthAnchor}
        />
      ) : null}
    </div>
  );
}

export function PaymentGridSummaryStrip({
  rows,
  apiSummary,
  currencySymbol,
  fixedCourseId,
  courseMeta,
  selectedCourse,
  coursePaymentPlan,
  monthAnchor,
  variant = "report",
  className,
  monthApplicable = true,
  totalCount,
}: PaymentGridSummaryStripProps) {
  const { user } = useUser();
  const showFee = user ? canShowPaymentPlanFee(user) : false;
  const stats = computePaymentSummaryStats(
    rows,
    apiSummary,
    currencySymbol,
    fixedCourseId,
  );

  const courseContext =
    fixedCourseId && courseMeta
      ? courseMeta
      : selectedCourse?.id
        ? selectedCourse
        : null;

  if (variant === "recent-transactions") {
    const transactionTotal = totalCount ?? rows.length;
    let studentsPill: ReactNode = null;
    if (totalCount == null) {
      const students = new Set<number>();
      for (const r of rows) {
        if (r.user?.id != null) students.add(r.user.id);
      }
      studentsPill = <StatPill label="Students" value={students.size} />;
    }
    return (
      <div
        className={cn(
          "flex shrink-0 flex-wrap items-center gap-2 border-b border-border/70 bg-muted/15 px-3 py-2",
          className,
        )}
      >
        <StatPill label="Transactions" value={transactionTotal} emphasis />
        {studentsPill}
      </div>
    );
  }

  if (!courseContext) {
    return (
      <div
        className={cn(
          "flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/15 px-3 py-2",
          className,
        )}
      >
        <p className="text-xs text-muted-foreground">
          All courses · pick a course to see schedule and month context
        </p>
        <StatsRow stats={stats} fixedCourseId={fixedCourseId} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "shrink-0 gap-3 border-b border-border/70 bg-muted/15 px-3 py-2",
        monthApplicable
          ? "grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
          : "flex flex-col",
        className,
      )}
    >
      <CourseMetaInline
        course={courseContext}
        monthAnchor={monthAnchor}
        coursePaymentPlan={coursePaymentPlan}
        currencySymbol={currencySymbol}
        showFee={showFee}
      />
      {monthApplicable ? (
        <StatsRow stats={stats} fixedCourseId={fixedCourseId} />
      ) : null}
    </div>
  );
}
