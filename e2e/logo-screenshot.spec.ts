import { test } from '@playwright/test';

test('capture logo states', async ({ page }) => {
  // Navigate to the SVG directly
  await page.goto('/logo/devbar-animated.svg');

  // Wait for SVG to load
  await page.waitForSelector('svg');

  // Screenshot 1: Closed state (no hover)
  await page.screenshot({
    path: 'e2e/screenshots/logo-closed.png',
    clip: { x: 0, y: 0, width: 600, height: 500 },
  });
  console.log('Captured closed state');

  // Screenshot 2: Open state (hover)
  // Hover over the SVG to trigger the animation
  await page.locator('svg').hover();

  // Wait for animation to complete (300ms transition + buffer)
  await page.waitForTimeout(500);

  // Take screenshot while hovering
  await page.screenshot({
    path: 'e2e/screenshots/logo-open.png',
    clip: { x: 0, y: 0, width: 600, height: 500 },
  });
  console.log('Captured open state (hover)');
});
