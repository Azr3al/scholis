/**
 * Minimal Job type for SDK list hooks.
 */

export type Job = {
  id: number;
  name?: string | null;
  department?: { id?: number; name?: string | null } | number | null;
};
