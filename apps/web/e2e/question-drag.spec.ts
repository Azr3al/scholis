import { addQuestion, createTest, openSectionsPane, selectQuestionSection } from './authoring';
import { expect, test } from './fixtures';

/**
 * Reordering by dragging in the outline.
 *
 * Dropping onto the middle of a row puts the dragged question *above* it, which
 * is what Playwright's centre-of-element target produces — so every drag here
 * reads as "put this one above that one".
 *
 * The arrows are covered in teacher-ux.spec.ts and remain the keyboard route;
 * these tests are about the mouse gesture and, more importantly, about the
 * order surviving a reload.
 */

test('a question is dragged above another and stays there', async ({ signedIn: page }) => {
  await createTest(page, 'Drag drill');
  await addQuestion(page, 'short', 'Alpha', { accepted: ['a'] });
  await addQuestion(page, 'short', 'Beta', { accepted: ['b'] });
  await addQuestion(page, 'short', 'Gamma', { accepted: ['c'] });

  await expect(page.getByTestId('expand-question-0')).toContainText('Alpha');
  await expect(page.getByTestId('expand-question-2')).toContainText('Gamma');

  // Last to first.
  await page.getByTestId('question-card-2').dragTo(page.getByTestId('question-card-0'));

  await expect(page.getByTestId('expand-question-0')).toContainText('Gamma');
  await expect(page.getByTestId('expand-question-1')).toContainText('Alpha');
  await expect(page.getByTestId('expand-question-2')).toContainText('Beta');

  // Numbering follows the paper, not the original creation order.
  await expect(page.getByTestId('expand-question-0')).toContainText('Q1');

  await page.reload();
  await expect(page.getByTestId('expand-question-0')).toContainText('Gamma');
  await expect(page.getByTestId('expand-question-2')).toContainText('Beta');
});

test('dragging into another section moves the question between them', async ({
  signedIn: page,
}) => {
  await createTest(page, 'Cross section drag');
  await addQuestion(page, 'short', 'Alpha', { accepted: ['a'] });
  await addQuestion(page, 'short', 'Beta', { accepted: ['b'] });

  await openSectionsPane(page);
  await page.getByTestId('add-section').click();
  await page.getByTestId('section-title-0').fill('Part One');
  await page.getByTestId('section-title-0').blur();

  await page.getByTestId('add-section').click();
  await page.getByTestId('section-title-1').fill('Part Two');
  await page.getByTestId('section-title-1').blur();

  // Both start in Part One, leaving Part Two empty.
  await selectQuestionSection(page, 0, 'Part One');
  await selectQuestionSection(page, 1, 'Part One');

  // An empty section still offers somewhere to drop — without it there would be
  // no way to put the first question into a section by dragging at all.
  const emptySection = page.getByTestId('section-dropzone-1');
  await expect(emptySection).toBeVisible();

  await page.getByTestId('question-card-1').dragTo(emptySection);

  // The dropzone is gone because the section has a question now.
  await expect(page.getByTestId('section-dropzone-1')).toHaveCount(0);

  // And the question reports its new section, which is the thing a reorder
  // alone would not have changed.
  await page.getByTestId('expand-question-1').click();
  await expect(page.getByTestId('question-section-1')).toContainText('Part Two');

  await page.reload();
  await page.getByTestId('expand-question-1').click();
  await expect(page.getByTestId('question-section-1')).toContainText('Part Two');
});

test('dragging a question out of every section leaves it unsectioned', async ({
  signedIn: page,
}) => {
  await createTest(page, 'Drag out drill');
  await addQuestion(page, 'short', 'Grouped', { accepted: ['a'] });
  await addQuestion(page, 'short', 'Loose', { accepted: ['b'] });

  await openSectionsPane(page);
  await page.getByTestId('add-section').click();
  await page.getByTestId('section-title-0').fill('Part One');
  await page.getByTestId('section-title-0').blur();

  await selectQuestionSection(page, 0, 'Part One');
  await expect(page.getByTestId('question-list')).toContainText('No section');

  // Onto the unsectioned question, which is under the "No section" heading.
  await page.getByTestId('question-card-0').dragTo(page.getByTestId('question-card-1'));

  await page.getByTestId('expand-question-0').click();
  await expect(page.getByTestId('question-section-0')).toContainText('No section');

  await page.reload();
  await expect(page.getByTestId('question-list')).toContainText('No section');
});
