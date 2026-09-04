import type { APIRequestContext, Page } from '@playwright/test';
import { createTest } from './authoring';
import { expect, test } from './fixtures';

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';

/**
 * Sign-up and teams, end to end.
 *
 * This is the one flow that creates its own accounts, so it deliberately does
 * not use the `teacher` fixture — the whole point is that a teacher can arrive
 * with nothing and leave with a team, without an administrator provisioning
 * anything for them.
 */

/** The dev mailer prints links rather than sending them, so there is no inbox. */
const signInAs = async (request: APIRequestContext, page: Page, email: string): Promise<void> => {
  const res = await request.post(`${API}/api/dev/magic-link`, { data: { email } });
  if (!res.ok()) throw new Error(`No sign-in link for ${email}: ${await res.text()}`);

  const { url } = (await res.json()) as { url: string };
  await page.goto(url);
  await page.waitForURL('**/teacher');
};

test('a teacher signs up, invites a colleague, and they share one library', async ({
  page,
  request,
  context,
}) => {
  const stamp = Date.now().toString(36);
  const ownerEmail = `owner-${stamp}@scholis.test`;
  const colleagueEmail = `colleague-${stamp}@scholis.test`;

  // --- sign up ---------------------------------------------------------------
  await page.goto('/sign-up');
  await page.getByTestId('signup-name').fill('Ada Lovelace');
  await page.getByTestId('signup-email').fill(ownerEmail);
  await page.getByTestId('signup-team').fill(`Maths ${stamp}`);
  await page.getByTestId('signup-submit').click();

  // Sign-up ends at the email, exactly as signing in does.
  await expect(page.getByText('Check your email')).toBeVisible();

  await signInAs(request, page, ownerEmail);

  // A brand new team owns nothing yet, and that is a state the page must handle.
  await expect(page.getByTestId('test-list')).toBeVisible();

  // The owner's own paper, which the colleague must be able to see later.
  await createTest(page, `Shared paper ${stamp}`);
  await expect(page.getByTestId('test-status')).toHaveText('draft');

  // --- invite ----------------------------------------------------------------
  await page.goto('/teacher/team');
  await page.getByTestId('invite-email').fill(colleagueEmail);
  await page.getByTestId('invite-submit').click();

  const inviteUrl = await page.getByTestId('invite-url').innerText();
  expect(inviteUrl).toContain('/join?token=');

  // The invitation is listed as outstanding until it is used.
  await expect(page.getByTestId('team-invites')).toContainText(colleagueEmail);

  // --- accept, as a different person in a different browser ------------------
  const colleagueContext = await context.browser()?.newContext();
  if (colleagueContext === undefined) throw new Error('no browser context');
  const colleague = await colleagueContext.newPage();

  // Only the path is taken from the returned URL: the API builds it from
  // WEB_ORIGIN, which need not be the origin Playwright is driving.
  await colleague.goto(new URL(inviteUrl).pathname + new URL(inviteUrl).search);
  await colleague.getByTestId('join-name').fill('Grace Hopper');
  await colleague.getByTestId('join-submit').click();
  await expect(colleague.getByText("You're in")).toBeVisible();

  await signInAs(colleagueContext.request, colleague, colleagueEmail);

  // The actual promise of a team: the owner's paper is simply there, with no
  // sharing step in between.
  await expect(colleague.getByRole('link', { name: `Shared paper ${stamp}` })).toBeVisible();

  // And it is editable, not merely visible — collaborative editing is both
  // people using the same authoring endpoints against the same org. The editor
  // opens on settings, so the proof is that the authoring controls are there
  // and working, not that a question happens to be open.
  await colleague.getByRole('link', { name: `Shared paper ${stamp}` }).click();
  await expect(colleague.getByTestId('quick-add-submit')).toBeVisible();
  await expect(colleague.getByTestId('test-settings-title')).toHaveValue(`Shared paper ${stamp}`);

  // The owner now sees two people and no outstanding invitation.
  await page.reload();
  await expect(page.getByTestId('team-members')).toContainText('Ada Lovelace');
  await expect(page.getByTestId('team-members')).toContainText('Grace Hopper');
  await expect(page.getByTestId('team-invites')).toHaveCount(0);

  await colleagueContext.close();
});

test('signing up with an address that already exists says so', async ({ page }) => {
  const email = `dup-${Date.now().toString(36)}@scholis.test`;

  await page.goto('/sign-up');
  await page.getByTestId('signup-name').fill('First');
  await page.getByTestId('signup-email').fill(email);
  await page.getByTestId('signup-submit').click();
  await expect(page.getByText('Check your email')).toBeVisible();

  await page.goto('/sign-up');
  await page.getByTestId('signup-name').fill('Second');
  await page.getByTestId('signup-email').fill(email);
  await page.getByTestId('signup-submit').click();

  // Told plainly, and pointed somewhere useful.
  await expect(page.getByTestId('signup-error')).toContainText(/already exists/i);
});

test('an invitation link that has been used cannot be used again', async ({
  signedIn: page,
  context,
}) => {
  const email = `once-${Date.now().toString(36)}@scholis.test`;

  await page.goto('/teacher/team');
  await page.getByTestId('invite-email').fill(email);
  await page.getByTestId('invite-submit').click();
  const inviteUrl = await page.getByTestId('invite-url').innerText();
  const joinPath = new URL(inviteUrl).pathname + new URL(inviteUrl).search;

  const first = await context.browser()?.newContext();
  if (first === undefined) throw new Error('no browser context');
  const joiner = await first.newPage();
  await joiner.goto(joinPath);
  await joiner.getByTestId('join-name').fill('Rightful Owner');
  await joiner.getByTestId('join-submit').click();
  await expect(joiner.getByText("You're in")).toBeVisible();

  // Someone else with the same link — a forwarded email, a shared screen.
  const second = await context.browser()?.newContext();
  if (second === undefined) throw new Error('no browser context');
  const impostor = await second.newPage();
  await impostor.goto(joinPath);
  await impostor.getByTestId('join-name').fill('Somebody Else');
  await impostor.getByTestId('join-submit').click();

  await expect(impostor.getByTestId('join-error')).toBeVisible();

  await first.close();
  await second.close();
});
