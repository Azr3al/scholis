/** Backend sends USD amounts as decimal strings (e.g. `"123.45"`). */
export type UsdDecimalString = string;

export type CashFlowTrphillipsRequestBody = {
  month: number;
  year: number;
  course_id: number;
};

export type CashFlowRow = {
  date: string;
  student_count: number;
  income: UsdDecimalString | null;
  expense: UsdDecimalString | null;
  profit: UsdDecimalString | null;
};

export type CashFlowAggregate = {
  total_income: UsdDecimalString | null;
  total_expense: UsdDecimalString | null;
  total_profit: UsdDecimalString | null;
};

/**
 * Payload fields returned with the cash-flow response (POST `/api/v1/cash-flow/trphillips`).
 * Some clients receive these at the top level; others nest under `data`.
 */
export type CashFlowTrphillipsPayload = {
  rows: CashFlowRow[];
  aggregate: CashFlowAggregate;
  /** Current calendar month in tenant TZ — figures may change until the month ends. */
  is_ongoing_month?: boolean;
};

export type CashFlowTrphillipsApiEnvelope = {
  isError?: boolean;
  message?: string;
  rows?: CashFlowRow[];
  aggregate?: CashFlowAggregate;
  is_ongoing_month?: boolean;
  data?: CashFlowTrphillipsPayload;
};

export type SchoolOverviewRequestBody = {
  month: number;
  year: number;
  q?: string;
  page?: number;
  size?: number;
  sorts?: string[];
};

export type SchoolOverviewCourse = {
  course_id: number;
  course_title: string;
  course_code?: string | null;
  subject_names?: string;
  mt_name?: string;
  total_income: UsdDecimalString;
  total_expense: UsdDecimalString;
  total_profit: UsdDecimalString;
};

export type SchoolOverviewPayload = {
  courses: SchoolOverviewCourse[];
  /** Filtered match count for pagination (full month when `q` is empty). */
  count?: number;
  grand_aggregate: CashFlowAggregate;
  /** Current calendar month in tenant TZ — figures may change until the month ends. */
  is_ongoing_month?: boolean;
};

export type SchoolOverviewApiEnvelope = {
  isError?: boolean;
  message?: string;
  courses?: SchoolOverviewCourse[];
  count?: number;
  grand_aggregate?: CashFlowAggregate;
  is_ongoing_month?: boolean;
  data?: SchoolOverviewPayload;
};
