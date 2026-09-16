/**
 * Minimal DataVerificationRequest type for SDK list hooks.
 */

export type DataVerificationRequest = {
  id: number;
  name: string;
  fields?: Array<string | { name: string; required: boolean }> | null;
  requested_user_types?: string[] | null;
  expires_on?: string | null;
  created_by?: { id: number; name?: string } | null;
  created_at?: string;
  updated_at?: string;
};
