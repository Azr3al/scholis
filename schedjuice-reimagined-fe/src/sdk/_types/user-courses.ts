/**
 * Minimal UserCourse type for SDK list hooks.
 */

export type UserCourse = {
  id: number;
  user?: {
    id: number;
    name?: string | null;
    email?: string | null;
    alternative_name?: string | null;
  } | number | null;
  course?: { id: number; title?: string | null } | number | null;
  assigned_as?: string | null;
  assigned_as_role?: { id: number; name?: string | null } | null;
};
