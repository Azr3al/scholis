/**
 * Minimal Discount type for SDK list hooks.
 */

export type Discount = {
  id: number;
  name: string;
  discount_type?: string;
  percent_value?: number | null;
  fixed_amount?: number | string | null;
  scope?: string;
  eligibility_type?: string;
  early_bird_days?: number | null;
  bulk_min_courses?: number | null;
  is_active?: boolean;
};
