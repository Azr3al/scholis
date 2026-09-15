import type { AttemptState, Mutation, ResponseValue } from '@scholis/schema';

/** Everything a taker can do to an attempt. */
export type EngineEvent =
  | { t: 'answer'; questionId: string; value: ResponseValue }
  | { t: 'mark'; questionId: string; on: boolean }
  | { t: 'navigate'; to: number }
  | { t: 'submit' };

// Not errors — the UI renders these as a disabled button or a toast. Throwing
// from a reducer would mean a try/catch around a user pressing a key.
export type RejectionReason =
  | 'already_submitted'
  | 'deadline_passed'
  | 'navigation_disabled'
  | 'cursor_out_of_range'
  | 'unknown_question'
  | 'response_kind_mismatch';

// The impure bits, passed in. A clock and a random source are the only things
// the engine would otherwise reach outside itself for.
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
