import {
  attemptStateSchema,
  mutationSchema,
  type AttemptState,
  type Mutation,
} from '@scholis/schema';
import { z } from 'zod';

// What we put in IndexedDB: the state the reducer produced, plus whatever
// hasn't reached the server yet.
//
// The state is stored whole and read back whole. Nothing here patches
// individual fields — reduce() is the only thing allowed to change attempt
// state, and a second writer would eventually disagree with it.
export const snapshotSchema = z.object({
  version: z.literal(1),
  attemptId: z.string().min(1),
  state: attemptStateSchema,
  outbox: z.array(mutationSchema),
  savedAt: z.iso.datetime(),
});

export type Snapshot = z.infer<typeof snapshotSchema>;

export const makeSnapshot = (
  attemptId: string,
  state: AttemptState,
  outbox: Mutation[],
  now: Date,
): Snapshot => ({
  version: 1,
  attemptId,
  state,
  outbox,
  savedAt: now.toISOString(),
});

/**
 * Parse a stored snapshot, or `null` if it's unusable.
 *
 * Anything that fails validation is discarded rather than repaired. A snapshot
 * from an older shape, a half-written record, or one belonging to a different
 * attempt would replay mutations against the wrong paper — starting clean is
 * the safer failure.
 */
export const readSnapshot = (raw: unknown, expectedAttemptId: string): Snapshot | null => {
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (parsed.data.attemptId !== expectedAttemptId) return null;
  if (parsed.data.state.attemptId !== expectedAttemptId) return null;
  return parsed.data;
};

/**
 * Drop mutations the server has confirmed.
 *
 * Kept separate from the flush so it can be tested without a network: the
 * server replies with the ids it durably accepted, and anything queued while
 * the request was in flight has to survive.
 */
export const pruneOutbox = (outbox: Mutation[], applied: string[]): Mutation[] => {
  const done = new Set(applied);
  return outbox.filter((m) => !done.has(m.id));
};

/**
 * Whether a failed sync is worth trying again.
 *
 * Retrying forever is right for a dropped connection and wrong for a refused
 * one. An expired attempt token or an already-submitted paper comes back 4xx
 * and will come back 4xx every time — showing "Offline, will retry" there tells
 * a student their wifi is bad while they keep answering into a void.
 *
 * Structural rather than an `instanceof ApiError` check, so this stays pure and
 * testable without dragging the API client in.
 */
export const isRetryable = (error: unknown): boolean => {
  const status = (error as { status?: unknown } | null)?.status;
  // No status at all means the request never landed — a genuine network fault.
  if (typeof status !== 'number') return true;
  // 408 and 429 are the server asking us to come back, not refusing outright.
  if (status === 408 || status === 429) return true;
  return status >= 500;
};

/** How long an untouched snapshot is kept before it's swept. */
export const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a stored snapshot is old enough to discard.
 *
 * Handing in clears the snapshot, but abandoning doesn't — close the tab and
 * sessionStorage loses the handle, leaving the answers in IndexedDB with
 * nothing able to reach them. On a shared school machine that's one student's
 * work sitting on disk for the next one, so anything untouched for a day goes.
 *
 * An unparseable savedAt counts as stale: it can't be from a session we could
 * still resume.
 */
export const isStale = (savedAt: string, now: Date, ttlMs = SNAPSHOT_TTL_MS): boolean => {
  const at = Date.parse(savedAt);
  if (Number.isNaN(at)) return true;
  return now.getTime() - at > ttlMs;
};

/** Exponential backoff with jitter, capped. */
export const retryDelayMs = (attempt: number, random = Math.random): number => {
  const base = Math.min(1000 * 2 ** Math.max(0, attempt), 30_000);
  // Jitter matters more than the curve here: a lab of thirty students comes
  // back online at the same moment, and without it they all retry in lockstep.
  return Math.round(base / 2 + random() * (base / 2));
};
