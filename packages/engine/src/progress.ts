import { isAnswered, type AttemptState, type TestPackage } from '@scholis/schema';

export interface Progress {
  answered: number;
  total: number;
  /** Question ids with no answer, in test order. Drives the submit warning. */
  unanswered: string[];
  markedForReview: number;

  /**
   * Answered questions the taker is no longer sitting on — what the take screen
   * shows.
   *
   * `answered` moves on the first keystroke, which made the counter twitch
   * while a student was still mid-sentence. This holds still until they move
   * on, so it reads as "questions I have finished" rather than "questions I
   * have touched".
   *
   * The last question is the exception: there is nowhere to navigate to, so
   * excluding it would tell a student who has answered everything that they
   * are one short.
   *
   * Consequence worth knowing: going *back* to an answered question drops this
   * by one until they leave again, because it is once more the question in
   * hand. `answered` is unaffected and stays the honest total.
   */
  settled: number;
}

/**
 * How far through the test the taker is.
 *
 * Counts what is genuinely answered rather than what has a row: an empty
 * selection or a whitespace-only response is unanswered (see `isAnswered`).
 * Reporting 20/20 to a student who typed nothing is the kind of bug that only
 * surfaces after the test closes.
 */
export const progress = (pkg: TestPackage, state: AttemptState): Progress => {
  const unanswered = pkg.questions
    .filter((question) => {
      const value = state.responses[question.id];
      return value === undefined || !isAnswered(value);
    })
    .map((question) => question.id);

  const last = pkg.questions.length - 1;
  const settled = pkg.questions.filter((question, index) => {
    const value = state.responses[question.id];
    if (value === undefined || !isAnswered(value)) return false;
    return index !== state.cursor || index === last;
  }).length;

  return {
    answered: pkg.questions.length - unanswered.length,
    total: pkg.questions.length,
    unanswered,
    markedForReview: state.markedForReview.length,
    settled,
  };
};
