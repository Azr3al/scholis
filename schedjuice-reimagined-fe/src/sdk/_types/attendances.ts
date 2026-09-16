/**
 * Minimal Attendance type for SDK list hooks (course checkin history).
 */

export type Attendance = {
  id: number;
  checkin_time?: string | null;
  checkout_time?: string | null;
  checkin_image?: string | null;
  today_activities?: string | null;
  join_datetime?: string | null;
  leave_datetime?: string | null;
  is_extra_class?: boolean | null;
  user?: {
    id?: number;
    name?: string;
    email?: string;
  } | null;
  event?: {
    id?: number;
    date?: string;
    time_from?: string;
    time_to?: string;
    title?: string | null;
  } | null;
  [key: string]: unknown;
};
