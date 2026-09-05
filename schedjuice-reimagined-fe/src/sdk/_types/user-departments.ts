/**
 * Minimal UserDepartment type for SDK list hooks.
 */

export type UserDepartment = {
  id: number;
  user?: { id?: number; name?: string | null; email?: string | null } | null;
  job?: { id?: number; name?: string | null } | null;
  department?: { id?: number; name?: string | null } | number | null;
};
