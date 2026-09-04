import { findApiClientByKeyId, touchApiClient } from '@/data/api-clients';
import { parseCredential, secretMatches } from '@/server/api-credential';
import type { Actor, PublicContext } from '@/server/context.types';

/**
 * Turn a presented bearer token into an actor, or null.
 *
 * The whole point of returning the same `Actor` a session produces: every
 * service already scopes to `ctx.actor.orgId`, so a machine credential is
 * correctly confined to one school without a single service changing. What
 * differs is `kind` and `scopes`, which the few operations that care check for
 * themselves.
 *
 * Null for every failure, never a reason. A caller learning the difference
 * between "no such key" and "wrong secret" learns which key ids are real.
 */
export const resolveClientActor = async (
  ctx: PublicContext,
  token: string,
): Promise<Actor | null> => {
  const parsed = parseCredential(token);
  // Not ours. Every request carrying somebody else's bearer token lands here,
  // so it is rejected before touching the database.
  if (parsed === null) return null;

  const found = await findApiClientByKeyId(ctx.db, parsed.keyId);
  if (found === null) return null;

  const { client, secrets } = found;
  const now = ctx.now();

  if (client.revokedAt !== null) return null;
  if (client.expiresAt !== null && client.expiresAt.getTime() <= now.getTime()) return null;

  // Every live secret is tried, because a client mid-rotation legitimately has
  // two. `some` short-circuits, but each comparison is itself constant-time —
  // what leaks is how many secrets a client has, which is not worth hiding.
  if (!secrets.some((secret) => secretMatches(parsed.secret, secret.secretHash))) return null;

  // A platform credential belongs to no organisation, so it cannot be an actor
  // in the ordinary sense — there is no org to scope its reads to. Provisioning
  // routes authorise it separately; anything expecting a normal actor refuses.
  if (client.orgId === null) return null;

  // Not awaited. Its only job is telling a human which keys are unused, and a
  // write on the hot path of every authenticated request is a poor trade.
  void touchApiClient(ctx.db, client.id, now);

  return {
    // The credential stands in for a user id so audit trails have something
    // stable to name. `kind` is what stops it being mistaken for a person.
    userId: client.id,
    orgId: client.orgId,
    // Machines get the lower of the two roles. Owner-only actions — inviting
    // colleagues, minting keys — are exactly the ones a key must not perform.
    role: 'teacher',
    kind: 'client',
    scopes: client.scopes,
  };
};

/**
 * The platform tier, resolved separately and on purpose.
 *
 * A platform credential provisions organisations and mints their keys; it
 * holds no scope that reads a paper or a mark. Keeping it out of `Actor`
 * entirely means it cannot be handed to a service that expects a school —
 * there is no org id to hand over, so the mistake does not typecheck.
 */
export interface PlatformClient {
  clientId: string;
  scopes: readonly string[];
}

export const resolvePlatformClient = async (
  ctx: PublicContext,
  token: string,
): Promise<PlatformClient | null> => {
  const parsed = parseCredential(token);
  if (parsed === null) return null;

  const found = await findApiClientByKeyId(ctx.db, parsed.keyId);
  if (found === null) return null;

  const { client, secrets } = found;
  const now = ctx.now();

  if (client.kind !== 'platform') return null;
  if (client.revokedAt !== null) return null;
  if (client.expiresAt !== null && client.expiresAt.getTime() <= now.getTime()) return null;
  if (!secrets.some((secret) => secretMatches(parsed.secret, secret.secretHash))) return null;

  void touchApiClient(ctx.db, client.id, now);

  return { clientId: client.id, scopes: client.scopes };
};
