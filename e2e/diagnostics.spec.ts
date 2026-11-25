import { expect, test, type Page } from '@playwright/test';

const PERSISTENCE_KEY = 'barklarm.mock.v1.diagnostics-disabled';

async function expandFirstObserver(page: Page) {
  await page.locator('.observer-row-main').first().click();
}

test('persists the diagnostic collection setting', async ({ page }) => {
  await page.goto('/?scenario=diagnostics-disabled');
  await page.getByRole('button', { name: 'General' }).click();

  const toggle = page.getByRole('switch', { name: 'Diagnostic evidence' });
  await expect(toggle).not.toBeChecked();
  await toggle.check({ force: true });
  await expect(toggle).toBeChecked();

  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), PERSISTENCE_KEY))
    .toContain('"diagnosticsEnabled":true');

  await page.reload();
  await expect(page.getByRole('switch', { name: 'Diagnostic evidence' })).toBeChecked();
});

test('presents complete evidence with safe source links', async ({ page }) => {
  await page.goto('/?scenario=diagnostics-complete&reset=1');
  await expect(page.locator('.observer-item')).toHaveCount(2);

  await expandFirstObserver(page);
  const panel = page.getByRole('region', { name: 'Diagnostic evidence' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.diagnostics-status')).toHaveText('Complete');
  await expect(panel.getByText(/Workflow run 1001 attempt 1 failed/)).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Job: build' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Step: Run tests' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Error excerpt from build' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Open source/ }).first()).toBeVisible();
});

test('presents partial evidence and its limitations', async ({ page }) => {
  await page.goto('/?scenario=diagnostics-partial&reset=1');
  await expandFirstObserver(page);

  const panel = page.getByRole('region', { name: 'Diagnostic evidence' });
  await expect(panel.locator('.diagnostics-status')).toHaveText('Partial');
  await expect(panel.getByText('Some job logs could not be retrieved.')).toBeVisible();
  await expect(panel.getByText('Some evidence was truncated.')).toBeVisible();
  await expect(panel.getByText('Content truncated')).toBeVisible();
});

test('presents unavailable evidence without inventing a cause', async ({ page }) => {
  await page.goto('/?scenario=diagnostics-unavailable&reset=1');
  await expandFirstObserver(page);

  const panel = page.getByRole('region', { name: 'Diagnostic evidence' });
  await expect(panel.locator('.diagnostics-status')).toHaveText('Unavailable');
  await expect(panel.getByText('The workflow run was deleted or is inaccessible.')).toBeVisible();
  await expect(panel.getByText('No diagnostic evidence is available.')).toBeVisible();
});

test('shows collection in progress and then completes', async ({ page }) => {
  await page.goto('/?scenario=diagnostics-collecting&reset=1');
  await expandFirstObserver(page);

  const panel = page.getByRole('region', { name: 'Diagnostic evidence' });
  await expect(panel.getByText('Collecting diagnostic evidence…')).toBeVisible();
  await expect(panel.locator('.diagnostics-status')).toHaveText('Complete', { timeout: 15_000 });
});

test('recollects evidence on demand', async ({ page }) => {
  await page.goto('/?scenario=diagnostics-complete&reset=1');
  await expandFirstObserver(page);

  const panel = page.getByRole('region', { name: 'Diagnostic evidence' });
  await expect(panel.locator('.diagnostics-status')).toHaveText('Complete');
  await panel.getByRole('button', { name: /Collect again/ }).click();
  await expect(panel.getByText('Collecting diagnostic evidence…')).toBeVisible();
  await expect(panel.locator('.diagnostics-status')).toHaveText('Complete', { timeout: 15_000 });
});

test('explains unsupported integrations and disabled collection', async ({ page }) => {
  await page.goto('/?scenario=diagnostics-unsupported&reset=1');
  await expandFirstObserver(page);
  await expect(
    page
      .getByRole('region', { name: 'Diagnostic evidence' })
      .getByText('This integration does not provide diagnostic evidence.')
  ).toBeVisible();

  await page.goto('/?scenario=diagnostics-disabled&reset=1');
  await expandFirstObserver(page);
  const panel = page.getByRole('region', { name: 'Diagnostic evidence' });
  await expect(panel.getByText('Diagnostics are disabled. Enable them in General settings.')).toBeVisible();

  await page.getByRole('button', { name: 'General' }).click();
  await page.getByRole('switch', { name: 'Diagnostic evidence' }).check({ force: true });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('barklarm.mock.v1.diagnostics-disabled')))
    .toContain('"diagnosticsEnabled":true');

  await page.getByRole('button', { name: 'Observers' }).click();
  await expandFirstObserver(page);
  await expect(page.getByRole('region', { name: 'Diagnostic evidence' }).locator('.diagnostics-status')).toHaveText(
    'Complete'
  );
});

test('keeps evidence independent for simultaneous failures', async ({ page }) => {
  await page.goto('/?scenario=diagnostics-multiple&reset=1');
  await expect(page.locator('.status-pill.failure')).toHaveCount(2);

  await page.locator('.observer-row-main').nth(0).click();
  await expect(page.getByRole('region', { name: 'Diagnostic evidence' }).locator('.diagnostics-status')).toHaveText(
    'Complete'
  );
  await expect(
    page.getByRole('region', { name: 'Diagnostic evidence' }).getByRole('heading', { name: 'Job: build' })
  ).toBeVisible();

  await page.locator('.observer-row-main').nth(1).click();
  const second = page.getByRole('region', { name: 'Diagnostic evidence' });
  await expect(second.locator('.diagnostics-status')).toHaveText('Complete');
  await expect(second.getByRole('heading', { name: 'Job: web-build' })).toBeVisible();
});

test('never shows raw synthetic credentials in evidence', async ({ page }) => {
  await page.goto('/?scenario=diagnostics-secrets&reset=1');
  await expandFirstObserver(page);

  const panel = page.getByRole('region', { name: 'Diagnostic evidence' });
  await expect(panel.getByText('[REDACTED]', { exact: false })).toBeVisible();
  await expect(panel).not.toContainText('ghp_');
});
