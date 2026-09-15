import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Which origin this client calls, which decides whether the session cookie
 * works at all.
 *
 * In the browser every request must be relative, so it goes to the web origin
 * and is forwarded to the API by the rewrite in `next.config.ts`. That rewrite
 * exists because web and API sit on separate *.up.railway.app subdomains and
 * up.railway.app is on the Public Suffix List: browsers treat them as different
 * sites, so a SameSite=Lax cookie set by the API is never sent back from the
 * web origin.
 *
 * `BASE` used to be `NEXT_PUBLIC_API_URL` unconditionally, so the browser
 * bundle called the API directly and skipped the proxy — the `/sso` chunk
 * shipped with the API origin inlined. Teacher SSO then set its session cookie
 * host-only on the API origin, the redirect to `/teacher` read no session, and
 * the teacher landed back on sign-in having done everything right.
 *
 * Asserted on the request rather than on the constant, because the constant is
 * an implementation detail and the URL actually fetched is the thing that
 * broke.
 */

const ORIGINAL_ENV = { ...process.env };

const urlOf = (mock: ReturnType<typeof vi.fn>): string => String(mock.mock.calls[0]?.[0] ?? '');

/**
 * Re-import the module per test. `BASE` is computed once at module scope, so a
 * cached copy would carry the previous test's environment and `window`.
 */
const freshApi = async () => {
  vi.resetModules();
  return import('./api');
};

const stubFetch = () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ status: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_API_URL: 'https://api.scholis.example' };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('in the browser', () => {
  beforeEach(() => {
    // vitest runs node by default here; a defined `window` is what the module
    // branches on.
    vi.stubGlobal('window', {});
  });

  it('sends the teacher SSO exchange to the web origin, not the API origin', async () => {
    const fetchMock = stubFetch();
    const { api } = await freshApi();

    await api.exchangeTeacherSso({ ticket: 'abc' });

    // Relative, so the browser resolves it against the page it is on and the
    // Set-Cookie that comes back is first-party.
    expect(urlOf(fetchMock)).toBe('/api/auth/sso/exchange');
    expect(urlOf(fetchMock)).not.toContain('api.scholis.example');
  });

  it('keeps the session cookie on every other call too', async () => {
    // SSO is where this is unmissable, but the bug was in the shared BASE, so
    // it applied to the whole client.
    const fetchMock = stubFetch();
    const { api } = await freshApi();

    await api.getTeam();

    expect(urlOf(fetchMock)).toBe('/api/team');
  });

  it('still sends credentials, which a relative URL does not make redundant', async () => {
    const fetchMock = stubFetch();
    const { api } = await freshApi();

    await api.exchangeTeacherSso({ ticket: 'abc' });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
  });
});

describe('on the server', () => {
  it('uses the absolute API origin, having no origin to be relative to', async () => {
    // `window` is undefined here, which is the server branch.
    const fetchMock = stubFetch();
    const { api } = await freshApi();

    await api.getTeam();

    expect(urlOf(fetchMock)).toBe('https://api.scholis.example/api/team');
  });
});
