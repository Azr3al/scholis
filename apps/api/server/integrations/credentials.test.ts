import { resolveClientActor, resolvePlatformClient } from '@/server/auth/resolve-client-actor';
import type { AuthedContext } from '@/server/context.types';
import { authedContext, publicContext } from '@/test/support';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { insertApiClient, insertApiClientSecret } from '@/data/api-clients';
import { mintCredential } from '@/server/api-credential';
import {
  issueClient,
  listClients,
  revokeClient,
  revokeSecret,
  rotateClientSecret,
} from './manage-clients';

const harness: TestDb = await createTestDb();

afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  await harness.reset();
});

const asOwner = async (): Promise<AuthedContext> => {
  const org = await makeOrg(harness.db);
  const user = await makeUser(harness.db, org.id, { role: 'owner' });
  return authedContext(harness.db, { userId: user.id, orgId: org.id, role: 'owner' });
};

describe('issuing a key', () => {
  it('returns a working token exactly once', async () => {
    const ctx = await asOwner();

    const issued = await issueClient(ctx, {
      name: 'Schedjuice production',
      scopes: ['tests:read', 'results:read'],
    });
    expect(issued.token).toMatch(/^sch_live_/);

    // The token authenticates, and lands on the same org the owner belongs to.
    const actor = await resolveClientActor(publicContext(harness.db), issued.token);
    expect(actor?.orgId).toBe(ctx.actor.orgId);
    expect(actor?.scopes).toEqual(['tests:read', 'results:read']);

    // And it is never retrievable afterwards — the listing has no token in it.
    const listed = await listClients(ctx);
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(issued.token);
  });

  it('refuses a secret that is one character out', async () => {
    const ctx = await asOwner();
    const issued = await issueClient(ctx, { name: 'Key', scopes: ['tests:read'] });

    const tampered = `${issued.token.slice(0, -1)}${issued.token.endsWith('a') ? 'b' : 'a'}`;
    expect(await resolveClientActor(publicContext(harness.db), tampered)).toBeNull();
  });

  it('refuses a token that is not ours at all', async () => {
    // Every request carrying somebody else's bearer token arrives here.
    const ctx = publicContext(harness.db);
    expect(await resolveClientActor(ctx, 'Bearer nonsense')).toBeNull();
    expect(await resolveClientActor(ctx, 'ghp_someothersystemstoken')).toBeNull();
    expect(await resolveClientActor(ctx, 'sch_live_nodothere')).toBeNull();
  });

  it('will not sell a team key the keys to the kingdom', async () => {
    // orgs:write is the platform tier's scope. A school holding it could
    // provision other schools, which is the entire reason the tiers are split.
    const ctx = await asOwner();
    await expect(
      issueClient(ctx, { name: 'Overreach', scopes: ['tests:read', 'orgs:write'] }),
    ).rejects.toThrow(/cannot hold/i);
  });
});

describe('who may manage keys', () => {
  it('refuses a teacher who is not the owner', async () => {
    const org = await makeOrg(harness.db);
    const user = await makeUser(harness.db, org.id, { role: 'teacher' });
    const teacher = authedContext(harness.db, {
      userId: user.id,
      orgId: org.id,
      role: 'teacher',
    });

    await expect(issueClient(teacher, { name: 'No', scopes: ['tests:read'] })).rejects.toThrow(
      /only the team owner/i,
    );
  });

  it('refuses a machine, even one acting for the right school', async () => {
    // The rule that makes revocation mean something. If a leaked key could
    // mint another, revoking the leaked one would achieve nothing at all.
    const org = await makeOrg(harness.db);
    const machine = authedContext(harness.db, {
      userId: 'a-client-id',
      orgId: org.id,
      role: 'owner',
      kind: 'client',
      scopes: ['tests:read', 'tests:write', 'results:read', 'launch:write'],
    });

    await expect(issueClient(machine, { name: 'Self-replicating', scopes: ['tests:read'] }))
      .rejects.toThrow(/signed in to the dashboard/i);
  });
});

describe('rotation', () => {
  it('leaves both secrets working, so rotating is not an outage', async () => {
    const ctx = await asOwner();
    const first = await issueClient(ctx, { name: 'Rotating', scopes: ['tests:read'] });

    const second = await rotateClientSecret(ctx, { clientId: first.id });

    // The public half does not change — the caller keeps quoting one key id.
    expect(second.keyId).toBe(first.keyId);

    // Both authenticate. That overlap is the whole point: deploy the new one,
    // then retire the old one, with no moment where neither works.
    const take = publicContext(harness.db);
    expect(await resolveClientActor(take, first.token)).not.toBeNull();
    expect(await resolveClientActor(take, second.token)).not.toBeNull();
  });

  it('stops the old secret once it is revoked', async () => {
    const ctx = await asOwner();
    const first = await issueClient(ctx, { name: 'Rotating', scopes: ['tests:read'] });
    const second = await rotateClientSecret(ctx, { clientId: first.id });

    const secrets = await listClients(ctx);
    expect(secrets[0]?.liveSecrets).toBe(2);

    const rows = await harness.db.query.apiClientSecrets.findMany();
    const oldest = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    await revokeSecret(ctx, { clientId: first.id, secretId: oldest?.id ?? '' });

    const take = publicContext(harness.db);
    expect(await resolveClientActor(take, first.token)).toBeNull();
    expect(await resolveClientActor(take, second.token)).not.toBeNull();
  });

  it('refuses to revoke the only secret', async () => {
    // Doing so would leave a key that authenticates nothing while still
    // looking live in the dashboard. Revoking the key says what happened.
    const ctx = await asOwner();
    const issued = await issueClient(ctx, { name: 'Lonely', scopes: ['tests:read'] });
    const rows = await harness.db.query.apiClientSecrets.findMany();

    await expect(
      revokeSecret(ctx, { clientId: issued.id, secretId: rows[0]?.id ?? '' }),
    ).rejects.toThrow(/only working secret/i);
  });
});

describe('revocation and expiry', () => {
  it('stops a revoked key immediately', async () => {
    const ctx = await asOwner();
    const issued = await issueClient(ctx, { name: 'Doomed', scopes: ['tests:read'] });

    await revokeClient(ctx, { clientId: issued.id });

    expect(await resolveClientActor(publicContext(harness.db), issued.token)).toBeNull();
  });

  it('stops a key past its expiry', async () => {
    const ctx = await asOwner();
    const issued = await issueClient(ctx, {
      name: 'Short-lived',
      scopes: ['tests:read'],
      expiresInDays: 1,
    });

    const later = publicContext(harness.db, new Date('2026-08-09T10:00:00.000Z'));
    expect(await resolveClientActor(later, issued.token)).toBeNull();
  });

  it('will not let one school reach another school key', async () => {
    const owner = await asOwner();
    const issued = await issueClient(owner, { name: 'Theirs', scopes: ['tests:read'] });

    const other = await asOwner();
    await expect(revokeClient(other, { clientId: issued.id })).rejects.toThrow(/not found/i);
  });
});

describe('the platform tier', () => {
  /** Minted directly: there is no dashboard route that issues one. */
  const makePlatformKey = async (): Promise<string> => {
    const credential = mintCredential();
    const client = await insertApiClient(harness.db, {
      kind: 'platform',
      orgId: null,
      name: 'Schedjuice',
      keyId: credential.keyId,
      scopes: ['orgs:write'],
      createdBy: null,
      expiresAt: null,
    });
    await insertApiClientSecret(harness.db, {
      clientId: client.id,
      secretHash: credential.secretHash,
    });
    return credential.token;
  };

  it('resolves as a platform client', async () => {
    const token = await makePlatformKey();
    const platform = await resolvePlatformClient(publicContext(harness.db), token);
    expect(platform?.scopes).toEqual(['orgs:write']);
  });

  it('cannot become an actor, so it can never read a school', async () => {
    // A platform key belongs to no organisation. There is nothing to scope a
    // read to, so it must not resolve into the shape every service trusts.
    const token = await makePlatformKey();
    expect(await resolveClientActor(publicContext(harness.db), token)).toBeNull();
  });

  it('does not accept an ordinary team key in its place', async () => {
    const ctx = await asOwner();
    const issued = await issueClient(ctx, { name: 'Team key', scopes: ['tests:read'] });

    expect(await resolvePlatformClient(publicContext(harness.db), issued.token)).toBeNull();
  });
});
