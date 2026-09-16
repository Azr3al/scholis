/**
 * Minimal QuizAttempt type for SDK list hooks.
 */

export type QuizAttempt = {
  id: number;
  score?: string | number | null;
  max_score?: number | null;
  submitted_at?: string | null;
  overdue_seconds?: number | null;
  is_released?: boolean | null;
  user?: { id?: number; name?: string } | null;
  answers?: { score?: string | number | null }[] | null;
  [key: string]: unknown;
};
