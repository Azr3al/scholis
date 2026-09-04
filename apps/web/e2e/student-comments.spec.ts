import type { Page } from '@playwright/test';
import { addQuestion, answer, createTest, publishAndReadCode } from './authoring';
import { expect, test } from './fixtures';

const openStudent = async (page: Page, code: string) => {
  await page.goto('/take');
  await page.getByLabel('Test code').fill(code);
  await page.getByLabel('Your name').fill('Comment Ada');
  await page.getByRole('button', { name: 'Start' }).click();
};

test('student can skip post-test comment and reach outro', async ({ signedIn: page, context }) => {
  await createTest(page, 'Comment skip drill');
  await addQuestion(page, 'short', 'Name a color', { accepted: ['Blue'] });
  const code = await publishAndReadCode(page);

  const studentContext = await context.browser()?.newContext();
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();
  await openStudent(student, code);

  await answer(student, /^short-/, 'Blue');
  await student.getByTestId('submit').click();

  await expect(student.getByTestId('comment-prompt')).toBeVisible();
  await student.getByTestId('comment-skip').click();
  await expect(student.getByTestId('take-done')).toBeVisible();

  await studentContext.close();
});

test('student comment appears on teacher Comments page', async ({ signedIn: page, context }) => {
  await createTest(page, 'Comment send drill');
  await addQuestion(page, 'short', '2 + 2?', { accepted: ['4'] });
  const code = await publishAndReadCode(page);
  const testUrl = page.url();

  const studentContext = await context.browser()?.newContext();
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();
  await openStudent(student, code);

  await answer(student, /^short-/, '4');
  await student.getByTestId('submit').click();
  await expect(student.getByTestId('comment-prompt')).toBeVisible();
  await student.getByTestId('comment-body').fill('Questions were fair.');
  await student.getByTestId('comment-submit').click();
  await expect(student.getByTestId('take-done')).toBeVisible();

  await page.goto(testUrl);
  await page.getByTestId('view-comments').click();
  await expect(page.getByTestId('comment-list')).toContainText('Questions were fair.');
  await expect(page.getByTestId('comment-list')).toContainText('Comment Ada');

  await studentContext.close();
});

test('submissions sort toggles between recent and score', async ({ signedIn: page, context }) => {
  await createTest(page, 'Sort drill');
  await addQuestion(page, 'short', 'Capital of France?', { accepted: ['Paris'] });
  const code = await publishAndReadCode(page);

  const submitAs = async (name: string, ans: string) => {
    const ctx = await context.browser()?.newContext();
    if (ctx === undefined) throw new Error('no browser context');
    const student = await ctx.newPage();
    await student.goto('/take');
    await student.getByLabel('Test code').fill(code);
    await student.getByLabel('Your name').fill(name);
    await student.getByRole('button', { name: 'Start' }).click();
    await answer(student, /^short-/, ans);
    await student.getByTestId('submit').click();
    await student.getByTestId('comment-skip').click();
    await ctx.close();
  };

  await submitAs('Slow scorer', 'Paris');
  await submitAs('Fast scorer', 'Paris');

  await page.getByRole('button', { name: 'Submissions' }).click();
  await expect(page.getByTestId('sort-recent')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('sort-score').click();
  await expect(page.getByTestId('sort-score')).toHaveAttribute('aria-pressed', 'true');
});
