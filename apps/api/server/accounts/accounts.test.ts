import { findUserByEmail } from '@/data/users';
import type { AuthedContext } from '@/server/context.types';
import { authedContext, publicContext } from '@/test/support';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { signUp } from './sign-up';
import { acceptInvite, getTeam, inviteMember } from './team';

const harness: TestDb = await createTestDb();

afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  await harness.reset();
});

const asOwner = async (): Promise<AuthedContext> => {
  const org = await makeOrg(harness.db);
  const user = await makeUser(harness.db, org.id);
  return authedContext(harness.db, { userId: user.id, orgId: org.id, role: 'owner' });
};

describe('signUp', () => {
  it('creates a team and makes the signer its owner', async () => {
    const ctx = publicContext(harness.db);

    const result = await signUp(ctx, {
      name: 'Ada Lovelace',
      email: 'ada@school.example',
      teamName: 'Maths Department',
    });

    expect(result.orgName).toBe('Maths Department');

    const user = await findUserByEmail(harness.db, 'ada@school.example');
    expect(user?.orgId).toBe(result.orgId);
    expect(user?.role).toBe('owner');
    // Provisioned by a flow that already proved control of the address, so the
    // first magic link isn't blocked by a verification step.
    expect(user?.emailVerified).toBe(true);
  });

  it('names the team after the person when they do not choose one', async () => {
    const result = await signUp(publicContext(harness.db), {
      name: 'Grace Hopper',
      email: 'grace@school.example',
    });
    expect(result.orgName).toContain('Grace Hopper');
  });

  it('refuses a duplicate email in words a person can act on', async () => {
    const ctx = publicContext(harness.db);
    await signUp(ctx, { name: 'Ada', email: 'ada@school.example' });

    await expect(signUp(ctx, { name: 'Ada Again', email: 'ada@school.example' })).rejects.toThrow(
      /already exists/i,
    );
  });

  it('does not collide when two teams pick the same name', async () => {
    // Two schools called Oakwood is not a mistake, so the slug gets a suffix
    // rather than the second teacher getting an error they cannot fix.
    const ctx = publicContext(harness.db);
    const first = await signUp(ctx, { name: 'A', email: 'a@x.example', teamName: 'Oakwood' });
    const second = await signUp(ctx, { name: 'B', email: 'b@x.example', teamName: 'Oakwood' });

    expect(first.orgId).not.toBe(second.orgId);
    expect(second.orgName).toBe('Oakwood');
  });

  it('lowercases the address so case cannot create a second account', async () => {
    const ctx = publicContext(harness.db);
    await signUp(ctx, { name: 'Ada', email: 'Ada@School.Example' });

    expect(await findUserByEmail(harness.db, 'ada@school.example')).not.toBeNull();
    await expect(signUp(ctx, { name: 'Ada', email: 'ada@school.example' })).rejects.toThrow(
      /already exists/i,
    );
  });
});

describe('teams', () => {
  it('invites, accepts, and puts both people in one team', async () => {
    const owner = await asOwner();

    const invite = await inviteMember(owner, { email: 'colleague@school.example' });
    expect(invite.url).toContain('/join?token=');

    const token = invite.url.split('token=')[1] ?? '';
    await acceptInvite(publicContext(harness.db), { token, name: 'Colleague' });

    const joined = await findUserByEmail(harness.db, 'colleague@school.example');
    // The whole point: same org means the same quiz library, with no
    // permissions model to grant anything.
    expect(joined?.orgId).toBe(owner.actor.orgId);
    expect(joined?.role).toBe('teacher');
  });

  it('only lets the owner invite', async () => {
    const org = await makeOrg(harness.db);
    const user = await makeUser(harness.db, org.id);
    const member = authedContext(harness.db, {
      userId: user.id,
      orgId: org.id,
      role: 'teacher',
    });

    await expect(inviteMember(member, { email: 'someone@school.example' })).rejects.toThrow(
      /only the team owner/i,
    );
  });

  it('refuses to invite someone who already has an account', async () => {
    const owner = await asOwner();
    await signUp(publicContext(harness.db), { name: 'Taken', email: 'taken@school.example' });

    await expect(inviteMember(owner, { email: 'taken@school.example' })).rejects.toThrow(
      /already belongs/i,
    );
  });

  it('burns the token, so a leaked link cannot make a second account', async () => {
    const owner = await asOwner();
    const invite = await inviteMember(owner, { email: 'once@school.example' });
    const token = invite.url.split('token=')[1] ?? '';

    await acceptInvite(publicContext(harness.db), { token, name: 'First' });
    await expect(
      acceptInvite(publicContext(harness.db), { token, name: 'Second' }),
    ).rejects.toThrow(/not found/i);
  });

  it('refuses an expired invitation', async () => {
    const owner = await asOwner();
    const invite = await inviteMember(owner, { email: 'late@school.example' });
    const token = invite.url.split('token=')[1] ?? '';

    // Eight days later. The invite lives for seven.
    const later = publicContext(harness.db, new Date(Date.now() + 8 * 24 * 60 * 60 * 1000));
    await expect(acceptInvite(later, { token, name: 'Late' })).rejects.toThrow(/expired/i);
  });

  it('refuses a token nobody issued', async () => {
    await expect(
      acceptInvite(publicContext(harness.db), { token: 'not-a-real-token', name: 'Nobody' }),
    ).rejects.toThrow(/not found/i);
  });

  it('lists members and the invitations still outstanding', async () => {
    const owner = await asOwner();
    await inviteMember(owner, { email: 'pending@school.example' });

    const team = await getTeam(owner);
    expect(team.members).toHaveLength(1);
    expect(team.invites.map((i) => i.email)).toEqual(['pending@school.example']);
  });

  it('drops an invitation from the pending list once accepted', async () => {
    const owner = await asOwner();
    const invite = await inviteMember(owner, { email: 'joiner@school.example' });
    const token = invite.url.split('token=')[1] ?? '';
    await acceptInvite(publicContext(harness.db), { token, name: 'Joiner' });

    const team = await getTeam(owner);
    expect(team.members).toHaveLength(2);
    expect(team.invites).toHaveLength(0);
  });
});
