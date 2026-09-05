"use client";

import { Button, Sheet } from "@/components/primitives";
import { formatDate, formatDateTime } from "@/helpers/date";
import {
  buildStaffPayslipFilename,
  buildStaffPayslipPayload,
  downloadStaffPayslip,
} from "@/helpers/staff-payslip";
import { formatPayrollMoney } from "@/lib/payroll/format";
import { buildPayslipLineItems } from "@/lib/payroll/payslip-line-items";
import type { PayrollSessionRow } from "@/lib/payroll/group-by-course";
import { cn } from "@/lib/utils";
import type { StaffPayment } from "@/sdk";
import { useConfirmStaffPayment } from "@/sdk/hooks/staff-payments";
import { PayrollCalculationStrategy } from "@/types/organization";
import { PayrollPaymentStatus } from "@/types/payroll-payment";
import type { organizationType } from "@/types/organization";
import { format } from "date-fns";
import { Page as FileText } from "iconoir-react";
import { useMemo } from "react";

type PayrollAggregate = {
  total_earnings?: number;
  session_count?: number;
  per_session_rate?: number;
  by_course?: Record<string | number, { earnings: number; total_hours: number }>;
};

type PayrollPayslipSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payPeriodDate: Date;
  status: PayrollPaymentStatus;
  staffPayment: StaffPayment | null;
  aggregate: PayrollAggregate | undefined;
  sessionRows: PayrollSessionRow[];
  strategy: PayrollCalculationStrategy;
  currencySymbol: string;
  tenant: Pick<organizationType, "name" | "logo">;
  canConfirm: boolean;
};

function primaryProof(staffPayment: StaffPayment | null) {
  if (!staffPayment) return null;
  const proof = staffPayment.proofs?.[0];
  if (proof?.file_url) return proof;
  if (staffPayment.screenshot) {
    return {
      filename: "Receipt",
      file_url: staffPayment.screenshot,
    };
  }
  return null;
}

function payPeriodEndDay(payPeriodDate: Date): string {
  return format(
    new Date(payPeriodDate.getFullYear(), payPeriodDate.getMonth() + 1, 0),
    "d",
  );
}

function payPeriodSubtitle(
  payPeriodDate: Date,
  isPaid: boolean,
  paidAt?: string | null,
): string {
  const start = format(payPeriodDate, "MMM d");
  const end = payPeriodEndDay(payPeriodDate);
  if (isPaid && paidAt) {
    return `Pay period ${start}–${end} · paid ${formatDate(paidAt)}`;
  }
  return `Pay period ${start}–${end} · payment pending`;
}

export function PayrollPayslipSheet({
  open,
  onOpenChange,
  payPeriodDate,
  status,
  staffPayment,
  aggregate,
  sessionRows,
  strategy,
  currencySymbol,
  tenant,
  canConfirm,
}: PayrollPayslipSheetProps) {
  const confirmMutation = useConfirmStaffPayment();
  const payPeriodLabel = format(payPeriodDate, "MMMM yyyy");
  const isPaid = status === PayrollPaymentStatus.Paid;

  const lineItems = useMemo(
    () =>
      buildPayslipLineItems(
        aggregate,
        strategy,
        currencySymbol,
        sessionRows,
      ),
    [aggregate, strategy, currencySymbol, sessionRows],
  );

  const totalEarnings =
    isPaid && staffPayment?.amount != null
      ? Number(staffPayment.amount)
      : (aggregate?.total_earnings ?? 0);

  const proof = primaryProof(staffPayment);
  const showConfirm =
    canConfirm && isPaid && staffPayment && !staffPayment.confirmed_at;
  const showDownload = isPaid && staffPayment != null;

  const handleDownload = async () => {
    const payload = buildStaffPayslipPayload({
      tenant,
      payPeriodLabel,
      payPeriodYear: payPeriodDate.getFullYear(),
      payPeriodMonth: payPeriodDate.getMonth() + 1,
      paidAtLabel: staffPayment?.paid_at
        ? formatDate(staffPayment.paid_at)
        : null,
      lineItems,
      totalEarnings,
      currencySymbol,
    });
    await downloadStaffPayslip(
      payload,
      buildStaffPayslipFilename(payPeriodLabel),
    );
  };

  const handleConfirm = () => {
    if (!staffPayment?.id) return;
    confirmMutation.mutate(staffPayment.id, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Sheet.Root open={open} onOpenChange={onOpenChange}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:w-[min(28rem,90vw)]"
        >
          <div className="space-y-1 border-b border-border px-6 py-5 pr-12 text-left">
            <Sheet.Title className="font-serif text-2xl text-text-primary">
              Payslip — {payPeriodLabel}
            </Sheet.Title>
            <Sheet.Description className="text-sm text-text-secondary">
              {payPeriodSubtitle(payPeriodDate, isPaid, staffPayment?.paid_at)}
            </Sheet.Description>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className="space-y-3">
              {lineItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-4 text-sm"
                >
                  <span className="text-text-secondary">{item.label}</span>
                  <span className="shrink-0 font-medium tabular-nums text-text-primary">
                    {item.amount}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-semibold">
                <span>Total</span>
                <span className="tabular-nums">
                  {formatPayrollMoney(totalEarnings, currencySymbol)}
                </span>
              </div>
            </div>

            {isPaid && proof?.file_url ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="flex min-h-32 items-center justify-center bg-brand/10 p-6">
                  {proof.file_url.match(/\.(png|jpe?g|gif|webp)(\?|$)/i) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={proof.file_url}
                      alt={proof.filename ?? "Payment proof"}
                      className="max-h-40 max-w-full object-contain"
                    />
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-text-secondary">
                      <FileText className="size-5 shrink-0" aria-hidden />
                      <span>{proof.filename ?? "Receipt.pdf"}</span>
                    </div>
                  )}
                </div>
                <p className="border-t border-border px-4 py-2 text-xs text-text-muted">
                  Uploaded by {staffPayment?.created_by?.name ?? "HR"}
                  {staffPayment?.paid_at
                    ? ` · ${formatDateTime(staffPayment.paid_at)}`
                    : ""}
                </p>
              </div>
            ) : null}
          </div>

          {(showConfirm || showDownload) ? (
            <div className="flex flex-col gap-2 border-t border-border px-6 py-4">
              {showConfirm ? (
                <Button
                  className="w-full"
                  onClick={handleConfirm}
                  isLoading={confirmMutation.isPending}
                >
                  Confirm I received this payment
                </Button>
              ) : null}
              {showDownload ? (
                <Button
                  variant="secondary"
                  className={cn("w-full")}
                  onClick={() => void handleDownload()}
                >
                  Download payslip
                </Button>
              ) : null}
            </div>
          ) : null}
        </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
