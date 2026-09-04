import { auth } from '@/lib/auth';
import { resolveActor } from '@/server/auth/resolve-actor';
import {
  resolveClientActor,
  resolvePlatformClient,
  type PlatformClient,
} from '@/server/auth/resolve-client-actor';
import type { Actor } from '@/server/context.types';
import { publicContextFor } from './context';

/**
 * Resolve the signed-in teacher, or `null`.
 *
 * Two steps, deliberately separate. Better Auth answers "who is this?" from the
 * session cookie; `resolveActor` answers "what may they do?" from the database.
 *
 * The database read goes through a service rather than happening here. An
 * earlier version queried `users` directly and `no-db-in-routes` rejected it —
 * correctly, because a route reaching into persistence is exactly how business
 * logic starts leaking into the HTTP layer.
 */
export const actorFromRequest = async (request: Request): Promise<Actor | null> => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session !== null) return resolveActor(publicContextFor(), session.user.id);

  // No session, so try a machine credential. Deliberately second: a browser
  // request must never resolve as a machine.
  const bearer = bearerFrom(request);
  if (bearer === null) return null;

  return resolveClientActor(publicContextFor(), bearer);
};

/**
 * The platform tier, which is not an actor.
 *
 * A separate function because a platform credential belongs to no organisation
 * — there is nothing to scope its reads to. Provisioning routes ask for this
 * explicitly, and everything else asks for an actor, so a platform key cannot
 * reach a school's data by taking a wrong turn.
 */
export const platformFromRequest = async (request: Request): Promise<PlatformClient | null> => {
  const bearer = bearerFrom(request);
  if (bearer === null) return null;

  return resolvePlatformClient(publicContextFor(), bearer);
};

const bearerFrom = (request: Request): string | null => {
  const header = request.headers.get('authorization');
  if (header === null) return null;

  const [scheme, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return null;

  const token = rest.join(' ').trim();
  return token === '' ? null : token;
};
