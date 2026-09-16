import type { FinanceHomepagePeriod } from "@/types/finance/homepage";

export type FeeLifecycleBreakdown = "none" | "payment_method" | "bank";

export type FeeLifecycleRequest = {
  program_id: number;
  intake_id?: number | null;
  period: FinanceHomepagePeriod;
  date_from?: string;
  date_to?: string;
  breakdown: FeeLifecycleBreakdown;
};

export type FeeLifecycleNode = {
  key: string;
  label: string;
  amount: string;
  is_estimated: boolean;
};

export type FeeLifecycleLink = {
  source: string;
  target: string;
  amount: string;
  payment_count: number;
  student_count: number;
  is_estimated: boolean;
};

export type FeeLifecycleResponse = {
  nodes: FeeLifecycleNode[];
  links: FeeLifecycleLink[];
  unattributed: { amount: string; payment_count: number };
  meta: {
    period_label: string;
    date_from: string | null;
    date_to: string | null;
    cash_received: string;
    refund_clamped: boolean;
  };
};

export type FeeLifecycleFilterState = {
  programId: string;
  intakeId: string;
  period: FinanceHomepagePeriod;
  dateFrom: Date | null;
  dateTo: Date | null;
  breakdown: FeeLifecycleBreakdown;
};
