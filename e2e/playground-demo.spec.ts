/**
 * Playground demo-only behavior.
 *
 * The public docs site cannot rely on a visitor's local Sweetlink daemon, so it
 * installs a simulated bridge that keeps daemon-backed affordances demonstrable.
 */

import { expect, test } from '@playwright/test';

test('playground simulates Sweetlink so daemon-only controls look live', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Simulated Sweetlink is active', { exact: false })).toBeVisible();
  await expect(page.getByText('Simulated Sweetlink', { exact: true })).toBeVisible();

  await expect(page.locator('[data-devbar="true"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI Design Review' })).toBeEnabled();

  const demoState = await page.evaluate(() => ({
    flag: (window as unknown as { __devbarSweetlinkDemo?: boolean }).__devbarSweetlinkDemo === true,
    htmlMode: document.documentElement.dataset.sweetlinkDemo,
  }));
  expect(demoState).toEqual({ flag: true, htmlMode: 'true' });
});

test('simulated toolbar actions explain that no local artifact was written', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Screenshot' }).click();

  await expect(page.getByText('Simulated action')).toBeVisible();
  await expect(page.getByText('Screenshot simulated')).toBeVisible();
  await expect(page.getByText('No image file was written', { exact: false })).toBeVisible();
});
