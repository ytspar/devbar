/**
 * Daemon Browser Management
 *
 * Manages a persistent Playwright browser and page instance within the daemon process.
 * Unlike the existing playwright.ts which opens and closes browsers per-operation,
 * this keeps a single browser alive for the daemon's lifetime.
 */

import { DEFAULT_VIEWPORT, parseViewport } from '../viewportUtils.js';
import { installCursorHighlight } from './cursor.js';
import { installListeners } from './listeners.js';

// ============================================================================
// Lazy Playwright Import
// ============================================================================

type Browser = import('playwright').Browser;
type BrowserContext = import('playwright').BrowserContext;
type Page = import('playwright').Page;
type Chromium = typeof import('playwright').chromium;

let playwrightModule: { chromium: Chromium } | null = null;

async function getPlaywright(): Promise<{ chromium: Chromium }> {
  if (playwrightModule) return playwrightModule;
  try {
    playwrightModule = await import('playwright');
    return playwrightModule;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Cannot find module') || message.includes('ERR_MODULE_NOT_FOUND')) {
      throw new Error(
        'Playwright not installed. Install with: pnpm add playwright\n' +
          'The daemon requires Playwright for headless browser control.'
      );
    }
    throw error;
  }
}

// ============================================================================
// Browser State
// ============================================================================

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let currentUrl: string | null = null;

const NAVIGATION_TIMEOUT_MS = 30_000;
const HIDE_DEVBAR_STYLE_ID = 'sweetlink-hide-devbar-for-screenshot';
const HIDE_DEVBAR_CSS = `
[data-devbar],
[data-devbar-overlay],
[data-devbar-tooltip] {
  visibility: hidden !important;
  pointer-events: none !important;
}
`;

// ============================================================================
// Public API
// ============================================================================

/** Whether to launch in headed mode (set once at daemon start) */
let headedMode = false;

/** Configure headed mode before first initBrowser() call */
export function setHeadedMode(headed: boolean): void {
  headedMode = headed;
}

/**
 * Initialize the persistent browser and navigate to the target URL.
 * Called once when the daemon starts or on first command.
 */
export async function initBrowser(url: string): Promise<void> {
  if (browser) return;

  const { chromium } = await getPlaywright();
  const headless = !headedMode;
  console.error(`[Daemon] Launching ${headless ? 'headless' : 'HEADED'} Chromium...`);

  browser = await chromium.launch({
    headless,
    ...(headedMode && { slowMo: 50 }), // Slow down so you can see actions
  });
  context = await browser.newContext({
    viewport: DEFAULT_VIEWPORT,
  });
  page = await context.newPage();

  // Install always-on event listeners and cursor highlight
  installListeners(page);
  await installCursorHighlight(page);

  await navigateTo(url);
  console.error('[Daemon] Browser ready.');
}

/**
 * Get the persistent page instance. Throws if browser not initialized.
 */
export function getPage(): Page {
  if (!page) {
    throw new Error('Browser not initialized. Call initBrowser() first.');
  }
  return page;
}

/**
 * Get the browser instance (needed for creating recording contexts).
 */
export function getBrowserInstance(): Browser {
  if (!browser) {
    throw new Error('Browser not initialized. Call initBrowser() first.');
  }
  return browser;
}

/**
 * Navigate to a URL if it differs from the current one.
 */
export async function navigateTo(url: string): Promise<void> {
  const p = getPage();
  if (currentUrl === url) return;

  console.error(`[Daemon] Navigating to ${url}...`);
  try {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    currentUrl = url;
  } catch (error) {
    console.error('[Daemon] Navigation error:', error instanceof Error ? error.message : error);
    // Still update currentUrl — page may have partially loaded
    currentUrl = url;
  }
}

async function withHiddenDevbar<T>(
  targetPage: Page,
  enabled: boolean | undefined,
  capture: () => Promise<T>
): Promise<T> {
  if (!enabled) return capture();

  const inserted = await targetPage.evaluate(
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
  await targetPage.waitForTimeout(50);

  try {
    return await capture();
  } finally {
    if (inserted) {
      await targetPage.evaluate((styleId) => {
        document.getElementById(styleId)?.remove();
      }, HIDE_DEVBAR_STYLE_ID);
    }
  }
}

/**
 * Take a screenshot of the current page or a specific element.
 * If `page` is provided, screenshots that page instead of the daemon's
 * main page (e.g. the recording page during a session).
 */
export async function takeScreenshot(opts: {
  selector?: string;
  fullPage?: boolean;
  viewport?: string;
  page?: Page;
  /** Pixels of extra context to include around the selector's bounding box. */
  padding?: number;
  /** Force the page's color scheme: 'light' | 'dark' | 'no-preference' */
  theme?: 'light' | 'dark' | 'no-preference';
  /** Temporarily hide DevBar chrome from the captured image. */
  hideDevbar?: boolean;
}): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
  /** Number of elements matching `selector` (informational; only the first is captured). */
  matchCount?: number;
  /** Document scrollHeight if it exceeds the viewport (lets callers hint at --full-page). */
  pageHeight?: number;
  viewportHeight?: number;
}> {
  const p = opts.page ?? getPage();

  // Apply viewport if specified
  if (opts.viewport) {
    const vp = parseViewport(opts.viewport, DEFAULT_VIEWPORT);
    await p.setViewportSize({ width: vp.width, height: vp.height });
  }

  // Apply color-scheme emulation. Most modern sites read
  // `prefers-color-scheme` to render their dark theme; this triggers it.
  if (opts.theme) {
    await p.emulateMedia({ colorScheme: opts.theme }).catch(() => {});
  }

  let buffer: Buffer;
  let matchCount: number | undefined;
  if (opts.selector) {
    const all = p.locator(opts.selector);
    matchCount = await all.count();
    const locator = all.first();
    await locator.waitFor({ state: 'visible', timeout: 5000 });
    if (opts.padding && opts.padding > 0) {
      // Expand the capture region by `padding` px on every side. We do this
      // by computing the locator's box, then full-page-screenshotting and
      // cropping via `clip` — that's the simplest cross-platform approach.
      const box = await locator.boundingBox();
      if (box) {
        const pad = opts.padding;
        const pageDoc = await p.evaluate(() => ({
          w: document.documentElement.scrollWidth,
          h: document.documentElement.scrollHeight,
        }));
        const clip = {
          x: Math.max(0, box.x - pad),
          y: Math.max(0, box.y - pad),
          width: Math.min(pageDoc.w, box.width + 2 * pad),
          height: Math.min(pageDoc.h, box.height + 2 * pad),
        };
        buffer = await withHiddenDevbar(p, opts.hideDevbar, () =>
          p.screenshot({ fullPage: true, clip })
        );
      } else {
        buffer = await withHiddenDevbar(p, opts.hideDevbar, () => locator.screenshot());
      }
    } else {
      buffer = await withHiddenDevbar(p, opts.hideDevbar, () => locator.screenshot());
    }
  } else {
    buffer = await withHiddenDevbar(p, opts.hideDevbar, () =>
      p.screenshot({ fullPage: opts.fullPage })
    );
  }

  // Always report the actual captured image dimensions. Reading from the
  // PNG IHDR chunk is cheap and works for selector, viewport, and
  // full-page captures alike — viewportSize() lies for full-page since
  // the rendered image is taller than the viewport.
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  // Report overflow info so callers can hint at --full-page when content
  // extends below the viewport.
  let pageHeight: number | undefined;
  let viewportHeight: number | undefined;
  if (!opts.selector && !opts.fullPage) {
    const vp = p.viewportSize();
    if (vp) {
      viewportHeight = vp.height;
      pageHeight = await p.evaluate(() => document.documentElement.scrollHeight);
    }
  }

  return { buffer, width, height, matchCount, pageHeight, viewportHeight };
}

/**
 * Take responsive screenshots at multiple viewport widths.
 */
export async function takeResponsiveScreenshots(opts: {
  viewports: number[];
  fullPage?: boolean;
  hideDevbar?: boolean;
}): Promise<Array<{ width: number; height: number; buffer: Buffer; label: string }>> {
  const p = getPage();
  const results: Array<{ width: number; height: number; buffer: Buffer; label: string }> = [];

  // Save original viewport to restore later
  const originalViewport = p.viewportSize() ?? DEFAULT_VIEWPORT;

  for (const width of opts.viewports) {
    const height = width <= 480 ? Math.round(width * 1.78) : Math.round(width * 1.33);
    await p.setViewportSize({ width, height });
    // Small wait for layout to settle
    await p.waitForTimeout(100);
    const buffer = await withHiddenDevbar(p, opts.hideDevbar, () =>
      p.screenshot({ fullPage: opts.fullPage })
    );
    const label =
      width <= 480 ? `mobile-${width}` : width <= 1024 ? `tablet-${width}` : `desktop-${width}`;
    // Report the ACTUAL captured image dimensions, not the formula-derived
    // viewport. Matters for full-page captures where the image is taller
    // than the viewport.
    const actualWidth = buffer.readUInt32BE(16);
    const actualHeight = buffer.readUInt32BE(20);
    results.push({ width: actualWidth, height: actualHeight, buffer, label });
  }

  // Restore original viewport
  await p.setViewportSize(originalViewport);

  return results;
}

/**
 * Close the browser and clean up resources.
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    try {
      await browser.close();
    } catch {
      // Browser may already be closed
    }
    browser = null;
    context = null;
    page = null;
    currentUrl = null;
    console.error('[Daemon] Browser closed.');
  }
}
