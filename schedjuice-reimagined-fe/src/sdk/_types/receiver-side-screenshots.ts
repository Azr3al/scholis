/**
 * Minimal ReceiverSideScreenshot type for SDK list hooks.
 */

export type ReceiverSideScreenshot = {
  id: number;
  transaction_id?: string | null;
  is_matched?: boolean;
  updated_at?: string;
  user_payment?: {
    id?: number;
    transaction_id?: string | null;
    issued_at?: string | null;
    billing_start_date?: string | null;
    status?: string;
    user?: { name?: string } | null;
    course?: { id?: number; title?: string } | null;
  } | null;
};
