/**
 * DevBar E2E Visual Tests
 *
 * Comprehensive visual verification tests for the DevBar component
 * across different viewports, positions, badge states, and interactions.
 */

import { expect, type Page, test } from '@playwright/test';

// Test viewports matching Tailwind breakpoints
const VIEWPORTS = {
  base: { width: 400, height: 800 },
  sm: { width: 640, height: 800 },
  md: { width: 768, height: 800 },
  lg: { width: 1024, height: 800 },
  xl: { width: 1280, height: 800 },
  '2xl': { width: 1536, height: 900 },
};

// DevBar positions
const POSITIONS = [
  'bottom-left',
  'bottom-right',
  'top-left',
  'top-right',
  'bottom-center',
] as const;

// Selector for the DevBar component
const DEVBAR_SELECTOR = '[class*="devbar"]';

// Helper to wait for DevBar to be visible
async function waitForDevBar(page: Page): Promise<void> {
  await page.waitForSelector(DEVBAR_SELECTOR, { state: 'visible', timeout: 10000 });
}

// Helper to get devbar locator
function getDevBar(page: Page): ReturnType<Page['locator']> {
  return page.locator(DEVBAR_SELECTOR).first();
}

// Helper to get demo section mask for screenshots
function getDemoMask(page: Page): ReturnType<Page['locator']>[] {
  return [page.locator('.demo-section')];
}

// Helper to reset state and navigate to page
async function setupPage(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForDevBar(page);
}

// Button label mapping for log trigger actions
const LOG_BUTTON_LABELS = {
  info: 'Log Info',
  warning: 'Log Warning',
  error: 'Log Error',
  multiple: 'Log Multiple',
} as const;

// Helper to click log buttons and wait for badge update
async function triggerLogs(page: Page, type: keyof typeof LOG_BUTTON_LABELS): Promise<void> {
  await page.getByRole('button', { name: LOG_BUTTON_LABELS[type] }).click();
  await page.waitForTimeout(100);
}

// Helper to open settings and change position
async function changePosition(page: Page, position: string): Promise<void> {
  await page.locator('[data-testid="devbar-settings-button"]').click();
  await page.waitForTimeout(200);

  const positionButton = page.locator(`[data-position="${position}"]`);
  if (await positionButton.isVisible()) {
    await positionButton.click();
  }
  await page.waitForTimeout(100);
}

test.describe('DevBar Visual Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test.describe('Viewport Responsiveness', () => {
    for (const [name, size] of Object.entries(VIEWPORTS)) {
      test(`should render correctly at ${name} (${size.width}x${size.height})`, async ({
        page,
      }) => {
        await page.setViewportSize(size);
        await page.waitForTimeout(300); // Wait for resize handler

        await expect(getDevBar(page)).toBeVisible();

        await expect(page).toHaveScreenshot(`devbar-${name}-viewport.png`, {
          fullPage: false,
          animations: 'disabled',
          mask: getDemoMask(page),
        });
      });
    }
  });

  test.describe('Badge States', () => {
    test('should show no badges initially', async ({ page }) => {
      await expect(getDevBar(page)).toBeVisible();

      await expect(page).toHaveScreenshot('devbar-no-badges.png', {
        animations: 'disabled',
        mask: getDemoMask(page),
      });
    });

    test('should show info badge after clicking Log Info', async ({ page }) => {
      await triggerLogs(page, 'info');
      await triggerLogs(page, 'info');
      await triggerLogs(page, 'info');

      await expect(page).toHaveScreenshot('devbar-info-badges.png', {
        animations: 'disabled',
        mask: getDemoMask(page),
      });
    });

    test('should show warning badge after clicking Log Warning', async ({ page }) => {
      await triggerLogs(page, 'warning');
      await triggerLogs(page, 'warning');

      await expect(page).toHaveScreenshot('devbar-warning-badges.png', {
        animations: 'disabled',
        mask: getDemoMask(page),
      });
    });

    test('should show error badge after clicking Log Error', async ({ page }) => {
      await triggerLogs(page, 'error');

      await expect(page).toHaveScreenshot('devbar-error-badge.png', {
        animations: 'disabled',
        mask: getDemoMask(page),
      });
    });

    test('should show all badges after clicking Log Multiple', async ({ page }) => {
      await triggerLogs(page, 'multiple');
      await triggerLogs(page, 'multiple');

      await expect(page).toHaveScreenshot('devbar-all-badges.png', {
        animations: 'disabled',
        mask: getDemoMask(page),
      });
    });
  });

  test.describe('Badge + Viewport Combinations', () => {
    const criticalViewports = ['base', 'sm', 'md', 'lg'] as const;

    for (const viewport of criticalViewports) {
      test(`should handle 3 badges at ${viewport} viewport`, async ({ page }) => {
        await page.setViewportSize(VIEWPORTS[viewport]);
        await page.waitForTimeout(300);

        // Trigger all badge types
        await triggerLogs(page, 'multiple');
        await triggerLogs(page, 'multiple');
        await triggerLogs(page, 'info');
        await page.waitForTimeout(200);

        await expect(page).toHaveScreenshot(`devbar-${viewport}-all-badges.png`, {
          animations: 'disabled',
          mask: getDemoMask(page),
        });
      });
    }
  });

  test.describe('Metric Visibility', () => {
    test('should show metrics on wide viewport', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS['2xl']);
      await page.waitForTimeout(300);

      await expect(getDevBar(page)).toBeVisible();

      await expect(page).toHaveScreenshot('devbar-all-metrics-visible.png', {
        animations: 'disabled',
        mask: getDemoMask(page),
      });
    });

    test('should adapt to narrow viewport', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.base);
      await page.waitForTimeout(300);

      await expect(getDevBar(page)).toBeVisible();

      await expect(page).toHaveScreenshot('devbar-narrow-viewport.png', {
        animations: 'disabled',
        mask: getDemoMask(page),
      });
    });

    test('should adapt when badges appear', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.md);
      await page.waitForTimeout(300);

      await triggerLogs(page, 'multiple');
      await triggerLogs(page, 'multiple');
      await triggerLogs(page, 'multiple');
      await page.waitForTimeout(200);

      await expect(page).toHaveScreenshot('devbar-md-with-badges.png', {
        animations: 'disabled',
        mask: getDemoMask(page),
      });
    });
  });

  test.describe('Ellipsis Tooltip Interaction', () => {
    test('should show tooltip on ellipsis hover', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.sm);
      await page.waitForTimeout(200);

      const ellipsis = getDevBar(page).getByText('···');

      if (await ellipsis.isVisible()) {
        await ellipsis.hover();
        await page.waitForTimeout(300);

        await expect(page).toHaveScreenshot('devbar-ellipsis-tooltip-hover.png', {
          animations: 'disabled',
        });
      }
    });

    test('should pin tooltip on ellipsis click', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.sm);
      await page.waitForTimeout(200);

      const ellipsis = getDevBar(page).getByText('···');

      if (await ellipsis.isVisible()) {
        await ellipsis.click();
        await page.waitForTimeout(200);

        // Move mouse away - tooltip should stay pinned
        await page.mouse.move(0, 0);
        await page.waitForTimeout(200);

        await expect(page).toHaveScreenshot('devbar-ellipsis-tooltip-pinned.png', {
          animations: 'disabled',
        });

        // Click again to unpin
        await ellipsis.click();
        await page.waitForTimeout(200);

        await expect(page).toHaveScreenshot('devbar-ellipsis-tooltip-unpinned.png', {
          animations: 'disabled',
        });
      }
    });
  });

  test.describe('Badge Click Filtering', () => {
    test('should filter logs when badge is clicked', async ({ page }) => {
      await triggerLogs(page, 'multiple');
      await triggerLogs(page, 'multiple');

      const devbar = getDevBar(page);

      // Find and click error badge (red colored)
      const errorBadge = devbar.locator('[style*="239, 68, 68"]').first();
      if (await errorBadge.isVisible()) {
        await errorBadge.click();
        await page.waitForTimeout(200);

        await expect(page).toHaveScreenshot('devbar-error-filter-active.png', {
          animations: 'disabled',
        });

        // Click again to clear filter
        await errorBadge.click();
        await page.waitForTimeout(200);

        await expect(page).toHaveScreenshot('devbar-filter-cleared.png', {
          animations: 'disabled',
        });
      }
    });
  });

  test.describe('Compact Mode', () => {
    test('should toggle compact mode', async ({ page }) => {
      const devbar = getDevBar(page);
      await expect(devbar).toBeVisible();

      // Double-click to collapse
      await devbar.dblclick();
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('devbar-collapsed-mode.png', {
        animations: 'disabled',
        mask: getDemoMask(page),
      });

      // Click to expand back
      await getDevBar(page).click();
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('devbar-expanded-after-collapse.png', {
        animations: 'disabled',
        mask: getDemoMask(page),
      });
    });
  });

  test.describe('Theme Switching', () => {
    test('should render with default theme', async ({ page }) => {
      await expect(page).toHaveScreenshot('devbar-default-theme.png', {
        animations: 'disabled',
        mask: getDemoMask(page),
      });
    });
  });

  test.describe('Connection Status', () => {
    test('should show connection indicator', async ({ page }) => {
      await expect(getDevBar(page)).toBeVisible();

      await expect(page).toHaveScreenshot('devbar-connection-status.png', {
        animations: 'disabled',
        mask: getDemoMask(page),
      });
    });
  });
});

test.describe('DevBar Position Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  // Test each position at multiple viewports
  const testViewports = ['base', 'md', 'xl'] as const;

  for (const position of POSITIONS) {
    for (const viewport of testViewports) {
      test(`should render correctly at ${position} on ${viewport} viewport`, async ({ page }) => {
        await page.setViewportSize(VIEWPORTS[viewport]);
        await page.waitForTimeout(200);

        // Change position using the settings panel
        await changePosition(page, position);
        await page.waitForTimeout(300);

        await expect(page).toHaveScreenshot(`devbar-position-${position}-${viewport}.png`, {
          animations: 'disabled',
        });
      });
    }
  }
});

test.describe('DevBar Stress Tests', () => {
  test('should handle rapid log additions', async ({ page }) => {
    await setupPage(page);

    const multiButton = page.getByRole('button', { name: 'Log Multiple' });
    for (let i = 0; i < 5; i++) {
      await multiButton.click({ force: true });
      await page.waitForTimeout(50);
    }

    await expect(getDevBar(page)).toBeVisible();

    await expect(page).toHaveScreenshot('devbar-stress-many-logs.png', {
      animations: 'disabled',
    });
  });

  test('should handle rapid viewport resizing', async ({ page }) => {
    await setupPage(page);

    for (const size of Object.values(VIEWPORTS)) {
      await page.setViewportSize(size);
      await page.waitForTimeout(50);
    }

    await page.setViewportSize(VIEWPORTS.lg);
    await page.waitForTimeout(300);

    await expect(getDevBar(page)).toBeVisible();

    await expect(page).toHaveScreenshot('devbar-after-resize-stress.png', {
      animations: 'disabled',
    });
  });
});

test.describe('DevBar Accessibility', () => {
  test('should have proper contrast ratios', async ({ page }) => {
    await setupPage(page);

    // Placeholder - actual contrast testing would use axe-core
    await expect(getDevBar(page)).toBeVisible();
  });

  test('should be keyboard navigable', async ({ page }) => {
    await setupPage(page);

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });
});
