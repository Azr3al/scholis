import { answer, handIn, publishAndReadCode } from './authoring';
import { expect, test } from './fixtures';

test('manual short answer stays unreleased until teacher marks it', async ({
  signedIn: page,
  context,
}) => {
  await page.getByLabel('Title').fill('Manual short quiz');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: 'Manual short quiz' }).click();

  await page.getByTestId('quick-add-kind').click();
  await page.getByRole('option', { name: 'Short answer' }).click();
  await page.getByTestId('quick-add-submit').click();
  await expect(page.getByTestId('question-list')).toContainText('Untitled question');

  const cards = page.getByTestId(/^question-card-/);
  const lastIndex = (await cards.count()) - 1;
  await page.getByTestId(`expand-question-${String(lastIndex)}`).click();
  await page.getByTestId('question-prompt').locator('.ProseMirror').fill('Name a primary colour.');
  await expect(page.getByTestId('short-grading-manual')).toBeChecked();
  await page.getByTestId('save-question').click();

  const code = await publishAndReadCode(page);

  const studentContext = await context.browser()?.newContext();
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();

  await student.goto('/take');
  await student.getByLabel('Test code').fill(code);
  await student.getByLabel('Your name').fill('Colour Student');
  await student.getByRole('button', { name: 'Start' }).click();

  await answer(student, /^short-/, 'Blue');
  await handIn(student);

  await student.getByRole('button', { name: 'Check for results' }).click();
  await expect(student.getByTestId('not-released')).toBeVisible();

  await page.getByRole('link', { name: 'Submissions' }).click();
  await expect(page.getByText('Colour Student')).toBeVisible();
  await page.getByTestId('mark-Colour Student').click();
  await page.locator('[data-testid^="score-"]').fill('1');
  await page.locator('[data-testid^="save-mark-"]').click();

  await page.getByRole('button', { name: 'Release results' }).click();
  await page.getByTestId('confirm-release').click();
  await expect(page.getByTestId('release-message')).toContainText('Released 1');

  await student.getByRole('button', { name: 'Check for results' }).click();
  await expect(student.getByTestId('result-score')).toHaveText('1 / 1');

  await studentContext.close();
});

test('rubric short answer auto-grades with case sensitivity', async ({ signedIn: page, context }) => {
  await page.getByLabel('Title').fill('Case quiz');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: 'Case quiz' }).click();

  await page.getByTestId('quick-add-kind').click();
  await page.getByRole('option', { name: 'Short answer' }).click();
  await page.getByTestId('quick-add-submit').click();

  const cards = page.getByTestId(/^question-card-/);
  const lastIndex = (await cards.count()) - 1;
  await page.getByTestId(`expand-question-${String(lastIndex)}`).click();
  await page.getByTestId('question-prompt').locator('.ProseMirror').fill('Chemical formula for salt');
  await page.getByTestId('short-grading-rubric').click();
  await page.getByTestId('accepted-body-0').fill('NaCl');
  await page.getByTestId('short-case-sensitive').check();
  await page.getByTestId('save-question').click();

  const code = await publishAndReadCode(page);

  const studentContext = await context.browser()?.newContext();
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();

  await student.goto('/take');
  await student.getByLabel('Test code').fill(code);
  await student.getByLabel('Your name').fill('Chem Student');
  await student.getByRole('button', { name: 'Start' }).click();

  await answer(student, /^short-/, 'nacl');
  await handIn(student);

  await page.getByRole('link', { name: 'Submissions' }).click();
  await expect(page.getByText('Chem Student')).toBeVisible();
  await page.getByTestId('mark-Chem Student').click();
  await expect(page.getByText('marked automatically')).toBeVisible();
  await expect(page.getByText('0 / 1')).toBeVisible();

  await page.getByRole('button', { name: 'Release results' }).click();
  await page.getByTestId('confirm-release').click();

  await student.getByRole('button', { name: 'Check for results' }).click();
  await expect(student.getByTestId('result-score')).toHaveText('0 / 1');

  await studentContext.close();
});
