import { createTest } from './authoring';
import { expect, test } from './fixtures';

test('create tag on home, assign in editor, filter and search', async ({ signedIn: page }) => {
  await createTest(page, 'Tagged exam', { stayOnHome: true });

  await page.getByTestId('tag-create-open').click();
  await page.getByTestId('tag-create-input').fill('Science');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('button', { name: 'Science' })).toBeVisible();

  await page.getByRole('link', { name: 'Tagged exam' }).click();
  await page.getByTestId('add-tag-trigger').click();
  await page.getByTestId(/^test-tag-/).filter({ hasText: 'Science' }).click();
  await expect(page.getByText('Saving tags…')).toHaveCount(0);
  await expect(page.getByText('Science')).toBeVisible();

  await page.getByRole('link', { name: '← All tests' }).click();
  await expect(page.getByTestId('tag-filter-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('test-group-untagged')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Tagged exam' })).toBeVisible();

  await page.getByRole('button', { name: 'Science' }).click();
  await expect(page.getByTestId('tag-filter-all')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('link', { name: 'Tagged exam' })).toBeVisible();

  await page.getByTestId('test-search').fill('no-match');
  await expect(page.getByTestId('no-search-results')).toBeVisible();
});

test('multi-tag OR filter shows union', async ({ signedIn: page }) => {
  await createTest(page, 'Exam A', { stayOnHome: true });
  await createTest(page, 'Exam B', { stayOnHome: true });

  const createTag = async (name: string) => {
    await page.getByTestId('tag-create-open').click();
    await page.getByTestId('tag-create-input').fill(name);
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByRole('button', { name: name })).toBeVisible();
  };

  await createTag('Alpha');
  await createTag('Beta');

  await page.getByRole('link', { name: 'Exam A' }).click();
  await page.getByTestId('add-tag-trigger').click();
  await page.getByTestId(/^test-tag-/).filter({ hasText: 'Alpha' }).click();
  await page.getByRole('link', { name: '← All tests' }).click();

  await page.getByRole('link', { name: 'Exam B' }).click();
  await page.getByTestId('add-tag-trigger').click();
  await page.getByTestId(/^test-tag-/).filter({ hasText: 'Beta' }).click();
  await page.getByRole('link', { name: '← All tests' }).click();

  await page.getByRole('button', { name: 'Alpha' }).click();
  await page.getByRole('button', { name: 'Beta' }).click();

  await expect(page.getByRole('link', { name: 'Exam A' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Exam B' })).toBeVisible();
});

test('manage tags page renames and deletes tags', async ({ signedIn: page }) => {
  await createTest(page, 'Keep me', { stayOnHome: true });

  await page.getByTestId('manage-tags-link').click();
  await expect(page).toHaveURL(/\/teacher\/tags$/);

  await page.getByTestId('manage-tag-create-open').click();
  await page.getByTestId('manage-tag-create-input').fill('Disposable');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Disposable')).toBeVisible();

  await page.getByRole('link', { name: '← All tests' }).click();

  await page.getByRole('link', { name: 'Keep me' }).click();
  await page.getByTestId('add-tag-trigger').click();
  await page.getByTestId(/^test-tag-/).filter({ hasText: 'Disposable' }).click();
  await page.getByRole('link', { name: '← All tests' }).click();

  await page.getByTestId('manage-tags-link').click();
  await expect(page).toHaveURL(/\/teacher\/tags$/);
  await expect(page.getByRole('heading', { name: 'Manage tags' })).toBeVisible();

  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByTestId(/^manage-tag-rename-input-/).fill('Renamed tag');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Renamed tag')).toBeVisible();

  await page.getByRole('link', { name: '← All tests' }).click();
  await expect(page.getByRole('button', { name: 'Renamed tag' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disposable' })).toHaveCount(0);

  await page.getByTestId('manage-tags-link').click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('manage-tag-delete-confirm').click();

  await page.getByRole('link', { name: '← All tests' }).click();
  await expect(page.getByRole('button', { name: 'Renamed tag' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Keep me' })).toBeVisible();
});

test('editor dropdown links to manage tags page', async ({ signedIn: page }) => {
  await createTest(page, 'Dropdown test', { stayOnHome: false });

  await page.getByTestId('add-tag-trigger').click();
  await page.getByTestId('manage-tags-dropdown-link').click();
  await expect(page).toHaveURL(/\/teacher\/tags$/);
});
