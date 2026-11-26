import { expect, test } from '@playwright/test';

test('starts in an empty scenario without runtime errors', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/?scenario=empty&reset=1');

  await expect(page.locator('.titlebar-title')).toHaveText('Barklarm');
  await expect(page.getByRole('heading', { name: 'Radiator' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add your first observer' })).toBeVisible();
  await expect(page.locator('.status-row', { hasText: 'Global' }).locator('.status-value')).toHaveText('Unavailable');
  await expect(page.locator('.status-row', { hasText: 'Observers' }).locator('.status-value')).toHaveText('0');
  expect(pageErrors).toEqual([]);
});

test('navigates between radiator, observers and settings', async ({ page }) => {
  await page.goto('/?scenario=healthy&reset=1');
  await expect(page.getByRole('heading', { name: 'Radiator' })).toBeVisible();
  await expect(page.locator('.radiator-summary')).toContainText('3');
  await expect(page.locator('.radiator-summary')).toContainText('Healthy');
  await expect(page.locator('.radiator-observer-row')).toHaveCount(3);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByLabel('Refresh interval')).toBeVisible();

  await page.getByRole('button', { name: 'Observers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Observers' })).toBeVisible();
  await expect(page.getByText('No observers match your search.')).toBeHidden();
  await expect(page.locator('.observer-item')).toHaveCount(3);
});
