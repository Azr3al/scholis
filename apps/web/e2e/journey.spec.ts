import { addQuestion, answer, handIn } from './authoring';
import { expect, test } from './fixtures';

// The whole product in one pass. One test rather than several, because each
// step needs the previous one's state and splitting them would mean rebuilding
// it every time.
test('teacher builds a mixed test, student sits it, teacher marks and releases', async ({
  signedIn: page,
  context,
}) => {
  // --- teacher: author one of each type -------------------------------------
  await page.getByLabel('Title').fill('Photosynthesis');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: 'Photosynthesis' }).click();
  await expect(page.getByTestId('test-status')).toHaveText('draft');

  await addQuestion(page, 'single', 'What do plants need to make food?', {
    options: [
      { text: 'Sunlight', correct: true },
      { text: 'Moonlight', correct: false },
    ],
  });
  await addQuestion(page, 'multi', 'Which are gases?', {
    options: [
      { text: 'Oxygen', correct: true },
      { text: 'Carbon dioxide', correct: true },
      { text: 'Water', correct: false },
    ],
    points: '2',
  });
  await addQuestion(page, 'essay', 'Explain photosynthesis in your own words.', {
    points: '5',
  });

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByTestId('test-status')).toHaveText('published');

  const code = (await page.getByText(/^Code /).innerText()).replace('Code ', '').trim();
  expect(code).not.toBe('');

  // --- student: sit it ------------------------------------------------------
  const studentContext = await context.browser()?.newContext();
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();

  await student.goto('/take');
  await student.getByLabel('Test code').fill(code);
  await student.getByLabel('Your name').fill('Ada Lovelace');
  await student.getByRole('button', { name: 'Start' }).click();

  await expect(student.getByText('Photosynthesis')).toBeVisible();
  await expect(student.getByTestId('progress')).toContainText('0 of 3');

  // Q1 single choice
  await student.getByRole('radio').first().check();
  await student.getByTestId('next').click();

  // Q2 multiple choice — both correct boxes
  await student.getByRole('checkbox').nth(0).check();
  await student.getByRole('checkbox').nth(1).check();
  await student.getByTestId('next').click();

  // Q3 essay
  await answer(student, /^essay-/, 'Plants turn light into sugar.');
  await expect(student.getByTestId('progress')).toContainText('3 of 3');

  await handIn(student);

  // Nothing released, and the essay is unmarked.
  await student.getByRole('button', { name: 'Check for results' }).click();
  await expect(student.getByTestId('not-released')).toBeVisible();

  // --- teacher: release is gated until the essay is marked ------------------
  await page.getByRole('link', { name: 'Submissions' }).click();
  await expect(page.getByText('Ada Lovelace')).toBeVisible();
  await expect(page.getByTestId('grading-status')).toContainText('1 awaiting marking');

  await page.getByRole('button', { name: 'Release results' }).click();
  await page.getByTestId('confirm-release').click();
  await expect(page.getByTestId('release-message')).toContainText('Released 0');

  // --- teacher: mark the essay ----------------------------------------------
  await page.getByTestId('mark-Ada Lovelace').click();

  // The whole point of the marking panel. This used to read "Written answer",
  // which asked a teacher to score prose they couldn't see.
  await expect(page.getByTestId('marking-answer')).toContainText('Plants turn light into sugar.');

  const scoreBox = page.locator('[data-testid^="score-"]');
  const feedbackBox = page.locator('[data-testid^="feedback-"]');
  await feedbackBox.fill('Good, but say where the energy goes.');
  await scoreBox.fill('4');
  await page.locator('[data-testid^="save-mark-"]').click();

  await expect(page.getByTestId('grading-status')).toContainText('0 awaiting marking');

  // Reopening has to show the feedback that was saved. It used to come back
  // blank, so adjusting a score silently wiped the comment.
  await page.getByTestId('mark-Ada Lovelace').click();
  await page.getByTestId('mark-Ada Lovelace').click();
  await expect(page.locator('[data-testid^="feedback-"]')).toHaveValue(
    'Good, but say where the energy goes.',
  );

  await page.getByRole('button', { name: 'Release results' }).click();
  await page.getByTestId('confirm-release').click();
  await expect(page.getByTestId('release-message')).toContainText('Released 1');

  // --- student: score and feedback ------------------------------------------
  await student.getByRole('button', { name: 'Check for results' }).click();
  // 1 (single) + 2 (multi) + 4 (essay) out of 1 + 2 + 5
  await expect(student.getByTestId('result-score')).toHaveText('7 / 8');
  await expect(student.getByText('Good, but say where the energy goes.')).toBeVisible();

  await studentContext.close();
});
