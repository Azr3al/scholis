import type { Page } from '@playwright/test';
import {
  addQuestion,
  answer,
  createTest,
  fillOptions,
  handIn,
  publishAndReadCode,
} from './authoring';
import { expect, test } from './fixtures';

const openStudent = async (page: Page, code: string) => {
  await page.goto('/take');
  await page.getByLabel('Test code').fill(code);
  await page.getByLabel('Your name').fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Start' }).click();
};

/**
 * The point of this one is that an edit has to reach the student — not just the
 * teacher's list. Editing the prompt alone would pass even if the answer key
 * were left behind, so the correct option moves too: a student answering the
 * *original* key scores nothing here.
 */
test('a teacher edits and deletes questions, and students sit the edited paper', async ({
  signedIn: page,
  context,
}) => {
  await createTest(page, 'Geography');

  await addQuestion(page, 'single', 'Capital of France?', {
    options: [
      { text: 'Paris', correct: true },
      { text: 'Berlin', correct: false },
    ],
  });
  await addQuestion(page, 'short', 'Largest ocean?', { accepted: ['Pacific'] });
  await addQuestion(page, 'single', 'Question added by mistake');

  await expect(page.getByTestId('question-card-2')).toBeVisible();

  // Delete the last one. Positions close up behind it, so the two survivors
  // stay Q1 and Q2 rather than leaving a hole at Q3.
  await page.getByTestId('delete-question-2').click();
  await page.getByTestId('confirm-delete-2').click();
  await expect(page.getByTestId('question-card-2')).toHaveCount(0);
  await expect(page.getByText('Question added by mistake')).toHaveCount(0);

  await page.getByTestId('expand-question-0').click();
  await page.getByTestId('question-prompt').locator('.ProseMirror').fill('Capital of Germany?');
  await fillOptions(page, 'single', [
    { text: 'Paris', correct: false },
    { text: 'Berlin', correct: true },
  ]);
  await page.getByLabel('Marks').fill('3');
  await page.getByTestId('save-question').click();

  // Same slot, so the edit didn't quietly move the question to the end.
  await expect(page.getByTestId('question-card-0')).toContainText('Capital of Germany?');
  await expect(page.getByTestId('question-card-0')).toContainText('Q1');
  await expect(page.getByTestId('question-card-0')).toContainText('3 marks');

  // The type control is locked once a question exists — changing it would
  // strand the options, and the server refuses it anyway.
  await page.getByTestId('expand-question-0').click();
  await expect(page.getByTestId('question-kind')).toBeDisabled();
  await page.getByTestId('cancel-edit').click();

  const code = await publishAndReadCode(page);

  const studentContext = await context.browser()?.newContext();
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();
  await openStudent(student, code);

  // Two questions, not three, and the edited wording is what arrived.
  await expect(student.getByTestId('progress')).toContainText('0 of 2');
  await expect(student.getByText('Capital of Germany?')).toBeVisible();

  // Berlin is the key now. Answering Paris — right under the original — would
  // score zero, which is exactly what makes this worth asserting.
  await student.getByRole('radio').nth(1).check();
  await student.getByTestId('next').click();
  await answer(student, /^short-/, 'Pacific');

  await handIn(student);

  await page.getByRole('link', { name: 'Submissions' }).click();
  await page.getByRole('button', { name: 'Release results' }).click();
  await page.getByTestId('confirm-release').click();
  await expect(page.getByTestId('release-message')).toContainText('Released 1');

  // 3 for the edited question plus 1 for the untouched one: the new key and the
  // new mark allocation both took effect.
  await student.getByRole('button', { name: 'Check for results' }).click();
  await expect(student.getByTestId('result-score')).toHaveText('4 / 4');

  await studentContext.close();
});
