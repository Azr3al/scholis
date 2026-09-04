/*
 * Scholis offline shell.
 *
 * The answers were never the problem — they go straight to IndexedDB and a
 * durable outbox, and they survive a reload already. What did not survive was
 * the *app*: with no cached shell, reloading while offline gave the browser's
 * error page, and that is the one action that strands a student mid-exam.
 *
 * Three rules, in priority order:
 *
 *   1. /api/* is never cached, never intercepted.
 *   2. /_next/static/* is cache-first — those URLs are content-hashed.
 *   3. Navigations are network-first with a cached fallback.
 *
 * Rule 1 is the one that matters. It used to be free: the API lived on another
 * origin, so a worker scoped here could not see it. Now that /api/* is proxied
 * through this origin to keep the session cookie first-party, this worker sits
 * directly in front of scores, grading and release state. Serving any of that
 * from a cache would show a student a mark that has since changed. Hence an
 * explicit exclusion rather than a caching strategy with a careful config.
 */

const VERSION = 'scholis-v1';
const SHELL_CACHE = `${VERSION}-shell`;

/*
 * One canonical key for the take shell, rather than the attempt's own URL.
 *
 * Two reasons. The student reaches /take/<code> by client-side navigation, so
 * no document request for that URL ever reaches this worker and there would be
 * nothing under it to find. And the page is a client component: the server
 * renders the same shell whatever the code is, with the code coming from the
 * URL and the answers from IndexedDB. So one cached document serves any
 * attempt, and the query string never causes a miss.
 */
const SHELL_KEY = '/take/__shell';

// Deliberately no skipWaiting. A new deployment must not replace the shell
// underneath somebody who is halfway through an exam; the update lands once
// every tab for this origin has been closed. Staleness is the cheaper problem.
self.addEventListener('install', () => {
  // Nothing is precached. The take page is server-rendered per attempt, so
  // there is no build-time URL to precache — it enters the cache on the
  // student's first successful load, which is when they are online anyway.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
      );
      // Claim on first install so the very next reload is already covered.
      // Without this the worker sits idle until a second navigation, which is
      // exactly the reload we are trying to survive.
      await self.clients.claim();
    })(),
  );
});

const isApi = (url) => url.pathname === '/api' || url.pathname.startsWith('/api/');
const isHashedAsset = (url) => url.pathname.startsWith('/_next/static/');

/** Only ever store a complete, same-origin, successful response. */
const cacheable = (response) =>
  response !== undefined && response.ok && response.type === 'basic' && response.status === 200;

/*
 * Warmed by the page rather than guessed at here.
 *
 * The page knows exactly which chunks it loaded — the Performance API lists
 * them — and this worker does not, because those requests may have happened
 * before it took control. Asking beats parsing the HTML for script tags and
 * hoping the list is complete.
 */
/*
 * A postMessage is untrusted input, so the never-cache rule is enforced here
 * too and not only in the fetch handler.
 *
 * The fetch handler returns early for /api/*, which covers everything the
 * browser routes through it — but warm() writes URLs the page hands over, and
 * that path bypasses the handler entirely. Today the page only ever sends
 * /_next/static/ entries; this makes that a guarantee rather than a
 * convention, because the cost of getting it wrong is a student reading a mark
 * that has since changed.
 */
const warmable = (candidate) => {
  try {
    const url = new URL(candidate, self.location.origin);
    return url.origin === self.location.origin && !isApi(url) && isHashedAsset(url);
  } catch {
    return false;
  }
};

const warm = async ({ shell, assets }) => {
  const cache = await caches.open(SHELL_CACHE);

  const shellUrl = new URL(shell, self.location.origin);
  if (shellUrl.origin === self.location.origin && !isApi(shellUrl)) {
    const shellResponse = await fetch(shellUrl, { credentials: 'same-origin' });
    if (cacheable(shellResponse)) await cache.put(SHELL_KEY, shellResponse);
  }

  await Promise.all(
    assets.filter(warmable).map(async (url) => {
      if (await cache.match(url)) return;
      try {
        const response = await fetch(url, { credentials: 'same-origin' });
        if (cacheable(response)) await cache.put(url, response);
      } catch {
        // One missing chunk shouldn't abandon the rest.
      }
    }),
  );
};

self.addEventListener('message', (event) => {
  if (event.data === null || typeof event.data !== 'object') return;
  if (event.data.type !== 'warm-shell') return;
  event.waitUntil(warm({ shell: event.data.shell, assets: event.data.assets ?? [] }));
});

const networkFirst = async (request) => {
  try {
    const response = await fetch(request);
    if (cacheable(response)) {
      const cache = await caches.open(SHELL_CACHE);
      // Clone before the body is consumed by the caller.
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached !== undefined) return cached;

    // Any /take/* navigation falls back to the one warmed shell. This is the
    // reload that used to give the browser's error page.
    if (new URL(request.url).pathname.startsWith('/take/')) {
      const shell = await caches.match(SHELL_KEY);
      if (shell !== undefined) return shell;
    }
    throw error;
  }
};

const cacheFirst = async (request) => {
  const cached = await caches.match(request);
  if (cached !== undefined) return cached;

  const response = await fetch(request);
  if (cacheable(response)) {
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Writes are never ours to replay or store. Sync and submit go through here.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Rule 1. Falling through without respondWith leaves the browser to make the
  // request exactly as it would have with no worker installed.
  if (isApi(url)) return;

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  }
});
