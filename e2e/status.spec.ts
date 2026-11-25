import { expect, test, type Page } from '@playwright/test';

const globalStatus = (page: Page) => page.locator('.status-row', { hasText: 'Global' }).locator('.status-value');

test('presents failed, running and unavailable observers', async ({ page }) => {
  await page.goto('/?scenario=failed-builds&reset=1');
  await expect(page.locator('.observer-item')).toHaveCount(2);
  await expect(page.locator('.status-pill.failure')).toHaveCount(1);
  await expect(globalStatus(page)).toHaveText('Failed');

  await page.goto('/?scenario=running-builds&reset=1');
  await expect(page.locator('.status-pill.checking')).toHaveCount(2);
  await expect(globalStatus(page)).toHaveText('Checking');

  await page.goto('/?scenario=unavailable&reset=1');
  await expect(page.locator('.status-pill.idle')).toHaveCount(2);
  await expect(globalStatus(page)).toHaveText('Unavailable');
});

test('shows every simultaneous failure', async ({ page }) => {
  await page.goto('/?scenario=multiple-failures&reset=1');

  await expect(page.locator('.status-pill.failure')).toHaveCount(3);
  await expect(globalStatus(page)).toHaveText('Failed');
  await expect(page.locator('.observer-name-text')).toHaveText([
    'Github: API build',
    'Sentry: API errors',
    'CCTray: Nightly release',
  ]);
});
