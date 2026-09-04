import type { Page } from '@playwright/test';
import { addQuestion, answer, createTest, handIn, publishAndReadCode } from './authoring';
import { expect, test } from './fixtures';

const openStudent = async (page: Page, code: string) => {
  await page.goto('/take');
  await page.getByLabel('Test code').fill(code);
  await page.getByLabel('Your name').fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Start' }).click();
};

test('home presets set inputs and search filters the test list', async ({ signedIn: page }) => {
  await createTest(page, 'Alpha search drill', { stayOnHome: true });
  await createTest(page, 'Beta search drill', { stayOnHome: true });

  // Presets sit above the inputs and drive their values.
  await page.getByRole('button', { name: /^90 min/ }).click();
  await expect(page.getByTestId('new-test-limit')).toHaveValue('90');

  await page.getByRole('button', { name: '3 attempts', exact: true }).click();
  await expect(page.getByTestId('new-test-attempts')).toHaveValue('3');

  await page.getByTestId('test-search').fill('Alpha');
  await expect(page.getByRole('link', { name: 'Alpha search drill' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Beta search drill' })).toHaveCount(0);

  await page.getByTestId('test-search').fill('zzzz-no-match');
  await expect(page.getByTestId('no-search-results')).toBeVisible();

  await page.getByTestId('test-search').fill('');
  await expect(page.getByRole('link', { name: 'Alpha search drill' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Beta search drill' })).toBeVisible();
});

test('draft footer opens read-only preview with quiz-end message', async ({ signedIn: page }) => {
  const outro = 'Great work — see you next week.';
  await createTest(page, 'Preview drill', { outro });
  await addQuestion(page, 'short', 'Name a planet', { accepted: ['Earth'] });

  await expect(page.getByTestId('preview-test')).toBeVisible();
  await expect(page.getByTestId('publish')).toBeVisible();

  await page.getByTestId('preview-test').click();
  await expect(page).toHaveURL(/\/teacher\/[^/]+\/preview$/);
  await expect(page.getByText('Preview — nothing is saved.')).toBeVisible();
  await expect(page.getByText('Name a planet')).toBeVisible();

  await page.getByTestId('preview-hand-in').click();
  await expect(page.getByTestId('preview-outro')).toHaveText(outro);
});

test('students see the quiz-end message after hand-in', async ({ signedIn: page, context }) => {
  const outro = 'Thanks for completing the quiz.';
  await createTest(page, 'Outro drill', { outro });
  await addQuestion(page, 'short', '2 + 2?', { accepted: ['4'] });

  const code = await publishAndReadCode(page);

  const studentContext = await context.browser()?.newContext();
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();
  await openStudent(student, code);

  await answer(student, /^short-/, '4');
  await handIn(student);

  await expect(student.getByTestId('test-outro')).toHaveText(outro);

  await studentContext.close();
});
