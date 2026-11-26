import { expect, test } from '@playwright/test';

test('presents the compact tray radiator', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 520 });
  await page.goto('/?scenario=radiator-mixed&reset=1#/tray');

  await expect(page.locator('.tray-shell')).toBeVisible();
  await expect(page.getByText('2 need attention')).toBeVisible();
  await expect(page.locator('.radiator-health-line')).toContainText('3 healthy');
  await expect(page.locator('.radiator-health-line')).toContainText('2 failed');
  await expect(page.locator('.radiator-failure')).toHaveCount(2);
  await expect(page.locator('.radiator-failure').first()).toContainText('CloudLink · CI');
  await expect(page.getByRole('button', { name: 'Open Barklarm' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quit' })).toBeVisible();

  const overflow = await page.evaluate(() => {
    const scroll = document.querySelector('.tray-scroll');
    return (
      document.documentElement.scrollWidth > window.innerWidth ||
      Boolean(scroll && scroll.scrollWidth > scroll.clientWidth)
    );
  });
  expect(overflow).toBe(false);
});

test('keeps failure detail and handoff inside the overlay', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 440 });
  await page.goto('/?scenario=radiator-mixed&reset=1#/tray/observer/mock-mixed-ci');

  await expect(page.getByRole('heading', { name: 'CloudLink · CI' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What happened' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Why it happened' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open full details' })).toBeVisible();

  await page.getByRole('button', { name: 'Preview prompt' }).click();
  await expect(page).toHaveURL(/#\/tray\/handoff\/mock-mixed-ci/);
  await expect(page.getByText('Hand off to a coding agent')).toBeVisible();
  await expect(page.locator('#handoff-preview')).toBeVisible();
  await expect(page.getByText('Includes AI interpretation')).toBeVisible();
});

test('keeps healthy and empty tray states compact and useful', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 240 });
  await page.goto('/?scenario=healthy&reset=1#/tray');

  await expect(page.getByText('All healthy')).toBeVisible();
  await expect(page.locator('.radiator-health-line')).toContainText('3 healthy');
  await expect(page.getByText('All monitored systems are healthy.')).toHaveCount(0);
  await expect(page.locator('.radiator-observer-row')).toHaveCount(3);

  await page.setViewportSize({ width: 380, height: 200 });
  await page.goto('/?scenario=empty&reset=1#/tray');
  await expect(page.getByText('No observers yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add observer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quit' })).toBeVisible();
});
