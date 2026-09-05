import { getUserTimezoneInfo } from "@/helpers/date";

export function CashFlowNotes() {
  return (
    <p className="max-w-3xl text-sm text-text-muted">
      Tenant timezone on the server; your local zone: {getUserTimezoneInfo().full}.
      Only checked-in/out sessions count (half-hour rounding). Expense is allocated from
      each teacher&apos;s course payroll; use the totals, not per-row expense, as the
      source of truth.
    </p>
  );
}
