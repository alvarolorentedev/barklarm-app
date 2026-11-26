import { expect, test, type Page } from '@playwright/test';

async function expandFirstObserver(page: Page) {
  await page.getByRole('button', { name: 'Observers', exact: true }).click();
  await page.locator('.observer-row-main').first().click();
}

test('presents a validated AI diagnosis next to the evidence', async ({ page }) => {
  await page.goto('/?scenario=intelligence-complete&reset=1');
  await expandFirstObserver(page);

  const panel = page.getByRole('region', { name: 'AI analysis' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.analysis-status')).toHaveText('Analysis available');
  await expect(panel.getByText(/The build failed while installing dependencies/)).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Observed findings' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Likely causes' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Recommended next steps' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Show evidence error:2001:0/ }).first()).toBeVisible();
});

test('keeps the analysis section disabled with intelligence off', async ({ page }) => {
  await page.goto('/?scenario=intelligence-disabled&reset=1');
  await expandFirstObserver(page);
  const panel = page.getByRole('region', { name: 'AI analysis' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.analysis-status')).toHaveText('Intelligence is disabled.');
});

test('shows analysis progress and then the diagnosis', async ({ page }) => {
  await page.goto('/?scenario=intelligence-analyzing&reset=1');
  await expandFirstObserver(page);
  const panel = page.getByRole('region', { name: 'AI analysis' });
  await expect(panel.locator('.analysis-status')).toHaveText('Analyzing evidence…');
  await expect(panel.locator('.analysis-status')).toHaveText('Analysis available', { timeout: 15_000 });
});

test('shows insufficient evidence without inventing a diagnosis', async ({ page }) => {
  await page.goto('/?scenario=intelligence-insufficient&reset=1');
  await expandFirstObserver(page);
  const panel = page.getByRole('region', { name: 'AI analysis' });
  await expect(panel.locator('.analysis-status')).toHaveText('Not enough evidence for a diagnosis.');
  await expect(panel.getByText('The source did not return enough usable evidence.')).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Likely causes' })).toHaveCount(0);
});

test('shows the model download, progress and cancellation', async ({ page }) => {
  await page.goto('/?scenario=intelligence-downloading&reset=1');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();

  const group = page.getByRole('region', { name: 'Intelligence' });
  await expect(group.getByText('Qwen3 1.7B Instruct (Q4_K_M)')).toBeVisible();
  await expect(group.getByRole('button', { name: 'Cancel download' })).toBeVisible();
  await expect(group.getByText(/Downloading model…/)).toBeVisible();
  await group.getByRole('button', { name: 'Cancel download' }).click();
  await expect(group.getByRole('button', { name: 'Download model' })).toBeVisible();
});

test('requires explicit remote-destination consent', async ({ page }) => {
  await page.goto('/?scenario=intelligence-remote-consent&reset=1');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();

  const group = page.getByRole('region', { name: 'Intelligence' });
  await expect(group.getByText('https://inference.example.test/v1')).toBeVisible();
  await expect(group.getByText(/requires explicit consent/)).toBeVisible();
  await group.getByRole('button', { name: 'Approve destination' }).click();
  await expect(group.getByText('Destination approved for this model.')).toBeVisible();
});

test('explains unsupported managed hardware and keeps monitoring usable', async ({ page }) => {
  await page.goto('/?scenario=intelligence-unsupported-hardware&reset=1');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();

  const group = page.getByRole('region', { name: 'Intelligence' });
  await expect(group.getByText(/Managed inference is unavailable on this computer/)).toBeVisible();

  await page.getByRole('button', { name: 'Observers', exact: true }).click();
  await expandFirstObserver(page);
  await expect(
    page
      .getByRole('region', { name: 'AI analysis' })
      .getByText('This computer does not meet the managed runtime requirements.')
  ).toBeVisible();
});
