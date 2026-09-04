import type { Actor, AuthedContext, PublicContext } from '@/server/context.types';
import type { Database } from '@scholis/db';
import { randomUUID } from 'node:crypto';

/**
 * Context builders for integration tests.
 *
 * `now` is fixed per context rather than read from the clock, so a test can
 * assert on exact timestamps and deadlines without tolerances.
 */
export const authedContext = (
  db: Database,
  actor: Actor,
  now = new Date('2026-08-07T10:00:00.000Z'),
): AuthedContext => ({
  db,
  actor,
  now: () => now,
  newId: () => randomUUID(),
});

export const publicContext = (
  db: Database,
  now = new Date('2026-08-07T10:00:00.000Z'),
): PublicContext => ({
  db,
  now: () => now,
  newId: () => randomUUID(),
});

/** A deterministic id source, for asserting on generated values. */
export const sequentialIds = (): (() => string) => {
  let n = 0;
  return () => {
    n += 1;
    return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
  };
};
