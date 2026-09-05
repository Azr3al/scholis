/**
 * Minimal UserAttendance type for SDK list hooks.
 */

export type UserAttendance = {
  id: number;
  attendance_date?: string | null;
  join_datetime?: string | null;
  leave_datetime?: string | null;
  duration_seconds?: number | null;
  hourly_rate_at_creation?: string | number | null;
  course?: { id?: number; title?: string } | null;
  user?: { id?: number; name?: string } | null;
  event?: {
    id?: number;
    date?: string;
    title?: string;
  } | null;
  hourly_rate_at_calculation?: string | number | null;
  [key: string]: unknown;
};
