import type { KeyedQuestion, ResponseValue } from '@scholis/schema';

/**
 * How a question's marks were arrived at.
 *
 * `pending_manual` is distinct from a score of zero on purpose: a teacher's
 * results view has to be able to say "not marked yet" rather than showing an
 * essay as a zero the student might see. Release gating depends on it.
 */
export type ScoreStatus = 'auto' | 'manual' | 'pending_manual';

export interface QuestionScore {
  questionId: string;
  awarded: number;
  maxPoints: number;
  status: ScoreStatus;
}

export interface ScoreReport {
  questionScores: QuestionScore[];
  /** Sum of `awarded`. Ungraded essays contribute nothing. */
  score: number;
  maxScore: number;
  /** True while any question is still `pending_manual`. */
  requiresManualMarking: boolean;
}

export interface ScoreInput {
  questions: KeyedQuestion[];
  /** Keyed by question id. Absent means unanswered. */
  responses: Record<string, ResponseValue>;
  /** Human-assigned marks for essays, keyed by question id. */
  manualMarks: Record<string, number>;
}
