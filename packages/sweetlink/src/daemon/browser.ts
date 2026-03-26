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

/**
 * Take a screenshot of the current page or a specific element.
 */
export async function takeScreenshot(opts: {
  selector?: string;
  fullPage?: boolean;
  viewport?: string;
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const p = getPage();

  // Apply viewport if specified
  if (opts.viewport) {
    const vp = parseViewport(opts.viewport, DEFAULT_VIEWPORT);
    await p.setViewportSize({ width: vp.width, height: vp.height });
  }

  let buffer: Buffer;
  if (opts.selector) {
    const locator = p.locator(opts.selector).first();
    await locator.waitFor({ state: 'visible', timeout: 5000 });
    buffer = await locator.screenshot();
  } else {
    buffer = await p.screenshot({ fullPage: opts.fullPage });
  }

  const size = opts.selector
    ? await p.locator(opts.selector).first().boundingBox()
    : p.viewportSize();

  return {
    buffer,
    width: size?.width ?? 0,
    height: size?.height ?? 0,
  };
}

/**
 * Take responsive screenshots at multiple viewport widths.
 */
export async function takeResponsiveScreenshots(opts: {
  viewports: number[];
  fullPage?: boolean;
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
    const buffer = await p.screenshot({ fullPage: opts.fullPage });
    const label = width <= 480 ? `mobile-${width}` : width <= 1024 ? `tablet-${width}` : `desktop-${width}`;
    results.push({ width, height, buffer, label });
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
