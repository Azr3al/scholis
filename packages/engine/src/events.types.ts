import type { AttemptState, Mutation, ResponseValue } from '@scholis/schema';

/** Everything a taker can do to an attempt. */
export type EngineEvent =
  | { t: 'answer'; questionId: string; value: ResponseValue }
  | { t: 'mark'; questionId: string; on: boolean }
  | { t: 'navigate'; to: number }
  | { t: 'submit' };

<<<<<<< HEAD
/**
 * Why an event did not apply.
 *
 * These are not errors — they are ordinary outcomes the UI renders as a
 * disabled button or a toast. Throwing from a reducer would force every caller
 * into a try/catch around a user pressing a key.
 */
=======
// Not errors — the UI renders these as a disabled button or a toast. Throwing
// from a reducer would mean a try/catch around a user pressing a key.
>>>>>>> master
export type RejectionReason =
  | 'already_submitted'
  | 'deadline_passed'
  | 'navigation_disabled'
  | 'cursor_out_of_range'
  | 'unknown_question'
  | 'response_kind_mismatch';

<<<<<<< HEAD
/**
 * The impure inputs, supplied by the caller.
 *
 * `now` and `mutationId` are the only two things the engine would otherwise
 * have to reach outside itself for — a clock and a random source. Passing them
 * in is what makes every function here a pure function of its arguments, and
 * what lets the server replay a disputed attempt and get identical results.
 */
=======
// The impure bits, passed in. A clock and a random source are the only things
// the engine would otherwise reach outside itself for.
>>>>>>> master
export interface EngineContext {
  now: Date;
  /** Used only by events that emit a mutation; ignored otherwise. */
  mutationId: string;
}

export interface ReduceResult {
  state: AttemptState;
  mutations: Mutation[];
  /** `null` when the event applied. */
  rejected: RejectionReason | null;
}
