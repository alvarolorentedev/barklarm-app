import { expect, test } from '@playwright/test';

const PERSISTENCE_KEY = 'barklarm.mock.v1.persistence';

test('persists an edited observer across a reload', async ({ page }) => {
  await page.goto('/?scenario=persistence');
  await expect(page.locator('.observer-item')).toHaveCount(2);

  await page.locator('.observer-row-main').first().click();
  await page.getByLabel('Alias').fill('Renamed build');
  await expect(page.locator('.observer-name-text').first()).toHaveText('Github: Renamed build');

  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), PERSISTENCE_KEY))
    .toContain('Renamed build');

  await page.reload();
  await expect(page.locator('.observer-name-text').first()).toHaveText('Github: Renamed build');
  await expect(page.locator('.observer-item')).toHaveCount(2);
});

test('persists general settings across a reload', async ({ page }) => {
  await page.goto('/?scenario=persistence');
  await page.getByRole('button', { name: 'General' }).click();

  const sslSwitch = page.getByRole('switch', { name: 'Disable SSL verification' });
  await expect(sslSwitch).not.toBeChecked();
  await sslSwitch.check({ force: true });
  await expect(sslSwitch).toBeChecked();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), PERSISTENCE_KEY))
    .toContain('"sslDisabled":true');

  await page.reload();
  await expect(page.getByRole('switch', { name: 'Disable SSL verification' })).toBeChecked();
});

test('adds a configured observer and restores it after reload', async ({ page }) => {
  await page.goto('/?scenario=empty');
  await page.getByRole('button', { name: 'New observer' }).click();

  await page.getByLabel('Type').selectOption('githubAction');
  await page.getByLabel('Alias').fill('Added build');
  await expect(page.locator('.observer-name-text')).toHaveText(['Github: Added build']);

  await expect.poll(() => page.evaluate(() => localStorage.getItem('barklarm.mock.v1.empty'))).toContain('Added build');

  await page.reload();
  await expect(page.locator('.observer-name-text')).toHaveText(['Github: Added build']);
  await expect(page.locator('.status-pill.success')).toHaveCount(1);
});
