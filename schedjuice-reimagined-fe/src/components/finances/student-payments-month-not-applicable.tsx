"use client";

import { Button } from "@/components/primitives";
import { CourseRange } from "@/components/course/course-range";
import {
  formatMonthYearLabel,
  resolveSuggestedPaymentMonth,
} from "@/helpers/student-payments-month-eligibility";

type StudentPaymentsMonthNotApplicableProps = {
  selectedMonth: Date;
  courseStartDate?: string | null;
  courseEndDate?: string | null;
  suggestedMonth: { year: number; month: number } | null;
  onGoToMonth: (date: Date) => void;
};

export function StudentPaymentsMonthNotApplicable({
  selectedMonth,
  courseStartDate,
  courseEndDate,
  suggestedMonth,
  onGoToMonth,
}: StudentPaymentsMonthNotApplicableProps) {
  const target =
    suggestedMonth ??
    resolveSuggestedPaymentMonth(courseStartDate, courseEndDate);
  const selectedLabel = formatMonthYearLabel(
    selectedMonth.getFullYear(),
    selectedMonth.getMonth() + 1,
  );

  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 border-b border-border-subtle py-12 text-center">
      <p className="text-sm font-medium text-foreground">
        Not applicable this month
      </p>
      <div className="mx-auto max-w-md space-y-1 text-center text-sm text-muted-foreground">
        <p>{selectedLabel} is outside this course&apos;s schedule.</p>
        {courseStartDate || courseEndDate ? (
          <CourseRange
            startDate={courseStartDate}
            endDate={courseEndDate}
            className="justify-center text-muted-foreground"
          />
        ) : null}
      </div>
      {target ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            onGoToMonth(new Date(target.year, target.month - 1, 1))
          }
        >
          Go to {formatMonthYearLabel(target.year, target.month)}
        </Button>
      ) : null}
    </div>
  );
}
