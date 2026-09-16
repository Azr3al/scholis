/**
 * Minimal Visibility type for SDK list hooks.
 */

export type Visibility = {
  id: number;
  name: string;
  role?: string | null;
  created_by?: { id: number; name?: string } | null;
  created_at?: string;
  updated_at?: string;
};
