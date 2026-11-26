import { expect, test } from '@playwright/test';

const PERSISTENCE_KEY = 'barklarm.mock.v1.persistence';

test('persists an edited observer across a reload', async ({ page }) => {
  await page.goto('/?scenario=persistence');
  await page.getByRole('button', { name: 'Observers', exact: true }).click();
  await expect(page.locator('.observer-item')).toHaveCount(2);

  await page.locator('.observer-row-main').first().click();
  await page.getByLabel('Alias').fill('Renamed build');
  await expect(page.locator('.observer-name-text').first()).toHaveText('GitHub: Renamed build');

  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), PERSISTENCE_KEY))
    .toContain('Renamed build');

  await page.reload();
  await page.getByRole('button', { name: 'Observers', exact: true }).click();
  await expect(page.locator('.observer-name-text').first()).toHaveText('GitHub: Renamed build');
  await expect(page.locator('.observer-item')).toHaveCount(2);
});

test('persists general settings across a reload', async ({ page }) => {
  await page.goto('/?scenario=persistence');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();

  const sslSwitch = page.getByRole('switch', { name: 'Disable SSL verification' });
  await expect(sslSwitch).not.toBeChecked();
  await sslSwitch.locator('..').click();
  await expect(sslSwitch).toBeChecked();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), PERSISTENCE_KEY))
    .toContain('"sslDisabled":true');

  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Disable SSL verification' })).toBeChecked();
});

test('adds an observer by dropping a workflow link', async ({ page }) => {
  const url = 'https://github.com/alvarolorentedev/opencode-mobile/actions/workflows/release.yml';
  await page.goto('/?scenario=empty&reset=1');
  await page.getByRole('button', { name: 'Observers', exact: true }).click();

  await page.evaluate((droppedUrl) => {
    const box = document.querySelector('[data-testid="box"]');
    if (!box) throw new Error('Observers page not found');
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/uri-list', droppedUrl);
    box.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer }));
  }, url);

  await expect(page.locator('.dropzone')).toBeVisible();
  await page.evaluate((droppedUrl) => {
    const dropzone = document.querySelector('.dropzone');
    if (!dropzone) throw new Error('Drop zone not found');
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/uri-list', droppedUrl);
    dropzone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  }, url);

  await expect(page.locator('.observer-name-text')).toHaveText([
    'GitHub: alvarolorentedev/opencode-mobile/release.yml',
  ]);
});

test('adds a configured observer and restores it after reload', async ({ page }) => {
  await page.goto('/?scenario=empty');
  await page.getByRole('button', { name: 'Observers', exact: true }).click();
  await page.getByRole('button', { name: 'New observer' }).click();

  await page.getByLabel('Type').selectOption('githubAction');
  await page.getByLabel('Alias').fill('Added build');
  await expect(page.locator('.observer-name-text')).toHaveText(['GitHub: Added build']);

  await expect.poll(() => page.evaluate(() => localStorage.getItem('barklarm.mock.v1.empty'))).toContain('Added build');

  await page.reload();
  await page.getByRole('button', { name: 'Observers', exact: true }).click();
  await expect(page.locator('.observer-name-text')).toHaveText(['GitHub: Added build']);
  await expect(page.locator('.status-pill.success')).toHaveCount(1);
});
