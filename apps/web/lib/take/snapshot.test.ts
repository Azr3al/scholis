import type { AttemptState, Mutation } from '@scholis/schema';
import { textToRichText } from '@scholis/schema';
import { describe, expect, it } from 'vitest';
import {
  isRetryable,
  isStale,
  makeSnapshot,
  pruneOutbox,
  readSnapshot,
  retryDelayMs,
} from './snapshot';

const ATTEMPT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-08T10:00:00.000Z');

const state = (overrides: Partial<AttemptState> = {}): AttemptState => ({
  attemptId: ATTEMPT,
  startedAt: '2026-08-08T09:00:00.000Z',
  deadlineAt: null,
  cursor: 0,
  responses: {},
  markedForReview: [],
  submittedAt: null,
  clientSeq: 0,
  ...overrides,
});

const mutation = (id: string, clientSeq: number): Mutation => ({
  kind: 'answer',
  id,
  attemptId: ATTEMPT,
  questionId: '33333333-3333-4333-8333-333333333333',
  value: { kind: 'short', doc: textToRichText('Paris') },
  clientSeq,
  at: NOW.toISOString(),
});

const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('snapshot round trip', () => {
  it('survives JSON, which is what IndexedDB stores', () => {
    const snapshot = makeSnapshot(
      ATTEMPT,
      state({ cursor: 2, responses: { q1: { kind: 'short', doc: textToRichText('Paris') } } }),
      [mutation(ID_A, 1)],
      NOW,
    );

    const back = readSnapshot(JSON.parse(JSON.stringify(snapshot)), ATTEMPT);

    expect(back).not.toBeNull();
    expect(back?.state.cursor).toBe(2);
    expect(back?.state.responses.q1).toEqual({ kind: 'short', doc: textToRichText('Paris') });
    expect(back?.outbox).toHaveLength(1);
  });

  it('keeps marked-for-review, which a Set would have lost', () => {
    const snapshot = makeSnapshot(ATTEMPT, state({ markedForReview: ['q1', 'q2'] }), [], NOW);
    const back = readSnapshot(JSON.parse(JSON.stringify(snapshot)), ATTEMPT);
    expect(back?.state.markedForReview).toEqual(['q1', 'q2']);
  });
});

/**
 * Anything unusable is discarded rather than repaired. Replaying a mutation
 * against the wrong paper is far worse than starting clean.
 */
describe('readSnapshot rejects what it should', () => {
  it('rejects a snapshot belonging to another attempt', () => {
    const snapshot = makeSnapshot(OTHER, state({ attemptId: OTHER }), [], NOW);
    expect(readSnapshot(snapshot, ATTEMPT)).toBeNull();
  });

  it('rejects when the envelope and the state disagree', () => {
    // Envelope says this attempt, inner state says another. Trusting the
    // envelope would replay someone else's answers.
    const snapshot = { ...makeSnapshot(ATTEMPT, state({ attemptId: OTHER }), [], NOW) };
    expect(readSnapshot(snapshot, ATTEMPT)).toBeNull();
  });

  it('rejects an unknown version', () => {
    const snapshot = { ...makeSnapshot(ATTEMPT, state(), [], NOW), version: 2 };
    expect(readSnapshot(snapshot, ATTEMPT)).toBeNull();
  });

  it('rejects a half-written record', () => {
    expect(readSnapshot({ version: 1, attemptId: ATTEMPT }, ATTEMPT)).toBeNull();
  });

  it('rejects a malformed mutation in the outbox', () => {
    const snapshot = { ...makeSnapshot(ATTEMPT, state(), [], NOW), outbox: [{ kind: 'answer' }] };
    expect(readSnapshot(snapshot, ATTEMPT)).toBeNull();
  });

  it('rejects nothing at all', () => {
    expect(readSnapshot(null, ATTEMPT)).toBeNull();
    expect(readSnapshot(undefined, ATTEMPT)).toBeNull();
  });
});

describe('pruneOutbox', () => {
  it('drops what the server confirmed', () => {
    const left = pruneOutbox([mutation(ID_A, 1), mutation(ID_B, 2)], [ID_A]);
    expect(left.map((m) => m.id)).toEqual([ID_B]);
  });

  it('keeps everything when the server confirmed nothing', () => {
    expect(pruneOutbox([mutation(ID_A, 1)], [])).toHaveLength(1);
  });

  it('ignores ids that were never queued', () => {
    // A retry can confirm mutations already pruned. That must not disturb
    // anything queued since.
    expect(pruneOutbox([mutation(ID_B, 2)], [ID_A])).toHaveLength(1);
  });
});

/**
 * The distinction that matters: a dropped connection comes back, a refused
 * request doesn't. Conflating them told a student with an expired session that
 * their wifi was bad while they kept answering into a void.
 */
describe('isRetryable', () => {
  it('retries a request that never landed', () => {
    // fetch rejects with a plain TypeError — no status anywhere.
    expect(isRetryable(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('gives up on an expired attempt token', () => {
    expect(isRetryable({ status: 403, code: 'forbidden' })).toBe(false);
  });

  it('gives up on an attempt the server already considers submitted', () => {
    expect(isRetryable({ status: 422, code: 'invalid_state' })).toBe(false);
  });

  it('retries server faults, which are not the student’s problem', () => {
    expect(isRetryable({ status: 500 })).toBe(true);
    expect(isRetryable({ status: 503 })).toBe(true);
  });

  it('retries when the server asks us to come back', () => {
    expect(isRetryable({ status: 408 })).toBe(true);
    expect(isRetryable({ status: 429 })).toBe(true);
  });

  it('retries anything it cannot classify', () => {
    // A pointless retry beats dropping answers on the floor.
    expect(isRetryable(null)).toBe(true);
    expect(isRetryable(undefined)).toBe(true);
    expect(isRetryable({ status: 'nope' })).toBe(true);
  });
});

describe('isStale', () => {
  const savedAt = '2026-08-08T10:00:00.000Z';

  it('keeps a snapshot from a session still under way', () => {
    expect(isStale(savedAt, new Date('2026-08-08T12:00:00.000Z'))).toBe(false);
  });

  it('drops one abandoned on a shared machine a day ago', () => {
    expect(isStale(savedAt, new Date('2026-08-09T11:00:00.000Z'))).toBe(true);
  });

  it('drops a snapshot with an unreadable timestamp', () => {
    // Can't show it's recent, and it couldn't be resumed anyway.
    expect(isStale('not a date', new Date('2026-08-08T10:00:01.000Z'))).toBe(true);
    expect(isStale('undefined', new Date('2026-08-08T10:00:01.000Z'))).toBe(true);
  });

  it('keeps one saved a moment ahead, which clock skew does', () => {
    expect(isStale('2026-08-08T10:00:05.000Z', new Date(savedAt))).toBe(false);
  });
});

describe('retryDelayMs', () => {
  it('grows with each failure', () => {
    const mid = () => 0.5;
    expect(retryDelayMs(1, mid)).toBeLessThan(retryDelayMs(3, mid));
  });

  it('caps so a long outage does not back off forever', () => {
    expect(retryDelayMs(50, () => 1)).toBeLessThanOrEqual(30_000);
  });

  it('jitters, so a lab reconnecting together does not retry in lockstep', () => {
    expect(retryDelayMs(3, () => 0)).not.toBe(retryDelayMs(3, () => 1));
  });

  it('never returns a negative delay', () => {
    expect(retryDelayMs(0, () => 0)).toBeGreaterThan(0);
    expect(retryDelayMs(-5, () => 0)).toBeGreaterThan(0);
  });
});
