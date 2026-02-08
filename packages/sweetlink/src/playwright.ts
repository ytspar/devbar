import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_VIEWPORT, parseViewport } from './viewportUtils.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DEV_URL = process.env.SWEETLINK_DEV_URL || 'http://localhost:3000';
const CDP_URL = 'http://localhost:9222';
const CDP_CONNECTION_TIMEOUT_MS = 2000;
const NAVIGATION_TIMEOUT_MS = 30000;
const SELECTOR_TIMEOUT_MS = 5000;
const HOVER_TRANSITION_DELAY_MS = 300;

// ============================================================================
// Module loading
// ============================================================================

// Lazy-load playwright types - the actual import is dynamic
type Browser = import('playwright').Browser;
type Page = import('playwright').Page;
type Chromium = typeof import('playwright').chromium;

// Cache the playwright module once loaded
let playwrightModule: { chromium: Chromium } | null = null;

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
  url?: string
): Promise<{ browser: Browser; page: Page; isNew: boolean }> {
  const { chromium } = await getPlaywright();
  const targetUrl = url || DEFAULT_DEV_URL;

  // Try connecting to existing CDP
  try {
    console.log('[Sweetlink] Attempting to connect to existing Chrome...');
    // Add a short timeout for connection attempt
    const browser = await Promise.race([
      chromium.connectOverCDP(CDP_URL),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), CDP_CONNECTION_TIMEOUT_MS)
      ),
    ]);

    console.log('[Sweetlink] Connected to existing Chrome.');
    const contexts = browser.contexts();
    const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
    const pages = context.pages();

    // Find page with matching URL
    let page = pages.find((p) => p.url() === targetUrl);
    if (!page) {
      page = await context.newPage();
      console.log(`[Sweetlink] Navigating to ${targetUrl}...`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    }

    return { browser, page, isNew: false };
  } catch {
    // Fallback: Launch new browser
    console.log('[Sweetlink] Launching new browser instance...');
    const browser = await chromium.launch({
      headless: true,
    });
    const context = await browser.newContext({
      viewport: DEFAULT_VIEWPORT,
    });
    const page = await context.newPage();

    // Navigate to target URL
    try {
      console.log(`[Sweetlink] Navigating to ${targetUrl}...`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
      console.log('[Sweetlink] Navigation complete.');
    } catch (e) {
      console.warn('[Sweetlink] Navigation timeout or error:', e);
    }

    return { browser, page, isNew: true };
  }
}

/**
 * Take a screenshot using Playwright
 */
export async function screenshotViaPlaywright(options: {
  selector?: string;
  output?: string;
  fullPage?: boolean;
  viewport?: string;
  hover?: boolean;
  a11y?: boolean; // Placeholder for future
  url?: string;
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { browser, page } = await getBrowser(options.url);

  try {
    // Set viewport if requested
    if (options.viewport) {
      const viewport = parseViewport(options.viewport, DEFAULT_VIEWPORT);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
    }

    // Handle selector and hover
    if (options.selector) {
      console.log(`[Sweetlink] Waiting for selector: ${options.selector}`);
      const locator = page.locator(options.selector).first();
      try {
        await locator.waitFor({ state: 'visible', timeout: SELECTOR_TIMEOUT_MS });
        console.log('[Sweetlink] Selector found and visible.');
      } catch {
        console.error(`[Sweetlink] Timeout waiting for selector: ${options.selector}`);
        throw new Error(`Timeout waiting for selector: ${options.selector}`);
      }

      if (options.hover) {
        console.log('[Sweetlink] Triggering hover...');
        await locator.hover();
        console.log('[Sweetlink] Hover complete.');
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

    let buffer: Buffer;
    if (options.selector) {
      const locator = page.locator(options.selector).first();
      console.log('[Sweetlink] Capturing element screenshot...');
      buffer = await locator.screenshot({ path: options.output });
      console.log('[Sweetlink] Element screenshot captured.');
    } else {
      console.log('[Sweetlink] Capturing full page screenshot...');
      buffer = await page.screenshot({
        path: options.output,
        fullPage: options.fullPage,
      });
      console.log('[Sweetlink] Full page screenshot captured.');
    }

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
    // Only close if we launched it new. If we connected to existing, maybe keep it?
    // Actually, for a CLI tool, we should probably close the connection/browser we opened.
    // If we connected to existing CDP, browser.close() might close the user's browser?
    // chromium.connectOverCDP returns a Browser that, when closed, disconnects.
    console.log('[Sweetlink] Closing browser...');
    await browser.close();
    console.log('[Sweetlink] Browser closed.');
  }
}
