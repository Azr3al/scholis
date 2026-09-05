export interface BillingRow {
  id: number;
  billing_date: string;
  active_user_count: number;
  cost_per_account_at_creation: number;
  created_at: string;
  updated_at: string;
}

export interface BillingResponse {
  isError: boolean;
  message: string;
  date: string;
  year: number;
  month: number;
  total_payment: number;
  data: BillingRow[];
}
