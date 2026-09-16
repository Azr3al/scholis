/**
 * Minimal QuizQuestion type for SDK list hooks.
 */

export type QuizQuestion = {
  id: number;
  question_type?: string;
  body_plaintext?: string | null;
  points?: number | null;
  created_at?: string;
  quiz?: { id: number; title?: string } | null;
};
