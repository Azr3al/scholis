import {
  apiClientSecrets,
  apiClients,
  type ApiClientRow,
  type ApiClientSecretRow,
  type Executor,
} from '@scholis/db';
import type { ApiClientKind, ApiScope } from '@scholis/schema';
import { and, eq, isNull } from 'drizzle-orm';

export type ApiClientRecord = ApiClientRow;
export type ApiClientSecretRecord = ApiClientSecretRow;

export const insertApiClient = async (
  db: Executor,
  values: {
    kind: ApiClientKind;
    orgId: string | null;
    name: string;
    keyId: string;
    scopes: ApiScope[];
    createdBy: string | null;
    expiresAt: Date | null;
  },
): Promise<ApiClientRecord> => {
  const [row] = await db.insert(apiClients).values(values).returning();
  if (row === undefined) throw new Error('Insert into api_clients returned no rows');
  return row;
};

export const insertApiClientSecret = async (
  db: Executor,
  values: { clientId: string; secretHash: string },
): Promise<ApiClientSecretRecord> => {
  const [row] = await db.insert(apiClientSecrets).values(values).returning();
  if (row === undefined) throw new Error('Insert into api_client_secrets returned no rows');
  return row;
};

/**
 * The authentication read: one indexed lookup by the public half.
 *
 * Returns the client with every secret that is still live, because a client
 * mid-rotation legitimately has two. Deciding which one matches is the
 * service's job — this returns rows, not verdicts.
 */
export const findApiClientByKeyId = async (
  db: Executor,
  keyId: string,
): Promise<{ client: ApiClientRecord; secrets: ApiClientSecretRecord[] } | null> => {
  const [client] = await db.select().from(apiClients).where(eq(apiClients.keyId, keyId)).limit(1);
  if (client === undefined) return null;

  const secrets = await db
    .select()
    .from(apiClientSecrets)
    .where(and(eq(apiClientSecrets.clientId, client.id), isNull(apiClientSecrets.revokedAt)));

  return { client, secrets };
};

export const findApiClientById = async (
  db: Executor,
  id: string,
): Promise<ApiClientRecord | null> => {
  const [row] = await db.select().from(apiClients).where(eq(apiClients.id, id)).limit(1);
  return row ?? null;
};

export const listApiClientsForOrg = async (
  db: Executor,
  orgId: string,
): Promise<ApiClientRecord[]> =>
  db.select().from(apiClients).where(eq(apiClients.orgId, orgId));

/**
 * Best-effort, and deliberately not awaited by the auth path.
 *
 * Its only job is telling a human which keys nobody uses any more. A write on
 * every request that blocked the request would be a poor trade for that.
 */
export const touchApiClient = async (db: Executor, id: string, now: Date): Promise<void> => {
  await db.update(apiClients).set({ lastUsedAt: now }).where(eq(apiClients.id, id));
};

export const revokeApiClient = async (db: Executor, id: string, now: Date): Promise<void> => {
  await db.update(apiClients).set({ revokedAt: now }).where(eq(apiClients.id, id));
};

export const revokeApiClientSecret = async (
  db: Executor,
  id: string,
  now: Date,
): Promise<void> => {
  await db.update(apiClientSecrets).set({ revokedAt: now }).where(eq(apiClientSecrets.id, id));
};

export const listApiClientSecrets = async (
  db: Executor,
  clientId: string,
): Promise<ApiClientSecretRecord[]> =>
  db.select().from(apiClientSecrets).where(eq(apiClientSecrets.clientId, clientId));
