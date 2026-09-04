import { addQuestion, createTest, openSectionsPane, selectQuestionSection } from './authoring';
import { expect, test } from './fixtures';

/**
 * The editing surface itself: the outline on the left, the one thing you're
 * editing on the right, and whether the paper's order survives being grouped
 * and dragged about.
 */

test('the outline lists every question and the editor shows one', async ({ signedIn: page }) => {
  await createTest(page, 'Two pane drill');
  await addQuestion(page, 'short', 'First question', { accepted: ['a'] });
  await addQuestion(page, 'short', 'Second question', { accepted: ['b'] });

  // Both questions are always in the outline — that is the point of it.
  await expect(page.getByTestId('question-card-0')).toBeVisible();
  await expect(page.getByTestId('question-card-1')).toBeVisible();
  await expect(page.getByTestId('expand-question-0')).toContainText('First question');
  await expect(page.getByTestId('expand-question-0')).toContainText('Q1');
  await expect(page.getByTestId('expand-question-1')).toContainText('Second question');

  // Only one editor, and it holds the question that was picked.
  await page.getByTestId('expand-question-0').click();
  const editing = page.getByTestId('question-prompt').locator('.ProseMirror');
  await expect(page.getByTestId('question-prompt')).toHaveCount(1);
  await expect(editing).toContainText('First question');

  // The cursor is already in the question text, so a teacher who clicked a row
  // to fix a typo can just start typing.
  await expect(editing).toBeFocused();

  // Picking the other one swaps the editor rather than opening a second.
  await page.getByTestId('expand-question-1').click();
  await expect(page.getByTestId('question-prompt')).toHaveCount(1);
  await expect(page.getByTestId('question-prompt').locator('.ProseMirror')).toContainText(
    'Second question',
  );
});

test('cancel puts back what was saved', async ({ signedIn: page }) => {
  await createTest(page, 'Cancel drill');
  await addQuestion(page, 'short', 'Original wording', { accepted: ['a'] });

  await page.getByTestId('expand-question-0').click();
  const editing = page.getByTestId('question-prompt').locator('.ProseMirror');
  await editing.fill('Something I did not mean to type');

  await page.getByTestId('cancel-edit').click();

  // The saved wording is back, in the editor and in the outline.
  await expect(page.getByTestId('question-prompt').locator('.ProseMirror')).toContainText(
    'Original wording',
  );
  await expect(page.getByTestId('expand-question-0')).toContainText('Original wording');
});

test('a new section is named without an extra click', async ({ signedIn: page }) => {
  await createTest(page, 'Autofocus drill');

  await openSectionsPane(page);
  await page.getByTestId('add-section').click();

  const title = page.getByTestId('section-title-0');
  await expect(title).toBeFocused();

  // The placeholder name is selected, so typing replaces it rather than
  // appending to it. Typing without clearing anything is the assertion.
  await page.keyboard.type('Part A');
  await expect(title).toHaveValue('Part A');
});

test('questions group under their sections and reorder within them', async ({ signedIn: page }) => {
  await createTest(page, 'Grouping drill');
  await addQuestion(page, 'short', 'Alpha', { accepted: ['a'] });
  await addQuestion(page, 'short', 'Beta', { accepted: ['b'] });
  await addQuestion(page, 'short', 'Gamma', { accepted: ['c'] });

  // Named with fill rather than keystrokes: focus is asserted by its own test
  // above, and racing the autofocus effect here would only make this one flaky.
  await openSectionsPane(page);
  await page.getByTestId('add-section').click();
  await page.getByTestId('section-title-0').fill('Part One');
  await page.getByTestId('section-title-0').blur();

  await page.getByTestId('add-section').click();
  await page.getByTestId('section-title-1').fill('Part Two');
  await page.getByTestId('section-title-1').blur();

  // Alpha and Beta into Part One, Gamma into Part Two.
  await selectQuestionSection(page, 0, 'Part One');
  await selectQuestionSection(page, 1, 'Part One');
  await selectQuestionSection(page, 2, 'Part Two');

  const list = page.getByTestId('question-list');
  // Headings appear in section order, with their questions beneath them.
  await expect(list).toContainText('Part One');
  await expect(list).toContainText('Part Two');

  // Numbering is paper-wide, not per-section: sections are labels over one
  // ordered list, so Gamma is Q3 whichever heading it sits under.
  await expect(page.getByTestId('expand-question-2')).toContainText('Q3');
  await expect(page.getByTestId('expand-question-2')).toContainText('Gamma');

  // Moving within a section: Beta above Alpha.
  await page.getByTestId('move-up-1').click();
  await expect(page.getByTestId('expand-question-0')).toContainText('Beta');
  await expect(page.getByTestId('expand-question-1')).toContainText('Alpha');

  // The first question of a section cannot move up out of it.
  await expect(page.getByTestId('move-up-0')).toBeDisabled();
  // Nor can the only question of the last section move down.
  await expect(page.getByTestId('move-down-2')).toBeDisabled();

  // The move is applied optimistically and the buttons are disabled while the
  // request is in flight, so waiting for them to come back is what says the
  // server has answered. Reloading before that would race it.
  await expect(page.getByTestId('move-down-0')).toBeEnabled();

  // It survives a reload, which is what proves the order was actually saved
  // rather than only rearranged on screen.
  await page.reload();
  await expect(page.getByTestId('expand-question-0')).toContainText('Beta');
  await expect(page.getByTestId('expand-question-2')).toContainText('Gamma');
});

test('a question with no section still has a home', async ({ signedIn: page }) => {
  await createTest(page, 'Mixed drill');
  await addQuestion(page, 'short', 'Grouped', { accepted: ['a'] });
  await addQuestion(page, 'short', 'Loose', { accepted: ['b'] });

  await openSectionsPane(page);
  await page.getByTestId('add-section').click();
  await page.getByTestId('section-title-0').fill('Part One');
  await page.getByTestId('section-title-0').blur();

  await selectQuestionSection(page, 0, 'Part One');

  // Sections are optional, so a paper that half-uses them still reads sensibly
  // rather than hiding the ungrouped questions.
  await expect(page.getByTestId('question-list')).toContainText('No section');
  await expect(page.getByTestId('expand-question-1')).toContainText('Loose');
});
