/**
 * Minimal Intake type for SDK list hooks.
 */

export type Intake = {
  id: number;
  name: string;
  program?: { id: number; name?: string } | number | null;
  start_date?: string | null;
  end_date?: string | null;
  courses_count?: number | null;
};
