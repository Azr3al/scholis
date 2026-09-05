"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/_chrome/card";
import { Loader } from "@/components/form/loader";
import {
  formatPayrollHours,
  formatPayrollMoney,
} from "@/lib/payroll/format";
import { PayrollCalculationStrategy } from "@/types/organization";
import { Clock, Dollar as DollarSign, Lock } from "iconoir-react";
import type { ReactNode } from "react";

type PayrollHoursCardProps = {
  isSessionBased: boolean;
  isLoading: boolean;
  sessionCount?: number;
  regularHours?: number;
  extraHours?: number;
  perSessionRate?: number;
  currencySymbol: string;
};

type PayrollEarningsCardProps = {
  isLoading: boolean;
  totalEarnings?: number;
  currencySymbol: string;
  isSessionBased: boolean;
  sessionCount?: number;
  regularHours?: number;
  extraHours?: number;
  perSessionRate?: number;
};

function SummaryCardShell({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Clock;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="h-full gap-4 py-5">
      <CardHeader className="px-5 pb-0">
        <div className="flex items-center gap-2 text-text-secondary">
          <Icon className="size-4 shrink-0 text-brand" aria-hidden />
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-text-secondary">
            {title}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-5 pt-0">{children}</CardContent>
    </Card>
  );
}

export function PayrollHoursCard({
  isSessionBased,
  isLoading,
  sessionCount,
  regularHours,
  extraHours,
  perSessionRate,
  currencySymbol,
}: PayrollHoursCardProps) {
  const totalHours = (regularHours ?? 0) + (extraHours ?? 0);

  return (
    <SummaryCardShell
      icon={Clock}
      title={isSessionBased ? "Total Sessions" : "Total Hours"}
    >
      <p className="text-3xl font-bold tabular-nums text-text-primary">
        {isLoading ? (
          <Loader />
        ) : isSessionBased ? (
          (sessionCount ?? 0)
        ) : (
          formatPayrollHours(totalHours)
        )}
      </p>
      {!isSessionBased && !isLoading && (
        <p className="text-sm text-text-muted">
          Regular: {formatPayrollHours(regularHours ?? 0)} · Extra:{" "}
          {formatPayrollHours(extraHours ?? 0)}
        </p>
      )}
      {isSessionBased && perSessionRate !== undefined && !isLoading && (
        <p className="text-sm text-text-muted">
          Per session: {formatPayrollMoney(perSessionRate, currencySymbol)}
        </p>
      )}
    </SummaryCardShell>
  );
}

export function PayrollEarningsCard({
  isLoading,
  totalEarnings,
  currencySymbol,
  isSessionBased,
  sessionCount,
  regularHours,
  extraHours,
  perSessionRate,
}: PayrollEarningsCardProps) {
  const detailLines: string[] = [];

  if (!isLoading && totalEarnings !== undefined) {
    if (isSessionBased && sessionCount !== undefined && perSessionRate !== undefined) {
      detailLines.push(
        `${sessionCount} sessions × ${formatPayrollMoney(perSessionRate, currencySymbol)}`,
      );
    } else if (!isSessionBased) {
      const reg = regularHours ?? 0;
      const extra = extraHours ?? 0;
      if (reg > 0 || extra > 0) {
        detailLines.push(
          `Regular: ${formatPayrollHours(reg)} · Extra: ${formatPayrollHours(extra)}`,
        );
      }
    }
  }

  return (
    <SummaryCardShell icon={DollarSign} title="Earnings">
      <p className="text-3xl font-bold tabular-nums text-text-primary">
        {isLoading ? (
          <Loader />
        ) : totalEarnings !== undefined ? (
          formatPayrollMoney(totalEarnings, currencySymbol)
        ) : (
          "N/A"
        )}
      </p>
      {detailLines.length > 0 && (
        <p className="text-sm text-text-muted">{detailLines.join(" · ")}</p>
      )}
    </SummaryCardShell>
  );
}

export function PayrollFinalizedHint({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <p className="flex items-center gap-2 text-sm text-text-muted">
      <Lock className="size-4 shrink-0" aria-hidden />
      This month is finalized.
    </p>
  );
}

export function payrollSummaryGridClassName() {
  return "grid grid-cols-1 gap-3 sm:grid-cols-3";
}

export type { PayrollHoursCardProps, PayrollEarningsCardProps };
