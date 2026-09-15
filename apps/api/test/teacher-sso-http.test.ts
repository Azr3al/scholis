import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LibDbModule from '@/lib/db';

type LibDb = typeof LibDbModule;

/**
 * The teacher SSO round trip, over real HTTP, through the real Better Auth
 * instance.
 *
 * Everything else in this suite calls services directly, which is why the
 * service-level tests all pass while the flow an integrator actually drives
 * has never been executed once: mint over HTTP with a bearer key, then
 * exchange the ticket on the endpoint Better Auth mounts and see whether a
 * session cookie comes back and is accepted afterwards.
 */

const harness: TestDb = await createTestDb();

process.env.AUTH_SECRET ??= 'test-auth-secret-value-at-least-32-chars';
process.env.ATTEMPT_TOKEN_SECRET ??= 'test-attempt-token-secret';
process.env.DATABASE_URL ??= 'postgresql://unused/unused';
process.env.WEB_ORIGIN ??= 'http://localhost:3000';

// lib/db is the composition root: both the Hono app and Better Auth reach the
// database through it, so pointing it at PGlite is enough to boot the whole
// stack in-process.
vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<LibDb>('@/lib/db');
  return {
    ...actual,
    getDb: () => harness.db,
    pingDb: () => Promise.resolve(true),
  };
});

const { api } = await import('@/http/app');
const { insertApiClient, insertApiClientSecret } = await import('@/data/api-clients');
const { mintCredential } = await import('@/server/api-credential');

afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  await harness.reset();
});

const seed = async () => {
  const org = await makeOrg(harness.db);
  const ada = await makeUser(harness.db, org.id, {
    email: 'ada@example.test',
    name: 'Ada Lovelace',
  });

  const credential = mintCredential();
  const client = await insertApiClient(harness.db, {
    kind: 'org',
    orgId: org.id,
    name: 'Schedjuice production',
    keyId: credential.keyId,
    scopes: ['tests:read', 'tests:write', 'results:read', 'launch:write', 'sso:write'],
    createdBy: null,
    expiresAt: null,
  });
  await insertApiClientSecret(harness.db, {
    clientId: client.id,
    secretHash: credential.secretHash,
  });

  return { org, ada, token: credential.token };
};

const mint = async (token: string, body: Record<string, unknown>): Promise<Response> =>
  api.request('/api/integration/teacher-sso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

describe('teacher SSO over HTTP', () => {
  it('mints a ticket for a valid org key', async () => {
    const { token } = await seed();

    const res = await mint(token, { email: 'ada@example.test' });
    expect(res.status).toBe(201);

    const body = (await res.json()) as { url: string; expiresAt: string };
    expect(new URL(body.url).pathname).toBe('/sso');
    expect(new URL(body.url).searchParams.get('ticket')).toBeTruthy();
  });

  it('exchanges the ticket for a session cookie', async () => {
    const { token } = await seed();
    const minted = (await (await mint(token, { email: 'ada@example.test' })).json()) as {
      url: string;
    };
    const ticket = new URL(minted.url).searchParams.get('ticket') ?? '';

    // Exactly what apps/web/lib/api.ts sends: a JSON POST from the web origin.
    const res = await api.request('/api/auth/sso/exchange', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ ticket }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeTruthy();
  });

  it('the session cookie it returns is accepted on a later request', async () => {
    const { token } = await seed();
    const minted = (await (await mint(token, { email: 'ada@example.test' })).json()) as {
      url: string;
    };
    const ticket = new URL(minted.url).searchParams.get('ticket') ?? '';

    const exchanged = await api.request('/api/auth/sso/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ ticket }),
    });
    const setCookie = exchanged.headers.get('set-cookie') ?? '';
    const cookie = setCookie
      .split(/,(?=[^;]+?=)/)
      .map((part) => part.split(';')[0]?.trim() ?? '')
      .filter((part) => part !== '')
      .join('; ');

    const tests = await api.request('/api/tests', { headers: { cookie } });
    expect(tests.status).toBe(200);
  });

  it('refuses a replayed ticket', async () => {
    const { token } = await seed();
    const minted = (await (await mint(token, { email: 'ada@example.test' })).json()) as {
      url: string;
    };
    const ticket = new URL(minted.url).searchParams.get('ticket') ?? '';

    const headers = { 'Content-Type': 'application/json', origin: 'http://localhost:3000' };
    const first = await api.request('/api/auth/sso/exchange', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ticket }),
    });
    expect(first.status).toBe(200);

    const second = await api.request('/api/auth/sso/exchange', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ticket }),
    });
    expect(second.status).toBe(403);
  });
});
