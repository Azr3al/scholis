import type { AttemptState } from '@scholis/schema';

// Caller supplies `now`; the engine never reads a clock. Keeps this testable
// without fake timers and lets the server replay an attempt to settle a
// dispute.
export const timeRemainingMs = (deadlineAt: Date, now: Date): number =>
  Math.max(0, deadlineAt.getTime() - now.getTime());

// A student who winds their clock back gets a longer countdown, but the server
// recomputes elapsed time at submit — tampering changes the display, not the
// mark.
export const timeRemaining = (state: AttemptState, now: Date): number | null =>
  state.deadlineAt === null ? null : timeRemainingMs(new Date(state.deadlineAt), now);

/** Untimed attempts are never past their deadline. */
export const isPastDeadline = (state: AttemptState, now: Date): boolean =>
  timeRemaining(state, now) === 0;
