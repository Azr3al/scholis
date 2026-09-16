/**
 * Minimal Course type for SDK list hooks.
 */

export type Course = {
  id: number;
  title?: string | null;
  code?: string | null;
  status?: string | null;
  start_date?: string | Date | null;
  end_date?: string | Date | null;
  description?: string | null;
  batch_number?: string | number | null;
  category?: { id?: number; name?: string } | null;
  program?: { id?: number; name?: string } | number | null;
  intake?: {
    id?: number;
    name?: string;
    start_date?: string | Date | null;
    end_date?: string | Date | null;
  } | number | null;
  subject?: { id?: number; name?: string } | null;
  primary_teacher?: { id?: number; name?: string } | null;
};
