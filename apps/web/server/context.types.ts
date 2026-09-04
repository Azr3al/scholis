import type { Database } from '@scholis/db';

export interface Actor {
  userId: string;
  orgId: string;
  role: 'owner' | 'teacher';
}

/**
 * What every service receives.
 *
 * `now` and `newId` are functions rather than values so a service can stamp
 * several rows in one transaction without them drifting, and so tests can
 * supply deterministic ones. Same principle as `EngineContext`: impure inputs
 * are passed in, never reached for.
 *
 * `db` is a handle, not a module-level singleton. Nothing can reach the
 * database by importing it.
 */
export interface BaseContext {
  db: Database;
  now: () => Date;
  newId: () => string;
}

/**
 * A service acting on behalf of a signed-in teacher or owner.
 *
 * Separate from `PublicContext` on purpose. A teacher-only service takes
 * `AuthedContext`, so forgetting the authorisation check is a compile error
 * rather than something a reviewer has to notice. Organisations are
 * admin-provisioned (IMPLEMENTATION.md §9.2), so `actor.orgId` is assigned at
 * provisioning time and never inferred from anything the user controls.
 */
export interface AuthedContext extends BaseContext {
  actor: Actor;
}

/**
 * A service reachable by a test-taker, who has no account — they arrive with a
 * code and a name (DESIGN.md §2). There is no actor to check, so these services
 * must derive every authorisation decision from the test code itself.
 */
export type PublicContext = BaseContext;
