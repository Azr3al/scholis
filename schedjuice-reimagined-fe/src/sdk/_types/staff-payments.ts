/**
 * Minimal StaffPayment type for SDK list hooks.
 */

export type StaffPaymentProof = {
  id?: number;
  filename?: string | null;
  file_url?: string | null;
  created_at?: string | null;
};

export type StaffPayment = {
  id: number;
  amount?: string | number | null;
  amount_currency?: string | null;
  paid_at?: string | null;
  pay_period_year?: number | null;
  pay_period_month?: number | null;
  confirmed_at?: string | null;
  transaction_id?: string | null;
  remarks?: string | null;
  screenshot?: string | null;
  created_at?: string;
  updated_at?: string;
  proofs?: StaffPaymentProof[] | null;
  user?: { id?: number; name?: string | null } | null;
  payment_info?: {
    id?: number;
    account_name?: string | null;
    bank_type?: string | null;
    description?: string | null;
    is_default?: boolean;
  } | null;
  created_by?: { id?: number; name?: string | null } | null;
};
