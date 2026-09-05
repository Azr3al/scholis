/**
 * Minimal UserEvent type for SDK list hooks (finance checkin histories).
 */

export type UserEvent = {
  id: number;
  checkin_time?: string | null;
  checkout_time?: string | null;
  today_activities?: string | null;
  checkin_image?: string | null;
  hourly_rate_at_calculation?: string | number | null;
  student_bonus_rate_at_calculation?: string | number | null;
  student_count_in_course_at_calculation?: string | number | null;
  event?: {
    id?: number;
    date?: string;
    time_from?: string;
    time_to?: string;
    course?: { id?: number; title?: string } | null;
  } | null;
  user?: { id?: number; name?: string } | null;
};
