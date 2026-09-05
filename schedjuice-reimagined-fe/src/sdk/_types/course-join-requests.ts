/**
 * Minimal CourseJoinRequest type for SDK list hooks.
 */

export type CourseJoinRequest = {
  id: number;
  status?: string | null;
  created_at?: string | null;
  user?: { id?: number; name?: string | null; email?: string | null } | null;
  course?: { id: number } | number | null;
};
