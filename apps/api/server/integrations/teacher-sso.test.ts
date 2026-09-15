import { insertApiClient } from '@/data/api-clients';
import { claimTeacherSsoTicket } from '@/data/teacher-sso';
import type { AuthedContext } from '@/server/context.types';
import { authedContext, publicContext } from '@/test/support';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { exchangeTeacherSsoTicket } from '../auth/exchange-teacher-sso';
import { mintTeacherSsoTicket, teacherSsoInput } from './teacher-sso';

const harness: TestDb = await createTestDb();

afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  await harness.reset();
});

// authedContext fixes `now` at 10:00:00Z, so a five-minute ticket expires at
// 10:05:00Z and "later" can be an exact timestamp rather than a tolerance.
const MINTED_AT = new Date('2026-08-07T10:00:00.000Z');
const EXPIRES_AT = new Date('2026-08-07T10:05:00.000Z');
const AFTER_EXPIRY = new Date('2026-08-07T10:06:00.000Z');

const EVERY_ORG_SCOPE = [
  'tests:read',
  'tests:write',
  'results:read',
  'launch:write',
  'sso:write',
] as const;

const seed = async (scopes: readonly string[] = EVERY_ORG_SCOPE) => {
  const org = await makeOrg(harness.db);
  const other = await makeOrg(harness.db, { name: 'Rival School' });

  const ada = await makeUser(harness.db, org.id, {
    email: 'ada@example.test',
    name: 'Ada Lovelace',
  });
  const outsider = await makeUser(harness.db, other.id, { email: 'grace@rival.test' });

  // A real api_clients row, not a made-up id. `minted_by_client_id` is a uuid
  // foreign key onto it, and in production a client actor's `userId` *is* that
  // row's id (see resolve-client-actor.ts), so a placeholder string here would
  // be testing a situation that cannot occur while hiding the one that can.
  const client = await insertApiClient(harness.db, {
    kind: 'org',
    orgId: org.id,
    name: 'Schedjuice production',
    keyId: 'key_sso_test',
    scopes: [...scopes] as AuthedContext['actor']['scopes'],
    createdBy: null,
    expiresAt: null,
  });

  // The machine acting for one school, which is all an org key ever is.
  const machine: AuthedContext = authedContext(harness.db, {
    userId: client.id,
    orgId: org.id,
    role: 'teacher',
    kind: 'client',
    scopes: [...scopes] as AuthedContext['actor']['scopes'],
  });

  return { org, other, ada, outsider, machine, client };
};

const ticketFrom = (url: string): string => new URL(url).searchParams.get('ticket') ?? '';

describe('minting a teacher sign-in ticket', () => {
  it('produces a link to the exchange page carrying a token', async () => {
    const { machine } = await seed();

    const ticket = await mintTeacherSsoTicket(machine, { email: 'ada@example.test' });

    expect(new URL(ticket.url).pathname).toBe('/sso');
    expect(ticketFrom(ticket.url)).not.toBe('');
    expect(ticket.expiresAt).toBe(EXPIRES_AT.toISOString());
  });

  it('gives the ticket a five-minute life, measured from the context clock', async () => {
    const { machine } = await seed();

    const ticket = await mintTeacherSsoTicket(machine, { email: 'ada@example.test' });
    const row = await claimTeacherSsoTicket(harness.db, ticketFrom(ticket.url), MINTED_AT);

    // The expiry is computed from the context clock, which is the assertion
    // that matters: it is what decides whether a ticket is still good.
    expect(row?.expiresAt.toISOString()).toBe(EXPIRES_AT.toISOString());

    // `created_at` is deliberately not asserted. Like every table here it
    // defaults to the database clock rather than `ctx.now()`, so pinning it
    // would make the test depend on wall time. It is an audit stamp; the
    // expiry is the one the security argument rests on.
  });

  it('refuses a key without the sso:write scope', async () => {
    const { machine } = await seed(['tests:read', 'results:read', 'launch:write']);

    await expect(mintTeacherSsoTicket(machine, { email: 'ada@example.test' })).rejects.toThrow(
      /cannot sign teachers in/i,
    );
  });

  it('refuses a signed-in person, who carries no scopes at all', async () => {
    const { org, ada } = await seed();
    const person = authedContext(harness.db, {
      userId: ada.id,
      orgId: org.id,
      role: 'owner',
    });

    // Not an oversight to assert: minting a session for somebody else is
    // exactly what a dashboard button must not become.
    await expect(mintTeacherSsoTicket(person, { email: 'ada@example.test' })).rejects.toThrow(
      /cannot sign teachers in/i,
    );
  });

  it('refuses an email that has no account, rather than creating one', async () => {
    const { machine } = await seed();

    await expect(mintTeacherSsoTicket(machine, { email: 'nobody@example.test' })).rejects.toThrow(
      /Teacher not found/i,
    );
  });

  it('refuses a teacher who belongs to another school', async () => {
    const { machine } = await seed();

    await expect(mintTeacherSsoTicket(machine, { email: 'grace@rival.test' })).rejects.toThrow(
      /Teacher not found/i,
    );
  });

  it("says the same thing for a stranger and for another school's teacher", async () => {
    const { machine } = await seed();

    // The two must be indistinguishable. If they were not, an org key could
    // enumerate which addresses hold accounts at other schools simply by
    // watching the message change.
    const stranger = await mintTeacherSsoTicket(machine, { email: 'nobody@example.test' }).catch(
      (e: unknown) => (e as Error).message,
    );
    const rival = await mintTeacherSsoTicket(machine, { email: 'grace@rival.test' }).catch(
      (e: unknown) => (e as Error).message,
    );

    expect(stranger).toBe(rival);
  });

  it('matches an address regardless of case', async () => {
    const { machine, ada } = await seed();

    // z.email() accepts uppercase, and the service lowercases before the
    // lookup. Normalising in the service rather than the schema is the house
    // rule — see sign-up.ts, where chaining .toLowerCase() onto z.email()
    // silently did nothing in zod 4 and let one address become two accounts.
    const ticket = await mintTeacherSsoTicket(machine, { email: 'ADA@Example.TEST' });
    const row = await claimTeacherSsoTicket(harness.db, ticketFrom(ticket.url), MINTED_AT);

    expect(row?.userId).toBe(ada.id);
  });

  it('rejects a padded address at the schema, before the service is reached', () => {
    // The service trims, but a caller over HTTP never gets that far: z.email()
    // gates the shape first and refuses surrounding whitespace. Asserted
    // because the trim in the service otherwise reads like a promise to
    // integrators that it does not make. They should send clean addresses —
    // which is what sign-up asks of a human, too.
    expect(teacherSsoInput.safeParse({ email: ' ada@example.test ' }).success).toBe(false);
    expect(teacherSsoInput.safeParse({ email: 'ada@example.test' }).success).toBe(true);
  });

  it("records the caller's staff reference and the credential that minted it", async () => {
    const { machine, client } = await seed();

    const ticket = await mintTeacherSsoTicket(machine, {
      email: 'ada@example.test',
      externalRef: 'staff-42',
    });
    const row = await claimTeacherSsoTicket(harness.db, ticketFrom(ticket.url), MINTED_AT);

    // Audit only. Neither value authorises anything — the ticket names a
    // resolved Scholis user and that is the whole of the authorisation.
    expect(row?.externalRef).toBe('staff-42');
    expect(row?.mintedByClientId).toBe(client.id);
  });

  it('leaves the minting credential null when a person minted it', async () => {
    const { org, ada } = await seed();
    // Scoped by hand, because a person would never be granted this in
    // production — the assertion is about the audit column, not the policy.
    const person = authedContext(harness.db, {
      userId: ada.id,
      orgId: org.id,
      role: 'owner',
      scopes: ['sso:write'],
    });

    const ticket = await mintTeacherSsoTicket(person, { email: 'ada@example.test' });
    const row = await claimTeacherSsoTicket(harness.db, ticketFrom(ticket.url), MINTED_AT);

    expect(row?.mintedByClientId).toBeNull();
  });

  it('issues a different token every time', async () => {
    const { machine } = await seed();

    const first = ticketFrom(
      (await mintTeacherSsoTicket(machine, { email: 'ada@example.test' })).url,
    );
    const second = ticketFrom(
      (await mintTeacherSsoTicket(machine, { email: 'ada@example.test' })).url,
    );

    expect(first).not.toBe(second);
  });
});

describe('exchanging a teacher sign-in ticket', () => {
  it('returns the teacher the ticket was minted for, in their own school', async () => {
    const { machine, org, ada } = await seed();
    const ticket = await mintTeacherSsoTicket(machine, { email: 'ada@example.test' });

    const exchanged = await exchangeTeacherSsoTicket(publicContext(harness.db), {
      ticket: ticketFrom(ticket.url),
    });

    expect(exchanged.userId).toBe(ada.id);
    expect(exchanged.orgId).toBe(org.id);
  });

  it('works once, and only once', async () => {
    const { machine } = await seed();
    const ticket = ticketFrom(
      (await mintTeacherSsoTicket(machine, { email: 'ada@example.test' })).url,
    );

    await exchangeTeacherSsoTicket(publicContext(harness.db), { ticket });

    await expect(exchangeTeacherSsoTicket(publicContext(harness.db), { ticket })).rejects.toThrow(
      /already been used or has expired/i,
    );
  });

  it('refuses a ticket that has expired', async () => {
    const { machine } = await seed();
    const ticket = ticketFrom(
      (await mintTeacherSsoTicket(machine, { email: 'ada@example.test' })).url,
    );

    await expect(
      exchangeTeacherSsoTicket(publicContext(harness.db, AFTER_EXPIRY), { ticket }),
    ).rejects.toThrow(/already been used or has expired/i);
  });

  it('accepts a ticket one moment before it expires', async () => {
    const { machine } = await seed();
    const ticket = ticketFrom(
      (await mintTeacherSsoTicket(machine, { email: 'ada@example.test' })).url,
    );

    // The boundary is `<=`, so the exact expiry instant is already too late and
    // one millisecond before it is not.
    await expect(
      exchangeTeacherSsoTicket(publicContext(harness.db, EXPIRES_AT), { ticket }),
    ).rejects.toThrow(/already been used or has expired/i);

    const fresh = ticketFrom(
      (await mintTeacherSsoTicket(machine, { email: 'ada@example.test' })).url,
    );
    await expect(
      exchangeTeacherSsoTicket(publicContext(harness.db, new Date(EXPIRES_AT.getTime() - 1)), {
        ticket: fresh,
      }),
    ).resolves.toBeDefined();
  });

  it('says the same thing for a spent ticket, an expired one, and one never issued', async () => {
    const { machine } = await seed();
    const spent = ticketFrom(
      (await mintTeacherSsoTicket(machine, { email: 'ada@example.test' })).url,
    );
    await exchangeTeacherSsoTicket(publicContext(harness.db), { ticket: spent });

    const expired = ticketFrom(
      (await mintTeacherSsoTicket(machine, { email: 'ada@example.test' })).url,
    );

    const messages = await Promise.all([
      exchangeTeacherSsoTicket(publicContext(harness.db), { ticket: spent }).catch(
        (e: unknown) => (e as Error).message,
      ),
      exchangeTeacherSsoTicket(publicContext(harness.db, AFTER_EXPIRY), { ticket: expired }).catch(
        (e: unknown) => (e as Error).message,
      ),
      exchangeTeacherSsoTicket(publicContext(harness.db), {
        ticket: 'never-issued',
      }).catch((e: unknown) => (e as Error).message),
    ]);

    expect(new Set(messages).size).toBe(1);
  });

  it('refuses an empty token rather than claiming with one', async () => {
    // The zod schema on the route rejects this before the service ever sees it.
    // Called directly, the service still has to refuse: claiming with an empty
    // string would match nothing and must not become a session.
    await expect(
      exchangeTeacherSsoTicket(publicContext(harness.db), { ticket: '' }),
    ).rejects.toThrow(/already been used or has expired/i);
  });
});
