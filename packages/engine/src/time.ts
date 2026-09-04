import type { AttemptState } from '@scholis/schema';

<<<<<<< HEAD
/**
 * Milliseconds between two instants, floored at zero.
 *
 * The caller supplies `now`; the engine never reads a clock itself. That is
 * what keeps this testable without faking timers, and what lets the server
 * replay an attempt to adjudicate a dispute.
 */
export const timeRemainingMs = (deadlineAt: Date, now: Date): number =>
  Math.max(0, deadlineAt.getTime() - now.getTime());

/**
 * Milliseconds left in an attempt, or `null` if the test is untimed.
 *
 * `deadlineAt` is always the server-issued `server_deadline_at` (DESIGN.md §6,
 * rule 5). A student who winds their device clock back gets a longer local
 * countdown, but the server recomputes elapsed time at submit and records
 * `overdue_seconds` regardless — so tampering changes the display, not the mark.
 */
=======
// Caller supplies `now`; the engine never reads a clock. Keeps this testable
// without fake timers and lets the server replay an attempt to settle a
// dispute.
export const timeRemainingMs = (deadlineAt: Date, now: Date): number =>
  Math.max(0, deadlineAt.getTime() - now.getTime());

// A student who winds their clock back gets a longer countdown, but the server
// recomputes elapsed time at submit — tampering changes the display, not the
// mark.
>>>>>>> master
export const timeRemaining = (state: AttemptState, now: Date): number | null =>
  state.deadlineAt === null ? null : timeRemainingMs(new Date(state.deadlineAt), now);

/** Untimed attempts are never past their deadline. */
export const isPastDeadline = (state: AttemptState, now: Date): boolean =>
  timeRemaining(state, now) === 0;
