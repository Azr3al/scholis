import { insertApiClient } from '@/data/api-clients';
import type { AuthedContext } from '@/server/context.types';
import { mintTeacherSsoTicket } from '@/server/integrations/teacher-sso';
import { authedContext } from '@/test/support';
import { apiClients } from '@scholis/db';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { ORG_SCOPES } from '@scholis/schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Migration 0010, and the reason it had to exist.
 *
 * `provisionOrg` writes `ORG_SCOPES` as it stands at the moment it runs, and a
 * retry deliberately does not amend an existing key — it returns `key: null`
 * and touches nothing. So adding `sso:write` to `ORG_SCOPES` only reached
 * schools provisioned after the deploy. Every integrator already connected kept
 * a four-scope key, and there was no code path that would ever widen it: the
 * scopes column is written on insert and never again.
 *
 * The service-level tests all passed because every one of them seeds a key with
 * today's scope list. That is the gap these close: they seed the key an existing
 * school actually holds.
 */

const harness: TestDb = await createTestDb();

afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  await harness.reset();
});

/** Exactly what provisionOrg wrote before `sso:write` was added. */
const LEGACY_SCOPES = [
  'tests:read',
  'tests:write',
  'results:read',
  'launch:write',
] as AuthedContext['actor']['scopes'];

const seedLegacyKey = async () => {
  const org = await makeOrg(harness.db);
  const ada = await makeUser(harness.db, org.id, {
    email: 'ada@example.test',
    name: 'Ada Lovelace',
  });

  const client = await insertApiClient(harness.db, {
    kind: 'org',
    orgId: org.id,
    name: 'Schedjuice production',
    keyId: `key_legacy_${Math.random().toString(36).slice(2, 10)}`,
    scopes: LEGACY_SCOPES,
    createdBy: null,
    expiresAt: null,
  });

  return { org, ada, client };
};

/**
 * The migration body. Run against the harness because PGlite applies the
 * migration chain at startup, before these rows exist — the statement is what
 * is under test, not the ordering.
 */
const runBackfill = async (): Promise<void> => {
  await harness.db.execute(`
    UPDATE "api_clients"
    SET "scopes" = "scopes" || ARRAY['sso:write']::text[]
    WHERE "kind" = 'org'
      AND "org_id" IS NOT NULL
      AND "revoked_at" IS NULL
      AND NOT ("scopes" @> ARRAY['sso:write']::text[])
  `);
};

/**
 * The scopes as the database now holds them — which is the point of these
 * tests, so they are read back rather than assumed.
 */
const scopesOf = async (clientId: string): Promise<AuthedContext['actor']['scopes']> => {
  const [row] = await harness.db.select().from(apiClients).where(eq(apiClients.id, clientId));
  return row?.scopes ?? [];
};

describe('a school provisioned before teacher SSO shipped', () => {
  it('cannot sign a teacher in until the backfill runs', async () => {
    const { org, client } = await seedLegacyKey();
    const ctx = authedContext(harness.db, {
      userId: client.id,
      orgId: org.id,
      role: 'teacher',
      kind: 'client',
      scopes: client.scopes,
    });

    // The bug as an integrator meets it: a live, unrevoked, correctly
    // configured key that simply cannot do this.
    await expect(mintTeacherSsoTicket(ctx, { email: 'ada@example.test' })).rejects.toThrow(
      /cannot sign teachers in/i,
    );
  });

  it('can sign a teacher in once it has been backfilled', async () => {
    const { org, client } = await seedLegacyKey();
    await runBackfill();

    const ctx = authedContext(harness.db, {
      userId: client.id,
      orgId: org.id,
      role: 'teacher',
      kind: 'client',
      scopes: await scopesOf(client.id),
    });

    const ticket = await mintTeacherSsoTicket(ctx, { email: 'ada@example.test' });
    expect(new URL(ticket.url).pathname).toBe('/sso');
  });

  it('leaves the key holding exactly what a school provisioned today gets', async () => {
    const { client } = await seedLegacyKey();
    await runBackfill();

    // Parity with provisioning.test.ts, which spells the list out so that
    // widening it stays a deliberate act.
    expect(await scopesOf(client.id)).toEqual([...ORG_SCOPES]);
  });

  it('is idempotent, so re-running adds nothing', async () => {
    const { client } = await seedLegacyKey();
    await runBackfill();
    await runBackfill();

    const scopes = await scopesOf(client.id);
    expect(scopes.filter((scope) => scope === 'sso:write')).toHaveLength(1);
  });

  it('never widens a platform key', async () => {
    // The tiers are the security boundary: a platform credential provisions
    // schools and must hold nothing that acts inside one.
    const platform = await insertApiClient(harness.db, {
      kind: 'platform',
      orgId: null,
      name: 'Schedjuice platform',
      keyId: 'key_platform_backfill',
      scopes: ['orgs:write'] as AuthedContext['actor']['scopes'],
      createdBy: null,
      expiresAt: null,
    });

    await runBackfill();

    expect(await scopesOf(platform.id)).toEqual(['orgs:write']);
  });

  it('leaves a revoked key exactly as it was', async () => {
    const { org } = await seedLegacyKey();
    const revoked = await insertApiClient(harness.db, {
      kind: 'org',
      orgId: org.id,
      name: 'Retired key',
      keyId: 'key_revoked_backfill',
      scopes: LEGACY_SCOPES,
      createdBy: null,
      expiresAt: null,
    });
    await harness.db
      .update(apiClients)
      .set({ revokedAt: new Date('2026-08-01T00:00:00.000Z') })
      .where(eq(apiClients.id, revoked.id));

    await runBackfill();

    // History stays truthful, and a dead credential gains nothing.
    expect(await scopesOf(revoked.id)).toEqual([...LEGACY_SCOPES]);
  });

  it('still refuses the backfilled key at another school', async () => {
    // The backfill grants a scope, not reach. Cross-tenant isolation is
    // unchanged.
    const { client, org } = await seedLegacyKey();
    const rival = await makeOrg(harness.db, { name: 'Rival School' });
    await makeUser(harness.db, rival.id, { email: 'grace@rival.test', name: 'Grace' });
    await runBackfill();

    const ctx = authedContext(harness.db, {
      userId: client.id,
      orgId: org.id,
      role: 'teacher',
      kind: 'client',
      scopes: await scopesOf(client.id),
    });

    await expect(mintTeacherSsoTicket(ctx, { email: 'grace@rival.test' })).rejects.toThrow(
      /Teacher not found/i,
    );
  });
});
