import { createMemoryStorage } from '@/lib/storage/memory-storage';
import type { Actor, AuthedContext, PublicContext } from '@/server/context.types';
import type { Database } from '@scholis/db';
import { randomUUID } from 'node:crypto';

/**
 * Context builders for integration tests.
 *
 * `now` is fixed per context rather than read from the clock, so a test can
 * assert on exact timestamps and deadlines without tolerances.
 */
export const TEST_ATTEMPT_SECRET = 'test-attempt-token-secret';

/**
 * `kind` and `scopes` default to a signed-in person.
 *
 * Almost no test cares how the actor proved itself, and making every existing
 * one spell out `kind: 'user'` would be noise obscuring the few tests where it
 * is the actual subject. Those pass it explicitly.
 */
export type TestActor = Omit<Actor, 'kind' | 'scopes'> & Partial<Pick<Actor, 'kind' | 'scopes'>>;

export const authedContext = (
  db: Database,
  actor: TestActor,
  now = new Date('2026-08-07T10:00:00.000Z'),
): AuthedContext => ({
  db,
  actor: { kind: 'user', scopes: [], ...actor },
  now: () => now,
  newId: () => randomUUID(),
  attemptTokenSecret: TEST_ATTEMPT_SECRET,
  storage: createMemoryStorage(),
});

export const publicContext = (
  db: Database,
  now = new Date('2026-08-07T10:00:00.000Z'),
): PublicContext => ({
  db,
  now: () => now,
  newId: () => randomUUID(),
  attemptTokenSecret: TEST_ATTEMPT_SECRET,
  storage: createMemoryStorage(),
});

/** A deterministic id source, for asserting on generated values. */
export const sequentialIds = (): (() => string) => {
  let n = 0;
  return () => {
    n += 1;
    return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
  };
};
