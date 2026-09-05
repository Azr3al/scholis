/**
 * Minimal User type for SDK list hooks.
 */

export type User = {
  id: number;
  name: string;
  email?: string | null;
  alternative_name?: string | null;
  code?: string | null;
  communication_email?: string | null;
  gender?: string | null;
  phone_number?: string | null;
  date_of_birth?: string | null;
  roles?: string[];
  is_active?: boolean;
  is_waiting_for_activation?: boolean;
  paid_until?: { year: number; month_index: number } | null;
  payment_status?: "never_paid" | "behind" | string | null;
  /** Set on unpaid-report rows, which are per (student, course). */
  course_id?: number | null;
  course_title?: string | null;
  course_join_requests?: Array<{
    status?: string;
    course?: { id?: number; title?: string } | number | null;
  }>;
  created_at?: string;
};
