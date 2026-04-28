import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_VIEWPORT, parseViewport } from './viewportUtils.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DEV_URL = process.env.SWEETLINK_DEV_URL || 'http://localhost:3000';
const CDP_URL = process.env.CHROME_CDP_URL || 'http://localhost:9222';
const CDP_CONNECTION_TIMEOUT_MS = 2000;
const NAVIGATION_TIMEOUT_MS = 30000;
const SELECTOR_TIMEOUT_MS = 5000;
const HOVER_TRANSITION_DELAY_MS = 300;
const HIDE_DEVBAR_SETTLE_MS = 50;
const HIDE_DEVBAR_STYLE_ID = 'sweetlink-hide-devbar-for-screenshot';
const HIDE_DEVBAR_CSS = `
[data-devbar],
[data-devbar-overlay],
[data-devbar-tooltip] {
  visibility: hidden !important;
  pointer-events: none !important;
}
`;

/** Hard timeout for the entire screenshot operation (browser launch + navigate + capture).
 *  Prevents orphaned Playwright processes when the dev server dies mid-operation.
 *  Configurable via SWEETLINK_OPERATION_TIMEOUT env var (in ms). */
const OPERATION_TIMEOUT_MS = process.env.SWEETLINK_OPERATION_TIMEOUT
  ? parseInt(process.env.SWEETLINK_OPERATION_TIMEOUT, 10)
  : 60_000;

// ============================================================================
// Module loading
// ============================================================================

// Lazy-load playwright types - the actual import is dynamic
type Browser = import('playwright').Browser;
type BrowserContext = import('playwright').BrowserContext;
type Page = import('playwright').Page;
type Chromium = typeof import('playwright').chromium;
type PageScreenshot = Page['screenshot'];

// Cache the playwright module once loaded
let playwrightModule: { chromium: Chromium } | null = null;
const autoHideScreenshotPatches = new WeakMap<
  Page,
  { installCount: number; original: PageScreenshot }
>();

/**
 * Dynamically load playwright module
 * This allows the CLI to work without playwright installed until it's actually needed
 */
async function getPlaywright(): Promise<{ chromium: Chromium }> {
  if (playwrightModule) {
    return playwrightModule;
  }

  try {
    playwrightModule = await import('playwright');
    return playwrightModule;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Cannot find module') || message.includes('ERR_MODULE_NOT_FOUND')) {
      console.error('[Sweetlink] Playwright is not installed.');
      console.error(
        '[Sweetlink] To use Playwright features (--force-cdp, --hover, auto-launch), install it:'
      );
      console.error('[Sweetlink]   npm install playwright');
      console.error('[Sweetlink]   # or: pnpm add playwright');
      console.error('[Sweetlink] ');
      console.error(
        '[Sweetlink] Alternatively, use --force-ws to skip Playwright and use WebSocket mode.'
      );
      throw new Error('Playwright not installed. Install with: npm install playwright');
    }
    throw error;
  }
}

/**
 * Ensure the directory for a file path exists
 */
function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get a Playwright browser instance
 * Tries to connect to existing CDP first, then falls back to launching a new instance
 */
export async function getBrowser(
  url?: string,
  options?: { verbose?: boolean }
): Promise<{ browser: Browser; page: Page; isNew: boolean }> {
  const verbose = options?.verbose ?? false;
  const { chromium } = await getPlaywright();
  const targetUrl = url || DEFAULT_DEV_URL;

  // Try connecting to existing CDP
  try {
    if (verbose) console.log('[Sweetlink] Attempting to connect to existing Chrome...');
    // Add a short timeout for connection attempt
    const browser = await Promise.race([
      chromium.connectOverCDP(CDP_URL),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), CDP_CONNECTION_TIMEOUT_MS)
      ),
    ]);

    if (verbose) console.log('[Sweetlink] Connected to existing Chrome.');
    const contexts = browser.contexts();
    const context = contexts.length > 0 ? contexts[0]! : await browser.newContext();
    const pages = context.pages();

    // Find page with matching URL
    let page = pages.find((p) => p.url() === targetUrl);
    if (!page) {
      page = await context.newPage();
      if (verbose) console.log(`[Sweetlink] Navigating to ${targetUrl}...`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    }

    return { browser, page, isNew: false };
  } catch {
    // Fallback: Launch new browser
    if (verbose) console.log('[Sweetlink] Launching new browser instance...');
    const browser = await chromium.launch({
      headless: true,
    });
    const context = await browser.newContext({
      viewport: DEFAULT_VIEWPORT,
    });
    const page = await context.newPage();

    // Navigate to target URL
    try {
      if (verbose) console.log(`[Sweetlink] Navigating to ${targetUrl}...`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
      if (verbose) console.log('[Sweetlink] Navigation complete.');
    } catch (e) {
      console.warn('[Sweetlink] Navigation timeout or error:', e);
    }

    return { browser, page, isNew: true };
  }
}

/** Temporarily hide DevBar chrome on a Playwright page. */
export async function hideDevbarOnPage(page: Page): Promise<() => Promise<void>> {
  const inserted = await page.evaluate(
    ({ css, styleId }) => {
      if (document.getElementById(styleId)) return false;
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = css;
      document.head.appendChild(style);
      return true;
    },
    { css: HIDE_DEVBAR_CSS, styleId: HIDE_DEVBAR_STYLE_ID }
  );

  return async () => {
    if (!inserted) return;
    await page.evaluate((styleId) => {
      document.getElementById(styleId)?.remove();
    }, HIDE_DEVBAR_STYLE_ID);
  };
}

/** Run an arbitrary Playwright capture while DevBar chrome is hidden. */
export async function withHiddenDevbarForScreenshot<T>(
  page: Page,
  capture: () => Promise<T>
): Promise<T> {
  const cleanup = await hideDevbarOnPage(page);
  await page.waitForTimeout(HIDE_DEVBAR_SETTLE_MS);
  try {
    return await capture();
  } finally {
    await cleanup();
  }
}

/**
 * Patch a Playwright page so every `page.screenshot()` call temporarily hides
 * DevBar chrome. This cannot intercept OS/browser screenshots, but it covers
 * the common Playwright test path without changing each call site.
 *
 * @returns Cleanup function that restores the original screenshot method.
 */
export function installAutoHideDevbarScreenshots(page: Page): () => void {
  const existing = autoHideScreenshotPatches.get(page);
  if (existing) {
    existing.installCount += 1;
    let cleaned = false;
    return () => {
      if (cleaned) return;
      cleaned = true;
      existing.installCount -= 1;
      if (existing.installCount <= 0) {
        page.screenshot = existing.original;
        autoHideScreenshotPatches.delete(page);
      }
    };
  }

  const original = page.screenshot;
  autoHideScreenshotPatches.set(page, { installCount: 1, original });

  page.screenshot = ((options?: Parameters<PageScreenshot>[0]) =>
    withHiddenDevbarForScreenshot(page, () => original.call(page, options))) as PageScreenshot;

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    const patch = autoHideScreenshotPatches.get(page);
    if (!patch) return;
    patch.installCount -= 1;
    if (patch.installCount <= 0) {
      page.screenshot = patch.original;
      autoHideScreenshotPatches.delete(page);
    }
  };
}

/**
 * Patch all existing pages in a BrowserContext and any future pages emitted by
 * the context. Useful as a Playwright fixture installed once per test.
 */
export function installAutoHideDevbarScreenshotsForContext(context: BrowserContext): () => void {
  const cleanups = new Set<() => void>();

  const patchPage = (page: Page): void => {
    cleanups.add(installAutoHideDevbarScreenshots(page));
  };

  for (const page of context.pages()) {
    patchPage(page);
  }

  context.on('page', patchPage);

  return () => {
    context.off('page', patchPage);
    for (const cleanup of cleanups) {
      cleanup();
    }
    cleanups.clear();
  };
}

/**
 * Take a screenshot using Playwright.
 *
 * Wrapped with a hard timeout (OPERATION_TIMEOUT_MS) to prevent orphaned
 * processes when the dev server dies mid-operation.
 */
export async function screenshotViaPlaywright(options: {
  selector?: string;
  output?: string;
  fullPage?: boolean;
  viewport?: string;
  hover?: boolean;
  hideDevbar?: boolean;
  a11y?: boolean; // Placeholder for future
  url?: string;
  /** Enable progress logging (default: false) */
  verbose?: boolean;
  /** Override the operation timeout in ms (default: OPERATION_TIMEOUT_MS) */
  timeout?: number;
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const timeoutMs = options.timeout ?? OPERATION_TIMEOUT_MS;

  // Race the actual work against a hard timeout
  return Promise.race([
    screenshotViaPlaywrightCore(options),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Playwright screenshot timed out after ${timeoutMs}ms. ` +
              `The dev server may be unreachable. Set SWEETLINK_OPERATION_TIMEOUT to adjust.`
          )
        );
      }, timeoutMs);
    }),
  ]);
}

/** Core implementation — separated so the timeout wrapper can race against it. */
async function screenshotViaPlaywrightCore(options: {
  selector?: string;
  output?: string;
  fullPage?: boolean;
  viewport?: string;
  hover?: boolean;
  hideDevbar?: boolean;
  a11y?: boolean;
  url?: string;
  verbose?: boolean;
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const verbose = options.verbose ?? false;
  const { browser, page } = await getBrowser(options.url, { verbose });

  try {
    // Set viewport if requested
    if (options.viewport) {
      const viewport = parseViewport(options.viewport, DEFAULT_VIEWPORT);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
    }

    // Handle selector and hover
    if (options.selector) {
      if (verbose) console.log(`[Sweetlink] Waiting for selector: ${options.selector}`);
      const locator = page.locator(options.selector).first();
      try {
        await locator.waitFor({ state: 'visible', timeout: SELECTOR_TIMEOUT_MS });
        if (verbose) console.log('[Sweetlink] Selector found and visible.');
      } catch {
        console.error(`[Sweetlink] Timeout waiting for selector: ${options.selector}`);
        throw new Error(`Timeout waiting for selector: ${options.selector}`);
      }

      if (options.hover) {
        if (verbose) console.log('[Sweetlink] Triggering hover...');
        await locator.hover();
        if (verbose) console.log('[Sweetlink] Hover complete.');
        // Small delay for transitions
        await page.waitForTimeout(HOVER_TRANSITION_DELAY_MS);
      }

      // For element screenshot, we don't use clip, we use locator.screenshot()
      // But if we want fullPage + selector (doesn't make sense), or just selector
    }

    // Ensure output directory exists
    if (options.output) {
      ensureDir(options.output);
    }

    const capture = async (): Promise<Buffer> => {
      if (options.selector) {
        const locator = page.locator(options.selector).first();
        if (verbose) console.log('[Sweetlink] Capturing element screenshot...');
        const buffer = await locator.screenshot({ path: options.output });
        if (verbose) console.log('[Sweetlink] Element screenshot captured.');
        return buffer;
      }

      if (verbose) console.log('[Sweetlink] Capturing full page screenshot...');
      const buffer = await page.screenshot({
        path: options.output,
        fullPage: options.fullPage,
      });
      if (verbose) console.log('[Sweetlink] Full page screenshot captured.');
      return buffer;
    };

    const buffer = options.hideDevbar
      ? await withHiddenDevbarForScreenshot(page, capture)
      : await capture();

    // Get dimensions
    const size = options.selector
      ? await page.locator(options.selector).first().boundingBox()
      : page.viewportSize();

    return {
      buffer,
      width: size?.width || 0,
      height: size?.height || 0,
    };
  } finally {
    if (verbose) console.log('[Sweetlink] Closing browser...');
    await browser.close();
    if (verbose) console.log('[Sweetlink] Browser closed.');
  }
}
