import {
  formatPayrollHours,
  formatPayrollMoney,
} from "@/lib/payroll/format";
import {
  buildSessionBasedCourseSummaries,
  buildTrphillipsCourseSummaries,
  type PayrollSessionRow,
  type TrphillipsByCourseAggregate,
} from "@/lib/payroll/group-by-course";
import { PayrollCalculationStrategy } from "@/types/organization";

export type PayslipLineItem = {
  id: string;
  label: string;
  amount: string;
};

type PayrollAggregateForPayslip = {
  total_earnings?: number;
  session_count?: number;
  per_session_rate?: number;
  by_course?: TrphillipsByCourseAggregate;
};

export function buildPayslipLineItems(
  aggregate: PayrollAggregateForPayslip | undefined,
  strategy: PayrollCalculationStrategy,
  currencySymbol: string,
  sessionRows: PayrollSessionRow[] = [],
): PayslipLineItem[] {
  if (sessionRows.length === 0) {
    if (!aggregate?.total_earnings && aggregate?.total_earnings !== 0) {
      return [];
    }
    return [
      {
        id: "total",
        label: "Total earnings",
        amount: formatPayrollMoney(aggregate.total_earnings ?? 0, currencySymbol),
      },
    ];
  }

  if (strategy === PayrollCalculationStrategy.session_based) {
    const summaries = buildSessionBasedCourseSummaries(
      sessionRows,
      aggregate?.per_session_rate ?? 0,
    );
    return summaries.map((summary) => {
      const sessionLabel =
        summary.sessionCount === 1 ? "1 session" : `${summary.sessionCount} sessions`;
      return {
        id: `course-${summary.courseId}`,
        label: `${summary.courseTitle} · ${sessionLabel}`,
        amount: formatPayrollMoney(summary.earnings, currencySymbol),
      };
    });
  }

  const summaries = buildTrphillipsCourseSummaries(
    sessionRows,
    aggregate?.by_course,
  );

  return summaries.flatMap((summary) => {
    const items: PayslipLineItem[] = [];

    if (summary.regularHours > 0) {
      const regularEarnings =
        summary.totalHours > 0
          ? summary.earnings * (summary.regularHours / summary.totalHours)
          : summary.earnings;
      items.push({
        id: `course-${summary.courseId}-regular`,
        label: `${summary.courseTitle} · ${formatPayrollHours(summary.regularHours)} hrs`,
        amount: formatPayrollMoney(regularEarnings, currencySymbol),
      });
    }

    if (summary.extraHours > 0) {
      const extraEarnings =
        summary.totalHours > 0
          ? summary.earnings * (summary.extraHours / summary.totalHours)
          : summary.earnings;
      items.push({
        id: `course-${summary.courseId}-extra`,
        label: `${summary.courseTitle} · ${formatPayrollHours(summary.extraHours)} hrs · extra`,
        amount: formatPayrollMoney(extraEarnings, currencySymbol),
      });
    }

    return items;
  });
}
