export type FinanceHomepagePeriod =
  | "single_month"
  | "last_3_months"
  | "last_6_months"
  | "last_12_months"
  | "all_time"
  | "custom"
  | "intake_range";

export type FinancePieGroupBy =
  | "payment_status"
  | "bank_type"
  | "payment_method"
  | "course";

export type FinanceHomepageRequest = {
  program_id: number;
  intake_id?: number | null;
  period: FinanceHomepagePeriod;
  date_from?: string;
  date_to?: string;
  pie_group_by: FinancePieGroupBy;
};

export type FinanceHomepageComparison = {
  collected_amount_pct: number | null;
  collected_count_pct: number | null;
  unpaid_amount_pct: number | null;
  unpaid_count_pct: number | null;
};

export type FinanceHomepageSummary = {
  collected_amount: string;
  collected_count: number;
  unpaid_amount: string;
  unpaid_count: number;
  comparison: FinanceHomepageComparison | null;
};

export type FinanceHomepageLinePoint = {
  date: string;
  amount: string;
};

export type FinanceHomepagePieSlice = {
  key: string;
  label: string;
  amount: string;
  count: number;
};

export type FinanceHomepageMeta = {
  program: {
    id: number;
    name: string;
    course_creation_method: string;
  } | null;
  period_label: string;
  date_from: string | null;
  date_to: string | null;
  anchor_month: { year: number; month: number } | null;
};

export type FinanceHomepageResponse = {
  summary: FinanceHomepageSummary;
  line_chart: {
    current: FinanceHomepageLinePoint[];
    ghost: FinanceHomepageLinePoint[];
    ghost_label: string | null;
  };
  pie_chart: {
    slices: FinanceHomepagePieSlice[];
  };
  meta: FinanceHomepageMeta;
};

export type FinanceHomepageFilterState = {
  programId: string;
  intakeId: string;
  period: FinanceHomepagePeriod;
  dateFrom: Date | null;
  dateTo: Date | null;
  pieGroupBy: FinancePieGroupBy;
};
