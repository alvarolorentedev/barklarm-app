import { expect, test } from '@playwright/test';

test('starts in an empty scenario without runtime errors', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/?scenario=empty&reset=1');

  await expect(page.locator('.titlebar-title')).toHaveText('Barklarm');
  await expect(page.getByText('No observers yet')).toBeVisible();
  await expect(page.locator('.status-row', { hasText: 'Global' }).locator('.status-value')).toHaveText('Unavailable');
  await expect(page.locator('.status-row', { hasText: 'Observers' }).locator('.status-value')).toHaveText('0');
  expect(pageErrors).toEqual([]);
});

test('navigates between observers and general settings', async ({ page }) => {
  await page.goto('/?scenario=healthy&reset=1');
  await expect(page.getByPlaceholder('Search observers')).toBeVisible();

  await page.getByRole('button', { name: 'General' }).click();
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();
  await expect(page.getByLabel('Refresh interval')).toBeVisible();

  await page.getByRole('button', { name: 'Observers' }).click();
  await expect(page.getByText('No observers match your search.')).toBeHidden();
  await expect(page.locator('.observer-item')).toHaveCount(3);
});
