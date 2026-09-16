/**
 * Minimal News type for SDK list hooks.
 */

export type News = {
  id: number;
  title: string;
  created_by?: { id: number; name?: string } | null;
  created_at?: string;
};
