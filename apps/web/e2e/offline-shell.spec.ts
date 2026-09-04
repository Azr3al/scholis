import type { Page } from '@playwright/test';
import { addQuestion, answer, createTest, publishAndReadCode } from './authoring';
import { expect, test } from './fixtures';

/**
 * The one thing the outbox could never fix.
 *
 * Answers have always survived a reload — they are in IndexedDB. The *app* did
 * not: with no cached shell, reloading while offline gave the browser's error
 * page and the student was stranded with their work safely stored and no way to
 * reach it. This is the test for that specific hole.
 */

/*
 * Production build only.
 *
 * `next dev` loads chunks through its HMR machinery, which needs a live
 * connection and does not survive a genuine disconnect — the shell comes back
 * but never hydrates, so the page sits on the server-rendered "Loading…". That
 * is a property of the dev server, not of the worker: against the standalone
 * build every test in this file passes.
 *
 *   pnpm --filter @scholis/web build
 *   node apps/web/.next/standalone/apps/web/server.js
 *   E2E_PRODUCTION=1 E2E_WEB_URL=http://localhost:3702 pnpm test:e2e
 */
test.skip(
  process.env.E2E_PRODUCTION !== '1',
  'Offline hydration requires a production build; set E2E_PRODUCTION=1.',
);

const publishTest = async (page: Page): Promise<string> => {
  await createTest(page, 'Shell drill');
  await addQuestion(page, 'single', 'Capital of France?', {
    options: [
      { text: 'Paris', correct: true },
      { text: 'Berlin', correct: false },
    ],
  });
  await addQuestion(page, 'short', 'Largest ocean?', { accepted: ['Pacific'] });
  return publishAndReadCode(page);
};

test('the app shell survives a reload with the network genuinely down', async ({
  signedIn: page,
  context,
}) => {
  const code = await publishTest(page);

  const studentContext = await context.browser()?.newContext();
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();

  await student.goto('/take');
  await student.getByLabel('Test code').fill(code);
  await student.getByLabel('Your name').fill('Ada Lovelace');
  await student.getByRole('button', { name: 'Start' }).click();
  await expect(student.getByText('Shell drill')).toBeVisible();

  // The worker registers on mount and claims the page on first activation.
  // Without waiting for control there is nothing to serve the reload from, and
  // the test would be asserting a race.
  // Control alone isn't enough — the shell is warmed by a message from the
  // page, so wait until it is genuinely in the cache.
  //
  // expect.poll rather than waitForFunction: the predicate is async, and
  // waitForFunction treats the returned Promise as a truthy result and passes
  // immediately. That produced a green test against a completely empty cache.
  await expect
    .poll(
      () =>
        student.evaluate(async () => {
          for (const name of await caches.keys()) {
            const cache = await caches.open(name);
            if ((await cache.match('/take/__shell')) !== undefined) return true;
          }
          return false;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);

  await student.getByRole('radio').first().check();
  await expect(student.getByTestId('sync-status')).toHaveText('Saved');

  await studentContext.setOffline(true);

  // The action that used to end the attempt. Before the worker existed this
  // rejected with ERR_INTERNET_DISCONNECTED and the student saw the browser's
  // error page.
  const response = await student.reload();
  expect(response?.status()).toBe(200);

  // Our HTML, served from cache — not a browser error page.
  await expect(student.locator('main')).toBeVisible({ timeout: 20_000 });

  await studentContext.close();
});

/*
 * Ticket 5.6, the other half.
 *
 * The shell coming back is not enough on its own: the questions arrive from
 * GET /api/take/:code, and that stays network-only so scores and release state
 * can never be served stale. The paper is therefore stored by application code
 * in IndexedDB — already key-stripped by publicQuestionSchema before it left
 * the server — rather than by a worker that cannot tell one payload from
 * another.
 */
test('the paper itself is usable after an offline reload', async ({ signedIn: page, context }) => {
  const code = await publishTest(page);

  const studentContext = await context.browser()?.newContext();
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();

  await student.goto('/take');
  await student.getByLabel('Test code').fill(code);
  await student.getByLabel('Your name').fill('Ada Lovelace');
  await student.getByRole('button', { name: 'Start' }).click();
  await expect(student.getByText('Shell drill')).toBeVisible();

  await expect
    .poll(
      () =>
        student.evaluate(async () => {
          for (const name of await caches.keys()) {
            const cache = await caches.open(name);
            if ((await cache.match('/take/__shell')) !== undefined) return true;
          }
          return false;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);

  // 2. The paper is on the device, under its code.
  const stored = await student.evaluate(
    (testCode) =>
      new Promise<{ code: string; questions: number } | null>((resolve) => {
        const open = indexedDB.open('scholis');
        open.onsuccess = () => {
          const database = open.result;
          const read = database.transaction('packages').objectStore('packages').get(testCode);
          read.onsuccess = () => {
            const row = read.result as { code: string; pkg: { questions: unknown[] } } | undefined;
            resolve(
              row === undefined ? null : { code: row.code, questions: row.pkg.questions.length },
            );
          };
          read.onerror = () => {
            resolve(null);
          };
        };
        open.onerror = () => {
          resolve(null);
        };
      }),
    code,
  );
  expect(stored).toEqual({ code, questions: 2 });

  // An answer to prove the attempt itself survives alongside the paper. The
  // counter stays at 0 because the taker is still on question one — it counts
  // questions finished with, not touched.
  await student.getByRole('radio').first().check();
  await expect(student.getByTestId('progress')).toContainText('0 of 2');
  await expect(student.getByTestId('sync-status')).toHaveText('Saved');

  // 3 and 4. Genuinely disconnected, then reopened.
  await studentContext.setOffline(true);
  await student.reload();

  // 5. The questions render rather than sitting on "Loading…".
  await expect(student.getByText('Shell drill')).toBeVisible({ timeout: 20_000 });
  await expect(student.getByText('Capital of France?')).toBeVisible();

  // The copy is labelled as a copy — it must not pass for a fresh read.
  await expect(student.getByTestId('local-package')).toContainText(/saved on this device/i);

  // 6. And the answer given before the disconnection is still there. The
  // selection itself, not a counter reading, is the evidence.
  await expect(student.getByRole('radio').first()).toBeChecked();

  // Still usable offline, not merely readable.
  await student.getByTestId('next').click();
  await answer(student, /^short-/, 'Pacific');
  await expect(student.getByTestId('progress')).toContainText('2 of 2');

  // 7. Nothing from /api/* entered the worker's cache at any point.
  const cachedApiUrls = await student.evaluate(async () => {
    const found: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname.startsWith('/api/')) found.push(request.url);
      }
    }
    return found;
  });
  expect(cachedApiUrls).toEqual([]);

  // Back online, the queued work reaches the server.
  await studentContext.setOffline(false);
  await expect(student.getByTestId('sync-status')).toHaveText('Saved', { timeout: 30_000 });

  await studentContext.close();
});

/**
 * The exclusion that matters most. /api/* carries scores, grading and release
 * state, and the same-origin proxy put it inside this worker's scope — so a
 * careless caching rule here would show a student a mark that has since
 * changed.
 */
test('the worker never serves API responses from cache', async ({ signedIn: page, context }) => {
  const code = await publishTest(page);

  const studentContext = await context.browser()?.newContext();
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();

  await student.goto('/take');
  await student.getByLabel('Test code').fill(code);
  await student.getByLabel('Your name').fill('Grace Hopper');
  await student.getByRole('button', { name: 'Start' }).click();
  await expect(student.getByText('Shell drill')).toBeVisible();
  // Control alone isn't enough — the shell is warmed by a message from the
  // page, so wait until it is genuinely in the cache.
  //
  // expect.poll rather than waitForFunction: the predicate is async, and
  // waitForFunction treats the returned Promise as a truthy result and passes
  // immediately. That produced a green test against a completely empty cache.
  await expect
    .poll(
      () =>
        student.evaluate(async () => {
          for (const name of await caches.keys()) {
            const cache = await caches.open(name);
            if ((await cache.match('/take/__shell')) !== undefined) return true;
          }
          return false;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);

  // Every cache this origin holds, inspected directly. Nothing under /api may
  // appear in any of them.
  const cachedApiUrls = await student.evaluate(async () => {
    const names = await caches.keys();
    const found: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname.startsWith('/api/')) found.push(request.url);
      }
    }
    return found;
  });

  expect(cachedApiUrls).toEqual([]);

  await studentContext.close();
});
