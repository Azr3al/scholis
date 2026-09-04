import {
  responseKindForQuestionType,
  type AttemptState,
  type PublicQuestion,
  type TestPackage,
} from '@scholis/schema';
import type { EngineContext, EngineEvent, ReduceResult } from './events.types';
import { isPastDeadline } from './time';

const reject = (state: AttemptState, reason: ReduceResult['rejected']): ReduceResult => ({
  state,
  mutations: [],
  rejected: reason,
});

const findQuestion = (pkg: TestPackage, questionId: string): PublicQuestion | undefined =>
  pkg.questions.find((question) => question.id === questionId);

<<<<<<< HEAD
/**
 * Apply one taker action to an attempt.
 *
 * Total: every input produces a result, and a rejected event returns the state
 * untouched with a reason. Never mutates its arguments — the take UI holds the
 * previous state until IndexedDB confirms the write, so aliasing would corrupt
 * the rollback.
 */
=======
// Total: every input returns a result, and a rejected event returns the state
// untouched with a reason.
//
// Never mutates its arguments — the take UI holds the previous state until
// IndexedDB confirms the write, so aliasing would break the rollback.
>>>>>>> master
export const reduce = (
  pkg: TestPackage,
  state: AttemptState,
  event: EngineEvent,
  ctx: EngineContext,
): ReduceResult => {
  // A submitted attempt is closed to everything. Checked before the deadline so
  // that a taker who submitted on time and reloads late sees "already
  // submitted" rather than "time is up".
  if (state.submittedAt !== null) {
    return reject(state, 'already_submitted');
  }

  switch (event.t) {
    case 'answer': {
      if (isPastDeadline(state, ctx.now)) return reject(state, 'deadline_passed');

      const question = findQuestion(pkg, event.questionId);
      if (question === undefined) return reject(state, 'unknown_question');

      if (event.value.kind !== responseKindForQuestionType[question.type]) {
        return reject(state, 'response_kind_mismatch');
      }

      const clientSeq = state.clientSeq + 1;
      return {
        state: {
          ...state,
          clientSeq,
          responses: { ...state.responses, [event.questionId]: event.value },
        },
        mutations: [
          {
            kind: 'answer',
            id: ctx.mutationId,
            attemptId: state.attemptId,
            questionId: event.questionId,
            value: event.value,
            clientSeq,
            at: ctx.now.toISOString(),
          },
        ],
        rejected: null,
      };
    }

    case 'mark': {
      // Marking is navigation-adjacent bookkeeping, not an answer, so it stays
      // available after the deadline: a taker reviewing a timed-out attempt can
      // still tidy their flags without being able to change a response.
      const question = findQuestion(pkg, event.questionId);
      if (question === undefined) return reject(state, 'unknown_question');

      const already = state.markedForReview.includes(event.questionId);
      if (already === event.on) {
        return { state, mutations: [], rejected: null };
      }

      const clientSeq = state.clientSeq + 1;
      const markedForReview = event.on
        ? [...state.markedForReview, event.questionId]
        : state.markedForReview.filter((id) => id !== event.questionId);

      return {
        state: { ...state, clientSeq, markedForReview },
        mutations: [
          {
            kind: 'mark',
            id: ctx.mutationId,
            attemptId: state.attemptId,
            questionId: event.questionId,
            marked: event.on,
            clientSeq,
            at: ctx.now.toISOString(),
          },
        ],
        rejected: null,
      };
    }

    case 'navigate': {
      if (event.to < 0 || event.to >= pkg.questions.length) {
        return reject(state, 'cursor_out_of_range');
      }
      if (!pkg.allowNavigation && event.to !== state.cursor + 1) {
        return reject(state, 'navigation_disabled');
      }
      // Navigation is local view state and emits no mutation: where a taker is
      // looking is not worth a network round trip, and replaying it would tell
      // the server nothing it can act on.
      return { state: { ...state, cursor: event.to }, mutations: [], rejected: null };
    }

    case 'submit': {
      // Submitting late is allowed and recorded rather than blocked. The server
      // recomputes elapsed time and stores `overdue_seconds`; refusing here
      // would strand a taker whose connection died at the deadline with an
      // attempt they can never close.
      return {
        state: { ...state, submittedAt: ctx.now.toISOString() },
<<<<<<< HEAD
        // Submit is its own idempotent endpoint (DESIGN.md §6, rule 4), called
=======
        // Submit is its own idempotent endpoint, called
>>>>>>> master
        // after the outbox drains — not an outbox item itself.
        mutations: [],
        rejected: null,
      };
    }
  }
};
