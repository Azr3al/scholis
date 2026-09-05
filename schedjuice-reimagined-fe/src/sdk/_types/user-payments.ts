/**
 * Minimal UserPayment type for SDK list hooks.
 */

export type UserPayment = {
  id: number;
  description?: string | null;
  remarks?: string | null;
  transaction_id?: string | null;
  invoiced_amount?: string | number | null;
  parsed_amount?: string | number | null;
  actual_amount?: string | number | null;
  base_amount?: string | number | null;
  discount_amount?: string | number | null;
  discount_label?: string | null;
  discount_lines?: Array<{
    enrollment_discount_id?: number | null;
    label: string;
    amount: string | number | null;
  }> | null;
  status?: string;
  created_at?: string;
  updated_at?: string;
  issued_at?: string | null;
  payment_date?: string | null;
  billing_start_date?: string | null;
  billing_end_date?: string | null;
  date_on_screenshot?: string | null;
  screenshot?: string | null;
  course?: {
    id?: number;
    title?: string;
    start_date?: string | null;
    end_date?: string | null;
  } | null;
  user?: { id?: number; name?: string } | null;
  user_id?: number;
  group_id?: number | null;
  shared_screenshot_courses?: { id: number; title: string }[];
  covered_months?: { year: number; month_index: number }[];
  payment_method?: {
    id?: number | null;
    name?: string | null;
    payment_bank?: string | null;
  } | null;
  created_by?: { id?: number; name?: string | null } | null;
  verified_by?: { id?: number; name?: string | null } | null;
  is_installment?: boolean;
  installment_cumulative_percent?: string | null;
  installment_covered_through?: { year: number; month_index: number } | null;
};
