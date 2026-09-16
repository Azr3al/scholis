/**
 * Minimal Quiz type for SDK list hooks.
 */

export type Quiz = {
  id: number;
  title?: string | null;
  status?: string | null;
  created_at?: string;
  category?: { id?: number; title?: string; name?: string } | null;
  created_by?: { id: number; name?: string; email?: string } | null;
};
