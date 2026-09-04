import type { Page } from '@playwright/test';
import { addQuestion, createTest, handIn, publishAndReadCode } from './authoring';
import { expect, test } from './fixtures';

const publishTwoQuestionTest = async (page: Page): Promise<string> => {
  await createTest(page, 'Offline drill');

  await addQuestion(page, 'single', 'Capital of France?', {
    options: [
      { text: 'Paris', correct: true },
      { text: 'Berlin', correct: false },
    ],
  });
  await addQuestion(page, 'single', 'Capital of Japan?', {
    options: [
      { text: 'Tokyo', correct: true },
      { text: 'Seoul', correct: false },
    ],
  });

  return publishAndReadCode(page);
};

const startAttempt = async (page: Page, code: string, name: string) => {
  await page.goto('/take');
  await page.getByLabel('Test code').fill(code);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText('Offline drill')).toBeVisible();
};

test('answers survive a refresh mid-attempt', async ({ signedIn: page, context }) => {
  const code = await publishTwoQuestionTest(page);

  const studentContext = await context.browser()?.newContext();
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();

  await startAttempt(student, code, 'Ada Lovelace');
  await student.getByRole('radio').first().check();
  await expect(student.getByTestId('sync-status')).toHaveText('Saved');

  // Still on question one, so the counter deliberately hasn't moved yet — the
  // progress rule counts questions the taker has finished with, not touched.
  await expect(student.getByTestId('progress')).toContainText('0 of 2');

  await student.reload();

  // Same attempt, not a second one. The selection itself is the evidence the
  // answer survived — a direct check rather than reading it off a counter.
  await expect(student.getByText('Offline drill')).toBeVisible();
  await expect(student.getByRole('radio').first()).toBeChecked();

  // And it counts once they move on, which is the rule working rather than the
  // answer having been lost.
  await student.getByTestId('next').click();
  await expect(student.getByTestId('progress')).toContainText('1 of 2');

  await studentContext.close();
});

test('offline answers queue, then sync on reconnect', async ({ signedIn: page, context }) => {
  const code = await publishTwoQuestionTest(page);

  const studentContext = await context.browser()?.newContext();
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();

  await startAttempt(student, code, 'Grace Hopper');

  await studentContext.setOffline(true);
  await student.getByRole('radio').first().check();
  await student.getByTestId('next').click();
  await student.getByRole('radio').first().check();

  // The UI keeps working; the answers are just queued.
  await expect(student.getByTestId('progress')).toContainText('2 of 2');

  // The count is the point of the indicator — "Offline" alone tells a student
  // nothing about whether their work survived.
  await expect(student.getByTestId('sync-status')).toContainText(/Offline — \d+ answers? saved/, {
    timeout: 15_000,
  });

  // Shown on the first outage, and it is where the don't-reload warning lives.
  await expect(student.getByTestId('offline-explainer')).toBeVisible();

  await studentContext.setOffline(false);

  // The recovery notice, which used to happen in silence.
  await expect(student.getByTestId('sync-recovered')).toContainText(/Back online/, {
    timeout: 30_000,
  });
  await expect(student.getByTestId('sync-status')).toHaveText('Saved', { timeout: 30_000 });

  // Reloading only once back online: without a service worker the browser
  // can't fetch the app shell offline, so a mid-outage reload is a blank page
  // no matter how durable the queue is. The queue itself is covered by the
  // snapshot unit tests and by the refresh test above.
  await student.reload();
  await expect(student.getByTestId('progress')).toContainText('2 of 2');

  await handIn(student);

  // Both answers reached the server, so both are marked.
  await page.getByRole('link', { name: 'Submissions' }).click();
  await page.getByRole('button', { name: 'Release results' }).click();
  await page.getByTestId('confirm-release').click();
  await expect(page.getByTestId('release-message')).toContainText('Released 1');

  await student.getByRole('button', { name: 'Check for results' }).click();
  await expect(student.getByTestId('result-score')).toHaveText('2 / 2');

  await studentContext.close();
});

test('a refresh after handing in returns to the result screen', async ({
  signedIn: page,
  context,
}) => {
  const code = await publishTwoQuestionTest(page);

  const studentContext = await context.browser()?.newContext();
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();

  await startAttempt(student, code, 'Alan Turing');
  await student.getByRole('radio').first().check();
  await handIn(student);

  await student.reload();

  // Not a fresh paper — the attempt is already in.
  await expect(student.getByTestId('take-done')).toBeVisible();

  await studentContext.close();
});
