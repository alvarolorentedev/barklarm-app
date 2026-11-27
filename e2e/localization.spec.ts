import { expect, test } from '@playwright/test';

test.use({ locale: 'es-ES' });

test('keeps the radiator and settings usable in Spanish', async ({ page }) => {
  await page.goto('/?scenario=radiator-mixed&reset=1#/radiator');

  await expect(page.getByRole('heading', { name: 'Radiador' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Radiador', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajustes', exact: true })).toBeVisible();
  await expect(page.locator('.radiator-summary')).toContainText('Saludable');
  await expect(page.locator('.radiator-observer-row').first()).toContainText('CloudLink · CI');
  await expect(page.locator('.radiator-observer-row').first()).toContainText('Fallo');

  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Monitorización' })).toBeVisible();

  await page.goto('/?window=tray&scenario=empty&reset=1#/tray');
  await expect(page.getByText('Aún no hay observadores')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Añadir observador' })).toBeVisible();
});
