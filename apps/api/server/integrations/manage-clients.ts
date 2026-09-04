import {
  findApiClientById,
  insertApiClient,
  insertApiClientSecret,
  listApiClientSecrets,
  listApiClientsForOrg,
  revokeApiClient,
  revokeApiClientSecret,
} from '@/data/api-clients';
import { mintCredential, mintSecretFor } from '@/server/api-credential';
import type { AuthedContext } from '@/server/context.types';
import { forbidden, notFound, validationFailed } from '@/server/errors';
import { ORG_SCOPES, apiScopeSchema, type ApiScope } from '@scholis/schema';
import { z } from 'zod';

/**
 * Issuing, rotating and revoking a school's own API keys.
 *
 * Every function here refuses a machine caller. That is the single rule that
 * makes revocation meaningful: if a leaked key could mint another key, then
 * revoking the leaked one achieves nothing, because the attacker already holds
 * a second credential you have never seen.
 */

const humanOwnerOnly = (ctx: AuthedContext): void => {
  // Order matters for the message. A teacher who is told "only the owner" can
  // act on that; a teacher told "not from an API key" would be confused.
  if (ctx.actor.kind !== 'user') {
    throw forbidden('API keys can only be created by a person signed in to the dashboard.');
  }
  if (ctx.actor.role !== 'owner') {
    throw forbidden('Only the team owner can manage API keys.');
  }
};

export interface IssuedClient {
  id: string;
  name: string;
  keyId: string;
  scopes: ApiScope[];
  /** Shown once. Never stored, never retrievable, never logged. */
  token: string;
}

export interface ClientSummary {
  id: string;
  name: string;
  keyId: string;
  scopes: ApiScope[];
  liveSecrets: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

// --- issue -----------------------------------------------------------------

export const issueClientInput = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(apiScopeSchema).min(1),
  /** Days until it stops working. Absent means it does not expire. */
  expiresInDays: z.number().int().positive().max(3650).optional(),
});

export const issueClient = async (
  ctx: AuthedContext,
  input: z.infer<typeof issueClientInput>,
): Promise<IssuedClient> => {
  humanOwnerOnly(ctx);

  // `orgs:write` is the platform tier's scope. A school's own key holding it
  // would let one school provision others, which is the whole reason the tiers
  // are separate.
  const disallowed = input.scopes.filter((scope) => !ORG_SCOPES.includes(scope));
  if (disallowed.length > 0) {
    throw validationFailed(`A team key cannot hold: ${disallowed.join(', ')}.`);
  }

  const credential = mintCredential();
  const now = ctx.now();

  return ctx.db.transaction(async (tx) => {
    const client = await insertApiClient(tx, {
      kind: 'org',
      orgId: ctx.actor.orgId,
      name: input.name,
      keyId: credential.keyId,
      scopes: input.scopes,
      createdBy: ctx.actor.userId,
      expiresAt:
        input.expiresInDays === undefined
          ? null
          : new Date(now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000),
    });

    await insertApiClientSecret(tx, {
      clientId: client.id,
      secretHash: credential.secretHash,
    });

    return {
      id: client.id,
      name: client.name,
      keyId: client.keyId,
      scopes: client.scopes,
      token: credential.token,
    };
  });
};

// --- rotate ----------------------------------------------------------------

export const rotateClientSecretInput = z.object({ clientId: z.uuid() });

/**
 * Adds a second live secret rather than replacing the first.
 *
 * This is what makes rotation something other than an outage: issue the new
 * secret, deploy it wherever the key is used, then revoke the old one. A
 * replace-in-place would force a flag day, and a rotation that requires a flag
 * day is a rotation that never happens.
 */
export const rotateClientSecret = async (
  ctx: AuthedContext,
  input: z.infer<typeof rotateClientSecretInput>,
): Promise<{ keyId: string; token: string }> => {
  humanOwnerOnly(ctx);

  const client = await findApiClientById(ctx.db, input.clientId);
  if (client?.orgId !== ctx.actor.orgId) throw notFound('API key');
  if (client.revokedAt !== null) {
    throw validationFailed('That key has been revoked. Create a new one instead.');
  }

  // Minted against the existing key id: only the secret half rotates, so the
  // caller keeps quoting the same public identifier throughout.
  const credential = mintSecretFor(client.keyId);
  await insertApiClientSecret(ctx.db, {
    clientId: client.id,
    secretHash: credential.secretHash,
  });

  return { keyId: client.keyId, token: credential.token };
};

// --- revoke ----------------------------------------------------------------

export const revokeClientInput = z.object({ clientId: z.uuid() });

export const revokeClient = async (
  ctx: AuthedContext,
  input: z.infer<typeof revokeClientInput>,
): Promise<{ revoked: true }> => {
  humanOwnerOnly(ctx);

  const client = await findApiClientById(ctx.db, input.clientId);
  if (client?.orgId !== ctx.actor.orgId) throw notFound('API key');

  await revokeApiClient(ctx.db, client.id, ctx.now());
  return { revoked: true };
};

export const revokeSecretInput = z.object({ clientId: z.uuid(), secretId: z.uuid() });

/** Retires one half of a rotation, leaving the key itself working. */
export const revokeSecret = async (
  ctx: AuthedContext,
  input: z.infer<typeof revokeSecretInput>,
): Promise<{ revoked: true }> => {
  humanOwnerOnly(ctx);

  const client = await findApiClientById(ctx.db, input.clientId);
  if (client?.orgId !== ctx.actor.orgId) throw notFound('API key');

  const secrets = await listApiClientSecrets(ctx.db, client.id);
  const target = secrets.find((secret) => secret.id === input.secretId);
  if (target === undefined) throw notFound('Secret');

  // Refusing to revoke the last one is not politeness. Doing it would leave a
  // key that authenticates nothing while still looking live in the dashboard —
  // revoke the client instead, which says what actually happened.
  const live = secrets.filter((secret) => secret.revokedAt === null);
  if (live.length <= 1) {
    throw validationFailed('That is the only working secret. Revoke the whole key instead.');
  }

  await revokeApiClientSecret(ctx.db, target.id, ctx.now());
  return { revoked: true };
};

// --- list ------------------------------------------------------------------

export const listClients = async (ctx: AuthedContext): Promise<ClientSummary[]> => {
  humanOwnerOnly(ctx);

  const clients = await listApiClientsForOrg(ctx.db, ctx.actor.orgId);

  return Promise.all(
    clients.map(async (client) => {
      const secrets = await listApiClientSecrets(ctx.db, client.id);
      return {
        id: client.id,
        name: client.name,
        keyId: client.keyId,
        scopes: client.scopes,
        liveSecrets: secrets.filter((secret) => secret.revokedAt === null).length,
        lastUsedAt: client.lastUsedAt?.toISOString() ?? null,
        expiresAt: client.expiresAt?.toISOString() ?? null,
        revokedAt: client.revokedAt?.toISOString() ?? null,
        createdAt: client.createdAt.toISOString(),
      };
    }),
  );
};
