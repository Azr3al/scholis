import { addQuestion, handIn, publishAndReadCode } from './authoring';
import { expect, test } from './fixtures';

test('multi-answer rubric awards partial marks for one of two correct', async ({
  signedIn: page,
  context,
}) => {
  await page.getByLabel('Title').fill('Rubric quiz');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: 'Rubric quiz' }).click();

  await addQuestion(page, 'multi', 'Pick the gases', {
    options: [
      { text: 'Oxygen', correct: true },
      { text: 'Nitrogen', correct: true },
      { text: 'Gold', correct: false },
    ],
    points: '2',
  });

  await expect(page.getByTestId('choice-rubric')).toBeVisible();
  await page.getByTestId('rubric-points-1').fill('1');
  await page.getByTestId('save-question').click();

  const code = await publishAndReadCode(page);

  const studentContext = await context.browser()?.newContext();
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();

  await student.goto('/take');
  await student.getByLabel('Test code').fill(code);
  await student.getByLabel('Your name').fill('Partial Student');
  await student.getByRole('button', { name: 'Start' }).click();

  await student.getByRole('checkbox').nth(0).check();
  await handIn(student);

  await student.getByRole('button', { name: 'Check for results' }).click();
  await expect(student.getByTestId('result-score')).toHaveText('1 / 2');

  await studentContext.close();
});
