import { expect, type Page, type TestInfo, test } from '@playwright/test';
import * as fs from 'fs';

const DEVBAR_SELECTOR = '[data-devbar="true"][role="toolbar"][aria-label="DevBar"]';

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
