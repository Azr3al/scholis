/**
 * Whether the /api/dev/* routes are mounted.
 *
 * Its own module, with no imports, so this can be tested without dragging in
 * `lib/auth` — which builds a database client the moment it's imported.
 *
 * Two independent conditions:
 *
 *   NODE_ENV !== 'production'   and   SCHOLIS_DEV_ROUTES === 'enabled'
 *
 * The opt-in matters more than the NODE_ENV check. An unset or misconfigured
 * NODE_ENV is a normal kind of mistake — a platform that forgets it, a process
 * started by hand, a container with a stale env — and on its own that would be
 * one missing variable between the internet and free organisation creation.
 * Requiring a variable that must be deliberately set to one exact value flips
 * the failure mode: forget it and the routes stay off.
 */
export const devRoutesEnabled = (): boolean =>
  process.env.NODE_ENV !== 'production' && process.env.SCHOLIS_DEV_ROUTES === 'enabled';
