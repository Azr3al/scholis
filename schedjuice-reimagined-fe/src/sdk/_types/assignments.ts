/**
 * Minimal Assignment type for SDK list hooks.
 */

export type Assignment = {
  id: number;
  title?: string | null;
  available_date?: string | null;
  due_date?: string | null;
  created_at?: string;
  updated_at?: string;
  submissions?: unknown[] | null;
};
