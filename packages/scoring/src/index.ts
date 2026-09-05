/**
 * THIS PACKAGE IS SERVER ONLY.
 *
 * It is the only code in Scholis that touches answer keys. `.dependency-cruiser.cjs`
 * fails the build if any client module reaches it, directly or transitively —
 * enforced by the dependency-cruiser rules.
 */
export { clamp, round4 } from './round';
export { score } from './score';
export { scoreChoice } from './score-choice';
export { normalizeShortAnswer, scoreShort } from './score-short';
export type { QuestionScore, ScoreInput, ScoreReport, ScoreStatus } from './score.types';
