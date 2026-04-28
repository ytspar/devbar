import { expect, type Page, type TestInfo, test } from '@playwright/test';
import * as fs from 'fs';

const DEVBAR_SELECTOR = '[data-devbar="true"][role="toolbar"][aria-label="DevBar"]';
const MOBILE_LAYOUT_VIEWPORTS = [
  { name: 'phone-320', width: 320, height: 700 },
  { name: 'iphone-se-375', width: 375, height: 667 },
  { name: 'iphone-390', width: 390, height: 844 },
  { name: 'large-phone-430', width: 430, height: 932 },
] as const;

interface UxScreenshot {
  name: string;
  path: string;
  url: string;
  viewport: { width: number; height: number } | null;
  fullPage: boolean;
  note: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function setupPlayground(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(DEVBAR_SELECTOR, { state: 'visible', timeout: 10_000 });
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0 }));
}

async function captureUxScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  options: { fullPage?: boolean; note: string }
): Promise<UxScreenshot> {
  const fullPage = options.fullPage ?? false;
  const path = testInfo.outputPath(`${slugify(name)}.png`);
  await page.screenshot({
    path,
    fullPage,
    animations: 'disabled',
  });
  await testInfo.attach(`${slugify(name)}.png`, {
    path,
    contentType: 'image/png',
  });
  return {
    name,
    path,
    url: page.url(),
    viewport: page.viewportSize(),
    fullPage,
    note: options.note,
  };
}

async function attachScreenshotManifest(
  testInfo: TestInfo,
  screenshots: UxScreenshot[]
): Promise<void> {
  const manifestPath = testInfo.outputPath('ux-screenshots.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ screenshots }, null, 2));
  await testInfo.attach('ux-screenshots.json', {
    path: manifestPath,
    contentType: 'application/json',
  });
}

test.describe('UX screenshot capture', () => {
  test('captures responsive landing and toolbar state', async ({ page }, testInfo) => {
    await setupPlayground(page);

    const screenshots = [
      await captureUxScreenshot(page, testInfo, `${testInfo.project.name}-landing-toolbar`, {
        note: 'Initial landing page with the DevBar visible in the current project viewport.',
      }),
    ];
    await page
      .getByText('Verify', { exact: true })
      .evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await page.waitForTimeout(150);
    screenshots.push(
      await captureUxScreenshot(page, testInfo, `${testInfo.project.name}-workflow-scroll`, {
        note: 'Scrolled assistant workflow state, used to verify the fixed DevBar does not mask primary content.',
      })
    );

    await attachScreenshotManifest(testInfo, screenshots);

    expect(screenshots.every((screenshot) => fs.existsSync(screenshot.path))).toBe(true);
  });

  test('keeps mobile landing controls and package cards inside the viewport', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Mobile layout regression evidence is captured once in Chromium to avoid duplicate screenshots.'
    );

    const screenshots: UxScreenshot[] = [];
    const evidence: unknown[] = [];

    for (const viewport of MOBILE_LAYOUT_VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await setupPlayground(page);
      await page.waitForTimeout(250);

      screenshots.push(
        await captureUxScreenshot(page, testInfo, `mobile-layout-${viewport.name}-top`, {
          note: 'Top-of-page mobile state, verifying fixed simulated-mode and theme controls do not collide.',
        })
      );

      await page.locator('.landing-packages').scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      screenshots.push(
        await captureUxScreenshot(page, testInfo, `mobile-layout-${viewport.name}-packages`, {
          note: 'Mobile package section, verifying package cards do not force horizontal document overflow.',
        })
      );

      const layout = await page.evaluate(() => {
        const toRect = (element: Element | null) => {
          const rect = element?.getBoundingClientRect();
          return rect
            ? {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
              }
            : null;
        };

        const themeRect = toRect(document.querySelector('.theme-toggle'));
        const statusRect = toRect(document.querySelector('.sweetlink-demo-status'));
        const packageRects = Array.from(document.querySelectorAll('.package-card'))
          .map(toRect)
          .filter((rect): rect is NonNullable<typeof rect> => rect !== null);
        const fixedControlsOverlap =
          themeRect !== null &&
          statusRect !== null &&
          themeRect.left < statusRect.right &&
          themeRect.right > statusRect.left &&
          themeRect.top < statusRect.bottom &&
          themeRect.bottom > statusRect.top;

        return {
          viewportWidth: window.innerWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          fixedControlsOverlap,
          packageCount: packageRects.length,
          maxPackageRight: Math.max(...packageRects.map((rect) => rect.right)),
          minPackageLeft: Math.min(...packageRects.map((rect) => rect.left)),
          packagesGridRect: toRect(document.querySelector('.packages-grid')),
          statusRect,
          themeRect,
        };
      });

      evidence.push({ viewport, layout });

      expect(layout.documentScrollWidth).toBeLessThanOrEqual(viewport.width + 1);
      expect(layout.bodyScrollWidth).toBeLessThanOrEqual(viewport.width + 1);
      expect(layout.fixedControlsOverlap).toBe(false);
      expect(layout.themeRect?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(layout.themeRect?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(layout.statusRect?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(layout.packageCount).toBeGreaterThanOrEqual(2);
      expect(layout.minPackageLeft).toBeGreaterThanOrEqual(-1);
      expect(layout.maxPackageRight).toBeLessThanOrEqual(viewport.width + 1);
    }

    await attachScreenshotManifest(testInfo, screenshots);
    await testInfo.attach('mobile-layout-evidence.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  });

  test('captures desktop interaction states for UX review', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'The responsive test captures device screenshots; interaction-state UX review is kept to desktop.'
    );

    await setupPlayground(page);

    const screenshots: UxScreenshot[] = [];
    screenshots.push(
      await captureUxScreenshot(page, testInfo, 'desktop-landing-full-page', {
        fullPage: true,
        note: 'Full landing page content, including the assistant workflow, package sections, quick start, changelog, and demo.',
      })
    );

    await page.getByRole('button', { name: 'Log Info' }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Log Info' }).click();
    await page.waitForTimeout(250);
    screenshots.push(
      await captureUxScreenshot(page, testInfo, 'desktop-demo-log-badge', {
        note: 'Interactive demo after a log action, showing badge feedback in the DevBar.',
      })
    );

    const badge = page.locator(`${DEVBAR_SELECTOR} .devbar-badge`).first();
    if ((await badge.count()) > 0) {
      await badge.click({ force: true });
      await page.waitForTimeout(250);
      screenshots.push(
        await captureUxScreenshot(page, testInfo, 'desktop-console-filter-open', {
          note: 'Console filter state opened from a DevBar log badge.',
        })
      );
      await badge.click({ force: true });
      await page.waitForTimeout(150);
    }

    await page
      .locator('[data-testid="devbar-settings-button"]')
      .evaluate((element) => (element as HTMLButtonElement).click());
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    screenshots.push(
      await captureUxScreenshot(page, testInfo, 'desktop-settings-modal', {
        note: 'Settings modal with theme, position, accent, save location, and screenshot options.',
      })
    );
    await page
      .getByRole('dialog', { name: 'Settings' })
      .getByRole('button', { name: 'Close' })
      .click({ force: true });

    await page
      .getByRole('button', { name: 'Accessibility Audit' })
      .evaluate((element) => (element as HTMLButtonElement).click());
    await expect(
      page
        .getByText(/No accessibility violations found|rules passed|accessibility violations/i)
        .first()
    ).toBeVisible({
      timeout: 15_000,
    });
    screenshots.push(
      await captureUxScreenshot(page, testInfo, 'desktop-accessibility-audit-modal', {
        note: 'Accessibility audit results surfaced through the DevBar.',
      })
    );

    await attachScreenshotManifest(testInfo, screenshots);

    expect(screenshots.length).toBeGreaterThanOrEqual(4);
    expect(screenshots.every((screenshot) => fs.existsSync(screenshot.path))).toBe(true);
  });
});
