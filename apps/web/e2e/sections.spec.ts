import {
  addQuestion,
  answer,
  createTest,
  handIn,
  openSectionsPane,
  publishAndReadCode,
  selectQuestionSection,
} from './authoring';
import { expect, test } from './fixtures';

/**
 * Sections are headings over the existing flat question list.
 *
 * The point of this test is as much what does *not* change as what does:
 * numbering, navigation and progress all behave exactly as they did, because a
 * section is a label on a question rather than a container that owns it.
 */
test('a teacher groups questions under a heading, and the student sees it', async ({
  signedIn: page,
  context,
}) => {
  await createTest(page, 'Biology paper');
  await addQuestion(page, 'single', 'What do plants need?', {
    options: [
      { text: 'Sunlight', correct: true },
      { text: 'Moonlight', correct: false },
    ],
  });
  await addQuestion(page, 'short', 'Largest ocean?', { accepted: ['Pacific'] });

  // Create a section and put the first question in it.
  await openSectionsPane(page);
  await page.getByTestId('add-section').click();
  await expect(page.getByTestId('section-title-0')).toBeVisible();
  await page.getByTestId('section-title-0').fill('Part A — Photosynthesis');
  await page.getByTestId('section-title-0').blur();

  await selectQuestionSection(page, 0, 'Part A — Photosynthesis');

  const code = await publishAndReadCode(page);

  const studentContext = await context.browser()?.newContext();
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();

  await student.goto('/take');
  await student.getByLabel('Test code').fill(code);
  await student.getByLabel('Your name').fill('Ada Lovelace');
  await student.getByRole('button', { name: 'Start' }).click();

  // Question one carries the heading.
  await expect(student.getByTestId('section-heading')).toContainText('Part A — Photosynthesis');
  // Numbering is untouched: still one flat list.
  await expect(student.getByTestId('position')).toContainText('1 of 2');

  await student.getByRole('radio').first().check();
  await student.getByTestId('next').click();

  // Question two has no section, so no heading — and nothing else shifted.
  await expect(student.getByTestId('section-heading')).toHaveCount(0);
  await expect(student.getByTestId('position')).toContainText('2 of 2');

  await answer(student, /^short-/, 'Pacific');
  await handIn(student);

  await studentContext.close();
});

test('deleting a section keeps its questions', async ({ signedIn: page }) => {
  await createTest(page, 'Deletion drill');
  await addQuestion(page, 'single', 'Only question');

  await openSectionsPane(page);
  await page.getByTestId('add-section').click();
  await page.getByTestId('section-title-0').fill('Doomed');
  await page.getByTestId('section-title-0').blur();
  await selectQuestionSection(page, 0, 'Doomed');

  await openSectionsPane(page);
  await page.getByTestId('section-delete-0').click();

  // The heading is gone; the paper is not.
  await expect(page.getByTestId('section-title-0')).toHaveCount(0);
  await expect(page.getByTestId('question-card-0')).toBeVisible();
  await expect(page.getByText('Only question')).toBeVisible();
});

test('section picker assigns unassigned questions and syncs row dropdowns', async ({
  signedIn: page,
}) => {
  await createTest(page, 'Section picker drill');
  await addQuestion(page, 'single', 'First question', {
    options: [
      { text: 'Yes', correct: true },
      { text: 'No', correct: false },
    ],
  });
  await addQuestion(page, 'short', 'Second question', { accepted: ['Answer'] });

  await openSectionsPane(page);
  await page.getByTestId('add-section').click();
  await page.getByTestId('section-title-0').fill('Part One');
  await page.getByTestId('section-title-0').blur();

  await openSectionsPane(page);

  await page.getByTestId('section-add-questions-0').click();
  await expect(page.getByTestId('section-question-picker-0')).toBeVisible();
  await page.getByTestId('section-picker-question-0').check();
  await page.getByTestId('section-picker-question-1').check();
  await page.getByTestId('section-add-selected-0').click();

  await expect(page.getByTestId('section-questions-0')).toContainText('Q1');
  await expect(page.getByTestId('section-questions-0')).toContainText('Q2');
  await expect(page.getByTestId('question-list')).not.toContainText('No section');

  // The row dropdowns agree with the picker. Checked one at a time, because the
  // editor shows a single question now rather than the whole paper at once.
  await page.getByTestId('expand-question-0').click();
  await expect(page.getByTestId('question-section-0')).toContainText('Part One');
  await page.getByTestId('expand-question-1').click();
  await expect(page.getByTestId('question-section-1')).toContainText('Part One');
});

test('section picker shows empty state when all questions are assigned', async ({
  signedIn: page,
}) => {
  await createTest(page, 'All assigned');
  await addQuestion(page, 'single', 'Solo question', {
    options: [
      { text: 'A', correct: true },
      { text: 'B', correct: false },
    ],
  });

  await openSectionsPane(page);
  await page.getByTestId('add-section').click();
  await page.getByTestId('section-title-0').fill('Only section');
  await page.getByTestId('section-title-0').blur();
  await selectQuestionSection(page, 0, 'Only section');

  await openSectionsPane(page);

  await page.getByTestId('section-add-questions-0').click();
  await expect(page.getByTestId('section-question-picker-0')).toContainText(
    'No unassigned questions',
  );
  await expect(page.getByTestId('section-add-selected-0')).toHaveCount(0);
});
