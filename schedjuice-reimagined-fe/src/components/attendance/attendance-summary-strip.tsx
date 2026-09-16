"use client";

import {
  formatAttendanceFraction,
  pickClassAggregateForMonth,
} from "@/helpers/attendance-dashboard";
import { attendanceRateBadgeClass } from "@/helpers/attendance-god-view";
import { cn } from "@/lib/utils";
import type { CourseAttendanceSummary } from "@/types/attendance";

type AttendanceSummaryStripProps = {
  summary: CourseAttendanceSummary | null;
  selectedMonthAnchor: string | null;
  isLoading?: boolean;
};

function SummaryCard({
  label,
  pct,
  attended,
  total,
  isLoading,
}: {
  label: string;
  pct: number;
  attended: number;
  total: number;
  isLoading?: boolean;
}) {
  return (
    <div className="min-w-[10rem] rounded-lg border border-border-subtle bg-surface-elevated px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      {isLoading ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-surface-hover" />
      ) : (
        <>
          <p
            className={cn(
              "mt-1 font-mono text-2xl tabular-nums",
              attendanceRateBadgeClass(pct),
            )}
          >
            {pct}%
          </p>
          <p className="mt-0.5 text-sm text-text-muted">
            {formatAttendanceFraction(attended, total)} sessions
          </p>
        </>
      )}
    </div>
  );
}

export function AttendanceSummaryStrip({
  summary,
  selectedMonthAnchor,
  isLoading,
}: AttendanceSummaryStripProps) {
  const monthAggregate = summary
    ? pickClassAggregateForMonth(summary, selectedMonthAnchor)
    : null;
  const courseAggregate = summary?.class_aggregate.course ?? null;
  const showMonthCard =
    selectedMonthAnchor != null && selectedMonthAnchor !== "all";

  if (!isLoading && !summary) return null;
  if (
    !isLoading &&
    !showMonthCard &&
    (courseAggregate == null || courseAggregate.total === 0)
  ) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {showMonthCard ? (
        <SummaryCard
          label="Class attendance (this month)"
          pct={monthAggregate?.pct ?? 0}
          attended={monthAggregate?.attended ?? 0}
          total={monthAggregate?.total ?? 0}
          isLoading={isLoading}
        />
      ) : null}
      <SummaryCard
        label="Course to date"
        pct={courseAggregate?.pct ?? 0}
        attended={courseAggregate?.attended ?? 0}
        total={courseAggregate?.total ?? 0}
        isLoading={isLoading}
      />
    </div>
  );
}
