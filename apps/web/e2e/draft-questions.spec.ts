import { createTest } from './authoring';
import { expect, test } from './fixtures';

test('quick-add creates empty rows and publish stays blocked until complete', async ({
  signedIn: page,
}) => {
  await createTest(page, 'Draft drill');

  await page.getByTestId('quick-add-kind').click();
  await page.getByRole('option', { name: 'Short answer' }).click();
  await page.getByTestId('quick-add-count').fill('3');
  await page.getByTestId('quick-add-submit').click();

  await expect(page.getByTestId('question-card-0')).toBeVisible();
  await expect(page.getByTestId('question-card-1')).toBeVisible();
  await expect(page.getByTestId('question-card-2')).toBeVisible();
  await expect(page.getByTestId('question-incomplete')).toHaveCount(3);
  await expect(page.getByTestId('publish')).toBeDisabled();
  await expect(page.getByTestId('publish-blocked')).toContainText('3 questions incomplete');
});
