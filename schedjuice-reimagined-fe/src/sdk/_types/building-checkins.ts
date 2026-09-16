/**
 * Minimal BuildingCheckin type for SDK list hooks.
 */

export type BuildingCheckin = {
  id: number;
  date?: string;
  actual_checkin_time?: string | null;
  actual_checkout_time?: string | null;
  checkin_verification_method?: string | null;
  checkout_verification_method?: string | null;
  checkin_image?: string | null;
  checkout_image?: string | null;
  campus?: { id?: number; name?: string } | null;
  user?: {
    id?: number;
    name?: string;
    access_log_name?: string | null;
  } | null;
};
