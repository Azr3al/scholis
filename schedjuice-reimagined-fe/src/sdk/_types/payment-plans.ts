/**
 * Minimal PaymentPlan type for SDK list hooks.
 */

export type PaymentPlan = {
  id: number;
  name: string;
  price?: number | string | null;
  billing_type?: "per_period" | "whole_term" | null;
  per_hour_price?: number | string | null;
  created_at?: string;
  updated_at?: string;
};
