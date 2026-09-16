"use client";

import { formatDate } from "@/helpers/date";
import { formatMoney } from "@/helpers/money";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { Button } from "@/components/primitives";
import type { courseType } from "@/types/course";

type PendingInvoiceRowProps = {
  paymentId: number;
  course: courseType;
  price: number | string;
  billingStartDate: Date | string;
  billingEndDate: Date | string;
  inCart: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

export function PendingInvoiceRow({
  course,
  price,
  billingStartDate,
  billingEndDate,
  inCart,
  disabled = false,
  onToggle,
}: PendingInvoiceRowProps) {
  const currencySymbol = useTenantCurrencySymbol();

  return (
    <div className="flex min-h-[52px] flex-col gap-3 border-b border-border-subtle py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="text-base text-text-primary">
          {course.title}
          {course.code ? (
            <span className="text-status-blue"> ({course.code})</span>
          ) : null}
        </p>
        <p className="text-sm text-text-muted">
          {formatDate(billingStartDate)} to {formatDate(billingEndDate)}
        </p>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
        <p className="font-mono text-lg text-accent">
          {formatMoney(String(price), currencySymbol)}
        </p>
        <Button
          type="button"
          variant={inCart ? "secondary" : "primary"}
          size="sm"
          disabled={disabled}
          onClick={onToggle}
        >
          {inCart ? "Remove" : "Add to cart"}
        </Button>
      </div>
    </div>
  );
}
