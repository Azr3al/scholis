/**
 * Minimal PaymentInfo type for SDK list hooks.
 */

export type PaymentInfo = {
  id: number;
  account_name?: string | null;
  bank_type?: string | null;
  description?: string | null;
  is_default?: boolean;
  updated_at?: string;
  user?: { id: number; name?: string } | null;
};
