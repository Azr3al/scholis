import { findUserById } from '@/data/users';
import type { Actor, PublicContext } from '@/server/context.types';

// Better Auth says who you are. This says what you may do — orgId and role come
// from the DB, never the session payload. A session is a claim about identity,
// not tenancy.
//
// null for an authenticated user with no membership row, which happens if a
// membership was revoked while a session was live.
export const resolveActor = async (ctx: PublicContext, userId: string): Promise<Actor | null> => {
  const user = await findUserById(ctx.db, userId);
  if (user === null) return null;

  // A person carries no scopes: their bound is `role`, and the session that
  // proved who they are. Scopes only mean something for a machine credential.
  return { userId: user.id, orgId: user.orgId, role: user.role, kind: 'user', scopes: [] };
};
