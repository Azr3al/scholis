"use client";

import { Badge } from "@/app/_chrome/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/_chrome/card";
import { Loader } from "@/components/form/loader";
import { formatDate } from "@/helpers/date";
import { formatPayrollMoney } from "@/lib/payroll/format";
import { cn } from "@/lib/utils";
import { PayrollPaymentStatus } from "@/types/payroll-payment";
import { CreditCard } from "iconoir-react";
import { addMonths, format, isSameMonth } from "date-fns";

type PayrollPaymentCardProps = {
  payPeriodDate: Date;
  status: PayrollPaymentStatus;
  amount: number | string | null | undefined;
  currencySymbol: string;
  paidAt?: string | null;
  confirmedAt?: string | null;
  isLoading?: boolean;
  onClick: () => void;
};

function paymentSubtitle(
  payPeriodDate: Date,
  status: PayrollPaymentStatus,
  paidAt?: string | null,
): string {
  const periodLabel = format(payPeriodDate, "MMMM yyyy");
  if (status === PayrollPaymentStatus.Paid && paidAt) {
    return `For ${periodLabel} · paid ${formatDate(paidAt)}`;
  }
  const nextMonth = format(addMonths(payPeriodDate, 1), "MMMM");
  return `For ${periodLabel} · expected early ${nextMonth}`;
}

export function PayrollPaymentCard({
  payPeriodDate,
  status,
  amount,
  currencySymbol,
  paidAt,
  confirmedAt,
  isLoading,
  onClick,
}: PayrollPaymentCardProps) {
  const isPaid = status === PayrollPaymentStatus.Paid;
  const isConfirmed = isPaid && Boolean(confirmedAt);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={cn(
        "w-full cursor-pointer text-left transition-colors",
        "rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "disabled:cursor-not-allowed disabled:opacity-70",
        !isLoading && "hover:opacity-95",
      )}
    >
      <Card className="h-full gap-4 py-5">
        <CardHeader className="px-5 pb-0">
          <div className="flex items-center gap-2 text-text-secondary">
            <CreditCard className="size-4 shrink-0 text-brand" aria-hidden />
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              Payment
            </CardTitle>
          </div>
          <CardAction>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Badge
                className={cn(
                  "border-transparent px-2 py-0.5 text-[11px] font-semibold uppercase",
                  isPaid
                    ? "bg-brand/15 text-brand"
                    : "bg-warning/15 text-warning",
                )}
              >
                {isPaid ? "Paid" : "Pending"}
              </Badge>
              {isConfirmed ? (
                <Badge className="border-transparent bg-brand/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-brand">
                  Confirmed
                </Badge>
              ) : null}
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-2 px-5 pt-0">
          <p className="text-3xl font-bold tabular-nums text-text-primary">
            {isLoading ? (
              <Loader />
            ) : amount != null && amount !== "" ? (
              formatPayrollMoney(amount, currencySymbol)
            ) : (
              "—"
            )}
          </p>
          <p className="text-sm text-text-muted">
            {paymentSubtitle(payPeriodDate, status, paidAt)}
          </p>
        </CardContent>
      </Card>
    </button>
  );
}

export function isPastPayPeriod(date: Date, now = new Date()): boolean {
  return !isSameMonth(date, now) && date < now;
}
