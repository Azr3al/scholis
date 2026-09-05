import { findOrgByExternalRef } from '@/data/organizations';
import { resolveClientActor } from '@/server/auth/resolve-client-actor';
import type { PlatformContext } from '@/server/context.types';
import { publicContext } from '@/test/support';
import { createTestDb, type TestDb } from '@scholis/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { provisionOrg } from './provision-org';

const harness: TestDb = await createTestDb();

afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  await harness.reset();
});

const platformContext = (now = new Date('2026-08-07T10:00:00.000Z')): PlatformContext => ({
  ...publicContext(harness.db, now),
  platform: { clientId: 'platform-client' },
});

describe('provisioning a school', () => {
  it('creates the organisation and a key that works', async () => {
    const ctx = platformContext();

    const result = await provisionOrg(ctx, {
      externalRef: 'tenant-oakwood',
      name: 'Oakwood International',
    });

    expect(result.created).toBe(true);
    expect(result.key).not.toBeNull();

    // The key it hands back is immediately usable, and scoped to the school it
    // just made — a caller should not need a second round trip to start work.
    const actor = await resolveClientActor(publicContext(harness.db), result.key?.token ?? '');
    expect(actor?.orgId).toBe(result.orgId);
    expect(actor?.kind).toBe('client');
  });

  it('returns the same school on a retry rather than making a second one', async () => {
    // The failure this prevents: a caller times out, retries, and ends up with
    // two half-schools — some papers in each, and no way to tell which is real.
    const ctx = platformContext();

    const first = await provisionOrg(ctx, { externalRef: 'tenant-a', name: 'A School' });
    const second = await provisionOrg(ctx, { externalRef: 'tenant-a', name: 'A School' });

    expect(second.orgId).toBe(first.orgId);
    expect(second.created).toBe(false);
  });

  it('does not mint a second key on a retry', async () => {
    // Handing one out on every call would leave a caller with a network
    // problem quietly accumulating live credentials it never recorded.
    const ctx = platformContext();

    await provisionOrg(ctx, { externalRef: 'tenant-b', name: 'B School' });
    const retry = await provisionOrg(ctx, { externalRef: 'tenant-b', name: 'B School' });

    expect(retry.key).toBeNull();
  });

  it('lets two schools share a name', async () => {
    // Two St Mary's is not a mistake, so the slug takes a suffix rather than
    // failing a caller who cannot do anything about it.
    const ctx = platformContext();

    const first = await provisionOrg(ctx, { externalRef: 't1', name: "St Mary's" });
    const second = await provisionOrg(ctx, { externalRef: 't2', name: "St Mary's" });

    expect(first.orgId).not.toBe(second.orgId);
    expect(second.created).toBe(true);
  });

  it("records the caller's own identifier for the school", async () => {
    const ctx = platformContext();
    await provisionOrg(ctx, { externalRef: 'tenant-c', name: 'C School' });

    const found = await findOrgByExternalRef(harness.db, 'tenant-c');
    expect(found?.name).toBe('C School');
  });

  it('gives the new key every scope a team key may hold', async () => {
    // Narrower would mean a caller cannot author a paper for the school it
    // just provisioned, which is the first thing it will try to do.
    //
    // The list is spelled out rather than compared against ORG_SCOPES on
    // purpose. This is a tripwire: provisioning grants all of it to every
    // school it creates, so a scope added to ORG_SCOPES silently becomes
    // something every integrating platform can do at every school. Making that
    // a failing test means the decision gets taken deliberately. `sso:write`
    // was added for teacher sign-in and is here because a platform that
    // provisions a school is the same platform that will send its teachers in;
    // a school wanting a narrower key can mint one from the dashboard, which
    // takes an explicit scope list.
    const ctx = platformContext();
    const result = await provisionOrg(ctx, { externalRef: 'tenant-d', name: 'D School' });

    const actor = await resolveClientActor(publicContext(harness.db), result.key?.token ?? '');
    expect(actor?.scopes).toEqual([
      'tests:read',
      'tests:write',
      'results:read',
      'launch:write',
      'sso:write',
    ]);
    // And never the platform scope.
    expect(actor?.scopes).not.toContain('orgs:write');
  });
});
