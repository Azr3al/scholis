/**
 * Minimal UserEmail type for SDK list hooks.
 */

export type UserEmail = {
  id: number;
  is_sent?: boolean | null;
  created_at?: string | null;
  user?: { id?: number; name?: string | null; email?: string | null } | null;
  email_template?: number | { id: number } | null;
};
