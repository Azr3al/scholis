import type { Storage } from '@/lib/storage/storage.types';
import type { Database } from '@scholis/db';
import type { ApiScope } from '@scholis/schema';

export interface Actor {
  userId: string;
  orgId: string;
  role: 'owner' | 'teacher';
  /**
   * How this actor proved itself.
   *
   * Nearly every service ignores it, and should — a machine authoring a paper
   * is authoring a paper. It exists for the few operations that must never be
   * automated, chiefly minting credentials: if a key can mint a key, revoking
   * a leaked one no longer contains the breach.
   */
  kind: 'user' | 'client';
  /**
   * What a machine credential was granted. Empty for a signed-in person, who
   * is bounded by `role` and by the session instead.
   */
  scopes: ApiScope[];
}

// What every service gets handed.
//
// now/newId are functions so a service can stamp several rows in one
// transaction without them drifting, and tests can make them deterministic.
export interface BaseContext {
  db: Database;
  now: () => Date;
  newId: () => string;
  /**
   * Signs attempt tokens (`server/attempt-token.ts`).
   *
   * Passed in rather than read from `process.env` at the point of use, for the
   * same reason `now` is: a service that reaches for ambient state cannot be
   * tested without arranging that state, and a secret read in three places is a
   * secret rotated in two.
   */
  attemptTokenSecret: string;
  /**
   * Where uploaded files go, injected for the same reason `db` is: a service
   * that reaches for the composition root cannot be tested without a disk.
   * Services see the interface and never the provider behind it.
   */
  storage: Storage;
}

// Separate type from PublicContext so forgetting an auth check on a teacher
// service is a compile error, not something review has to catch.
export interface AuthedContext extends BaseContext {
  actor: Actor;
}

// Students have no account — they arrive with a code and a name. These
// services derive everything from the test code and attempt token.
export type PublicContext = BaseContext;

/**
 * The integrating system itself, acting above any one school.
 *
 * A separate type from AuthedContext rather than an Actor with a null orgId,
 * for the same reason AuthedContext is separate from PublicContext: there is
 * no organisation to scope to, so handing this to a service that expects a
 * school should not compile. It carries a client id for audit and nothing
 * else — provisioning is all it can do.
 */
export interface PlatformContext extends BaseContext {
  platform: { clientId: string };
}
