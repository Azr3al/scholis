"use client";

import { formatDate } from "@/helpers/date";
import { formatMoney } from "@/helpers/money";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import type { PendingPaymentRow } from "@/hooks/finances/use-make-payment-cart";
import type { courseType } from "@/types/course";
import { Button } from "@/components/primitives";

type CheckoutCartRecapProps = {
  items: Array<
    PendingPaymentRow & {
      course: courseType;
      billing_start_date: Date | string;
      billing_end_date: Date | string;
    }
  >;
  total: number;
  onEditCart: () => void;
};

export function CheckoutCartRecap({
  items,
  total,
  onEditCart,
}: CheckoutCartRecapProps) {
  const currencySymbol = useTenantCurrencySymbol();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-serif text-xl text-text-primary">Your cart</p>
        <Button type="button" variant="ghost" size="sm" onClick={onEditCart}>
          Edit cart
        </Button>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start justify-between gap-3 text-sm"
          >
            <span className="min-w-0 text-text-primary">{item.course.title}</span>
            <span className="shrink-0 font-mono text-text-secondary">
              {formatMoney(String(item.invoiced_amount ?? 0), currencySymbol)}
            </span>
          </li>
        ))}
      </ul>
      <p className="font-mono text-lg text-text-primary">
        Total {formatMoney(total, currencySymbol)}
      </p>
      <p className="text-xs text-text-muted">
        {items.length === 1
          ? `Covers ${formatDate(items[0].billing_start_date)} to ${formatDate(items[0].billing_end_date)}`
          : `${items.length} courses selected`}
      </p>
    </div>
  );
}
