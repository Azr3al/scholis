/**
 * Minimal PaymentMethod type for SDK list hooks.
 */

export type PaymentMethod = {
  id: number;
  name: string;
  payment_bank?: string | null;
  bank_account_number?: string | null;
  description?: string | null;
};
