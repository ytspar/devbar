/**
 * DevBar E2E Visual Tests
 *
 * Comprehensive visual verification tests for the DevBar component
 * across different viewports, positions, badge states, and interactions.
 */

import { expect, type Page, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const axeSource = fs.readFileSync(
  path.join(process.cwd(), 'packages/devbar/node_modules/axe-core/axe.min.js'),
  'utf-8'
);

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
const DEVBAR_SELECTOR = '[data-devbar="true"][role="toolbar"][aria-label="DevBar"]';

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

interface AxeResult {
  violations: Array<{ id: string; impact?: string; help: string; nodes: unknown[] }>;
  incomplete: Array<{ id: string; impact?: string; help: string; nodes: unknown[] }>;
  passes: Array<{ id: string }>;
}

interface ContrastSample {
  text: string;
  selector: string;
  ratio: number;
  foreground: string;
  background: string;
}

async function runDevBarAxe(page: Page): Promise<AxeResult> {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async (selector) => {
    const axe = (
      window as unknown as {
        axe: { run: (context: unknown, options: unknown) => Promise<AxeResult> };
      }
    ).axe;
    // axe-core treats `include` inside RunOptions as no-op — selectors must
    // ride the context argument, not the options. Without this, the run
    // scans the entire page and any unrelated playground violation will
    // fail this DevBar-only test.
    return axe.run(
      { include: [[selector]] },
      { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }
    );
  }, DEVBAR_SELECTOR) as Promise<AxeResult>;
}

async function collectDevBarContrastSamples(page: Page): Promise<ContrastSample[]> {
  return page.evaluate((selector) => {
    interface Rgba {
      r: number;
      g: number;
      b: number;
      a: number;
    }

    function parseColor(value: string): Rgba | null {
      if (!value || value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

      const rgbMatch = value.match(/rgba?\(([^)]+)\)/);
      if (rgbMatch) {
        const parts = rgbMatch[1]!.split(',').map((p) => p.trim());
        return {
          r: Number(parts[0]),
          g: Number(parts[1]),
          b: Number(parts[2]),
          a: parts[3] === undefined ? 1 : Number(parts[3]),
        };
      }

      const srgbMatch = value.match(
        /color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+))?\)/
      );
      if (srgbMatch) {
        return {
          r: Number(srgbMatch[1]) * 255,
          g: Number(srgbMatch[2]) * 255,
          b: Number(srgbMatch[3]) * 255,
          a: srgbMatch[4] === undefined ? 1 : Number(srgbMatch[4]),
        };
      }

      const hexMatch = value.match(/#([0-9a-f]{6})/i);
      if (hexMatch) {
        const hex = hexMatch[1]!;
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
          a: 1,
        };
      }

      const colorMixMatch = value.match(
        /color-mix\(in srgb,\s*(#[0-9a-f]{6}|rgba?\([^)]+\)|color\(srgb[^)]+\))\s+([0-9.]+)%,\s*transparent\)/i
      );
      if (colorMixMatch) {
        const color = parseColor(colorMixMatch[1]!);
        if (!color) return null;
        return { ...color, a: color.a * (Number(colorMixMatch[2]) / 100) };
      }

      return null;
    }

    function blend(top: Rgba, bottom: Rgba): Rgba {
      const a = top.a + bottom.a * (1 - top.a);
      if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
        g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
        b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
        a,
      };
    }

    function luminance(color: Rgba): number {
      const channels = [color.r, color.g, color.b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
    }

    function contrast(foreground: Rgba, background: Rgba): number {
      const fg = luminance(foreground);
      const bg = luminance(background);
      const lighter = Math.max(fg, bg);
      const darker = Math.min(fg, bg);
      return (lighter + 0.05) / (darker + 0.05);
    }

    function effectiveBackground(element: Element): Rgba {
      const chain: Element[] = [];
      let current: Element | null = element;
      while (current) {
        chain.unshift(current);
        current = current.parentElement;
      }

      let background: Rgba = { r: 255, g: 255, b: 255, a: 1 };
      for (const node of chain) {
        const color = parseColor(getComputedStyle(node).backgroundColor);
        if (color && color.a > 0) {
          background = blend(color, background);
        }
      }
      return background;
    }

    function colorToString(color: Rgba): string {
      return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${color.a.toFixed(2)})`;
    }

    function directText(element: Element): string {
      return Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    const root = document.querySelector(selector);
    if (!root) return [];

    return Array.from(root.querySelectorAll<HTMLElement>('*'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const text = directText(element);
        const style = getComputedStyle(element);
        return !!text && rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
      })
      .map((element) => {
        const style = getComputedStyle(element);
        const background = effectiveBackground(element);
        const foreground = blend(parseColor(style.color) ?? { r: 0, g: 0, b: 0, a: 1 }, background);
        return {
          text: directText(element).slice(0, 80),
          selector:
            element.tagName.toLowerCase() +
            (element.className ? `.${String(element.className).split(/\s+/)[0]}` : ''),
          ratio: Number(contrast(foreground, background).toFixed(2)),
          foreground: colorToString(foreground),
          background: colorToString(background),
        };
      });
  }, DEVBAR_SELECTOR);
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

test.describe('DevBar Responsive Layout', () => {
  test('keeps action buttons compact without clipping at medium widths', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Responsive wrapping is geometry-checked in desktop Chromium; device projects cover touch targets.'
    );

    await page.setViewportSize({ width: 993, height: 800 });
    await setupPage(page);
    await changePosition(page, 'bottom-center');

    const layout = await page.evaluate((selector) => {
      const root = document.querySelector(selector) as HTMLElement | null;
      const status = root?.querySelector('.devbar-status') as HTMLElement | null;
      const actions = root?.querySelector('.devbar-actions') as HTMLElement | null;
      const buttons = Array.from(actions?.querySelectorAll('button') ?? []);
      const rootRect = root?.getBoundingClientRect();
      const statusRect = status?.getBoundingClientRect();
      const actionsRect = actions?.getBoundingClientRect();
      const buttonRects = buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, width: rect.width };
      });

      return {
        viewportWidth: window.innerWidth,
        rootLeft: rootRect?.left ?? 0,
        rootRight: rootRect?.right ?? 0,
        rootClientWidth: root?.clientWidth ?? 0,
        rootScrollWidth: root?.scrollWidth ?? 0,
        rootHeight: rootRect?.height ?? 0,
        statusTop: statusRect?.top ?? 0,
        statusBottom: statusRect?.bottom ?? 0,
        actionsTop: actionsRect?.top ?? 0,
        actionsBottom: actionsRect?.bottom ?? 0,
        maxButtonRight: Math.max(...buttonRects.map((rect) => rect.right)),
        minButtonLeft: Math.min(...buttonRects.map((rect) => rect.left)),
        buttonCount: buttonRects.length,
      };
    }, DEVBAR_SELECTOR);

    await testInfo.attach('devbar-responsive-wrap-evidence.json', {
      body: JSON.stringify(layout, null, 2),
      contentType: 'application/json',
    });

    expect(layout.buttonCount).toBeGreaterThanOrEqual(8);
    expect(layout.actionsTop).toBeLessThanOrEqual(layout.statusBottom);
    expect(layout.rootHeight).toBeLessThanOrEqual(72);
    expect(layout.rootLeft).toBeGreaterThanOrEqual(-1);
    expect(layout.rootRight).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.rootScrollWidth).toBeLessThanOrEqual(layout.rootClientWidth + 1);
    expect(layout.minButtonLeft).toBeGreaterThanOrEqual(-1);
    expect(layout.maxButtonRight).toBeLessThanOrEqual(layout.viewportWidth + 1);
  });
});

test.describe('DevBar Accessibility', () => {
  test('should have no axe violations and expose contrast evidence', async ({ page }, testInfo) => {
    await setupPage(page);

    const [axeResult, contrastSamples] = await Promise.all([
      runDevBarAxe(page),
      collectDevBarContrastSamples(page),
    ]);
    const lowContrastSamples = contrastSamples.filter((sample) => sample.ratio < 4.5);

    await testInfo.attach('devbar-accessibility-evidence.json', {
      body: JSON.stringify(
        {
          axe: {
            violations: axeResult.violations,
            incomplete: axeResult.incomplete,
            passCount: axeResult.passes.length,
          },
          contrastSamples,
          lowContrastSamples,
        },
        null,
        2
      ),
      contentType: 'application/json',
    });

    expect(axeResult.violations).toEqual([]);
    expect(lowContrastSamples).toEqual([]);
  });

  test('should expose named, focus-visible keyboard controls', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Keyboard focus traversal is verified in desktop Chromium; device projects cover touch targets.'
    );
    await setupPage(page);

    const focusable = page.locator(
      `${DEVBAR_SELECTOR} button:not(#devbar-focus-sentinel), ${DEVBAR_SELECTOR} [role="button"]:not(#devbar-focus-sentinel), ${DEVBAR_SELECTOR} [tabindex]:not([tabindex="-1"]):not(#devbar-focus-sentinel)`
    );
    const controlCount = await focusable.count();
    expect(controlCount).toBeGreaterThanOrEqual(6);

    const controls = await focusable.evaluateAll((elements) =>
      elements
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
        })
        .map((element, index) => {
          const htmlElement = element as HTMLElement;
          const style = getComputedStyle(htmlElement);
          const name =
            htmlElement.getAttribute('aria-label') ||
            htmlElement.getAttribute('title') ||
            htmlElement.textContent?.trim() ||
            '';
          return {
            index,
            name,
            tagName: htmlElement.tagName.toLowerCase(),
            role: htmlElement.getAttribute('role'),
            tabIndex: htmlElement.tabIndex,
            disabled:
              htmlElement.hasAttribute('disabled') ||
              htmlElement.getAttribute('aria-disabled') === 'true',
            width: Math.round(htmlElement.getBoundingClientRect().width),
            height: Math.round(htmlElement.getBoundingClientRect().height),
            cursor: style.cursor,
          };
        })
    );

    const focusOrder: Array<{ name: string; tagName: string; visibleFocus: boolean }> = [];
    if (testInfo.project.name === 'chromium') {
      for (let i = 0; i < Math.min(controlCount, 10); i++) {
        await focusable.nth(i).focus();
        const active = await page.evaluate((selector) => {
          const activeElement = document.activeElement as HTMLElement | null;
          const root = document.querySelector(selector);
          if (!activeElement || !root?.contains(activeElement)) return null;
          const style = getComputedStyle(activeElement);
          const name =
            activeElement.getAttribute('aria-label') ||
            activeElement.getAttribute('title') ||
            activeElement.textContent?.trim() ||
            '';
          return {
            name,
            tagName: activeElement.tagName.toLowerCase(),
            visibleFocus:
              activeElement.matches(':focus-visible') ||
              (style.outlineStyle !== 'none' && style.outlineWidth !== '0px') ||
              style.boxShadow !== 'none',
          };
        }, DEVBAR_SELECTOR);
        if (!active) break;
        focusOrder.push(active);
      }
    }

    await testInfo.attach('devbar-keyboard-evidence.json', {
      body: JSON.stringify(
        {
          project: testInfo.project.name,
          controls,
          focusOrder,
          keyboardTraversal:
            testInfo.project.name === 'chromium'
              ? 'verified'
              : 'covered by desktop project; this device project emits naming and touch evidence',
        },
        null,
        2
      ),
      contentType: 'application/json',
    });

    expect(controls.map((item) => item.name)).toEqual(
      expect.arrayContaining(['Screenshot', 'Accessibility Audit', 'Settings'])
    );
    expect(controls.every((item) => item.name.length > 0)).toBe(true);
    expect(controls.every((item) => item.tabIndex >= 0 || item.disabled)).toBe(true);

    if (testInfo.project.name === 'chromium') {
      const controlNames = new Set(controls.map((item) => item.name));
      expect(focusOrder.length).toBeGreaterThanOrEqual(2);
      expect(new Set(focusOrder.map((item) => item.name)).size).toBe(focusOrder.length);
      expect(focusOrder.every((item) => controlNames.has(item.name))).toBe(true);
      expect(focusOrder.every((item) => item.visibleFocus)).toBe(true);
    }
  });

  test('should expose accessible settings modal semantics', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Modal keyboard semantics are verified in desktop Chromium; mobile affordance is covered by touch targets.'
    );
    await setupPage(page);

    await page.locator('[data-testid="devbar-settings-button"]').click();
    const overlay = page.locator('[data-devbar-overlay="true"]');
    const dialog = page.getByRole('dialog', { name: 'Settings' });

    await expect(overlay).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toBeFocused();

    const modalEvidence = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        role: element.getAttribute('role'),
        ariaModal: element.getAttribute('aria-modal'),
        ariaLabel: element.getAttribute('aria-label'),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        focusableControls: element.querySelectorAll('button, [role="button"], input, select')
          .length,
      };
    });
    await testInfo.attach('devbar-modal-evidence.json', {
      body: JSON.stringify(modalEvidence, null, 2),
      contentType: 'application/json',
    });

    expect(modalEvidence.focusableControls).toBeGreaterThanOrEqual(4);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(overlay).toBeHidden();
  });

  test('should keep mobile toolbar controls large enough for touch', async ({ page }, testInfo) => {
    await page.setViewportSize(VIEWPORTS.base);
    await setupPage(page);

    const collectControls = () =>
      page
        .locator(`${DEVBAR_SELECTOR} button, ${DEVBAR_SELECTOR} [role="button"]`)
        .evaluateAll((elements) =>
          elements
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
            })
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                name:
                  element.getAttribute('aria-label') ||
                  element.getAttribute('title') ||
                  element.textContent?.trim() ||
                  element.tagName.toLowerCase(),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              };
            })
        );

    await expect
      .poll(async () => (await collectControls()).length, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(4);

    const controls = await collectControls();
    const tooSmall = controls.filter((control) => control.width < 24 || control.height < 24);

    await testInfo.attach('devbar-mobile-touch-targets.json', {
      body: JSON.stringify({ controls, tooSmall }, null, 2),
      contentType: 'application/json',
    });

    expect(tooSmall).toEqual([]);
  });
});
