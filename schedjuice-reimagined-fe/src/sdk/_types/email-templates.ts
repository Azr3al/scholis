/**
 * Minimal EmailTemplate type for SDK list hooks.
 */

export type EmailTemplate = {
  id: number;
  name?: string | null;
  subject?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: { id?: number; name?: string | null } | null;
};
