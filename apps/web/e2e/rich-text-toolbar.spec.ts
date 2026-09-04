import { createTest, selectQuestionKind } from './authoring';
import { expect, test } from './fixtures';

test('question prompt exposes rich text toolbar controls', async ({ signedIn: page }) => {
  await createTest(page, 'Rich text toolbar');

  await selectQuestionKind(page, 'essay');
  await page.getByTestId('quick-add-submit').click();
  await page.getByTestId('expand-question-0').click();
  await expect(page.getByTestId('question-prompt').getByLabel('Bold')).toBeVisible();
  await expect(page.getByTestId('question-prompt').getByLabel('Bullet list')).toBeVisible();
  await expect(page.getByTestId('question-prompt').getByLabel('Undo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Insert' })).toBeVisible();

  await page.getByTestId('cancel-edit').click();
  await selectQuestionKind(page, 'single');
  await page.getByTestId('quick-add-submit').click();
  await page.getByTestId('expand-question-1').click();
  const optionToolbar = page.getByTestId('option-body-0');
  await expect(optionToolbar.getByLabel('Bold')).toBeVisible();
  await expect(optionToolbar.getByLabel('Equation')).toBeVisible();
  await expect(optionToolbar.getByLabel('Bullet list')).toHaveCount(0);
});
