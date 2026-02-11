/**
 * Sweetlink CDP (Chrome DevTools Protocol) Integration
 *
 * Provides enhanced screenshot and debugging capabilities using Puppeteer
 * to connect to a Chrome instance running with remote debugging enabled.
 */

import * as fs from 'fs';
import puppeteer, {
  type Browser,
  type ConsoleMessage,
  type HTTPRequest,
  type HTTPResponse,
  type Metrics,
  type Page,
} from 'puppeteer-core';
import { parseViewport } from './viewportUtils.js';

// ============================================================================
// Constants
// ============================================================================

const CDP_URL = process.env.CHROME_CDP_URL || 'http://127.0.0.1:9222';
const DEFAULT_DEV_URL = process.env.SWEETLINK_DEV_URL || 'http://localhost:3000';

/** Timeouts */
const NETWORK_IDLE_TIMEOUT_MS = 10000;
const NETWORK_IDLE_TIME_MS = 500;
const SELECTOR_TIMEOUT_MS = 5000;
const HOVER_TRANSITION_DELAY_MS = 300;
const CONSOLE_LOG_COLLECT_DELAY_MS = 1000;
const NETWORK_REQUEST_COLLECT_DELAY_MS = 2000;

/**
 * Check if Chrome DevTools Protocol is available
 */
export async function detectCDP(): Promise<boolean> {
  try {
    const response = await fetch(`${CDP_URL}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Connect to Chrome via CDP
 */
export async function getCDPBrowser(): Promise<Browser> {
  try {
    const browser = await puppeteer.connect({
      browserURL: CDP_URL,
      defaultViewport: null,
    });
    return browser;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to connect to Chrome';
    throw new Error(
      `CDP connection failed: ${errorMessage}\n\nMake sure Chrome is running with:\n/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222`
    );
  }
}

/**
 * Find the local development page (localhost:3000)
 */
export async function findLocalDevPage(browser: Browser): Promise<Page> {
  const pages = await browser.pages();
  let devPage = pages.find((p: Page) => {
    const url = p.url();
    return url.includes('localhost:3000') || url.includes('127.0.0.1:3000');
  });

  // If no dev page found, navigate to localhost:3000
  if (!devPage) {
    console.log(
      `[Sweetlink CDP] No localhost:3000 page found, navigating to ${DEFAULT_DEV_URL}...`
    );

    // Use the first page or create a new one
    if (pages.length > 0) {
      devPage = pages[0];
    } else {
      devPage = await browser.newPage();
    }

    await devPage.goto(DEFAULT_DEV_URL, { waitUntil: 'networkidle0' });
  }

  return devPage;
}

/**
 * Take a screenshot using CDP
 */
export async function screenshotViaCDP(options: {
  selector?: string;
  output?: string;
  fullPage?: boolean;
  waitForNetwork?: boolean;
  viewport?: string;
  hover?: boolean;
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const browser = await getCDPBrowser();

  try {
    const page = await findLocalDevPage(browser);

    // Set viewport size
    const viewport = parseViewport(options.viewport);

    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      isMobile: viewport.isMobile,
      hasTouch: viewport.isMobile,
    });

    // Wait for network to be idle (like Playwright's networkidle)
    if (options.waitForNetwork !== false) {
      try {
        await page.waitForNetworkIdle({
          timeout: NETWORK_IDLE_TIMEOUT_MS,
          idleTime: NETWORK_IDLE_TIME_MS,
        });
      } catch {
        console.warn('[Sweetlink CDP] Network idle timeout, proceeding with screenshot');
      }
    }

    const screenshotOptions: { type: 'png'; fullPage: boolean; clip?: { x: number; y: number; width: number; height: number } } = {
      type: 'png',
      fullPage: options.fullPage || false,
    };

    // If selector is provided, screenshot just that element
    if (options.selector) {
      try {
        await page.waitForSelector(options.selector, { timeout: SELECTOR_TIMEOUT_MS });

        // Trigger hover if requested
        if (options.hover) {
          try {
            await page.hover(options.selector);
            // Give it a moment for transitions
            await new Promise((r) => setTimeout(r, HOVER_TRANSITION_DELAY_MS));
          } catch (e) {
            console.warn(`[Sweetlink CDP] Failed to hover over ${options.selector}:`, e);
          }
        }

        const element = await page.$(options.selector);

        if (!element) {
          throw new Error(`Element not found: ${options.selector}`);
        }

        const boundingBox = await element.boundingBox();
        if (boundingBox) {
          screenshotOptions.clip = {
            x: boundingBox.x,
            y: boundingBox.y,
            width: boundingBox.width,
            height: boundingBox.height,
          };
        }
      } catch (error) {
        throw new Error(
          `Failed to find element "${options.selector}": ${error instanceof Error ? error.message : error}`
        );
      }
    }

    // Take the screenshot
    const screenshot = await page.screenshot(screenshotOptions);
    const buffer = Buffer.from(screenshot);

    // Save to file if output path provided
    if (options.output) {
      fs.writeFileSync(options.output, buffer);
    }

    // Get dimensions
    const dimensions = screenshotOptions.clip
      ? { width: screenshotOptions.clip.width, height: screenshotOptions.clip.height }
      : await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));

    return {
      buffer,
      width: Math.round(dimensions.width),
      height: Math.round(dimensions.height),
    };
  } finally {
    await browser.disconnect();
  }
}

/**
 * Get console logs from the page
 */
export async function getConsoleLogsViaCDP(): Promise<
  Array<{
    type: string;
    text: string;
    location?: { url?: string; lineNumber?: number };
    timestamp: number;
  }>
> {
  const browser = await getCDPBrowser();

  try {
    const page = await findLocalDevPage(browser);

    const logs: Array<{
      type: string;
      text: string;
      location?: { url?: string; lineNumber?: number };
      timestamp: number;
    }> = [];

    // Set up console log listener
    page.on('console', (msg: ConsoleMessage) => {
      logs.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location(),
        timestamp: Date.now(),
      });
    });

    // Wait a bit to collect any immediate logs
    await new Promise((resolve) => setTimeout(resolve, CONSOLE_LOG_COLLECT_DELAY_MS));

    return logs;
  } finally {
    await browser.disconnect();
  }
}

/**
 * Query DOM elements via CDP
 */
export async function queryDOMViaCDP(selector: string, property?: string): Promise<unknown[]> {
  const browser = await getCDPBrowser();

  try {
    const page = await findLocalDevPage(browser);

    const result = await page.evaluate(
      (sel: string, prop: string | undefined) => {
        const elements = Array.from(document.querySelectorAll(sel));

        return elements.map((el) => {
          if (prop) {
            return (el as unknown as Record<string, unknown>)[prop];
          }

          return {
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            textContent: el.textContent?.trim().slice(0, 100),
          };
        });
      },
      selector,
      property
    );

    return result;
  } finally {
    await browser.disconnect();
  }
}

// Maximum allowed code length for CDP execution
const MAX_CDP_CODE_LENGTH = 10000;

/**
 * Execute JavaScript in the page context
 *
 * SECURITY: This function executes arbitrary JavaScript via CDP.
 * It is intended for development/debugging only and includes guards:
 * - Production environment check
 * - Code length limit
 * - Type validation
 */
export async function execJSViaCDP(code: string): Promise<unknown> {
  // Security: Block in production environments
  if (process.env.NODE_ENV === 'production') {
    throw new Error('execJSViaCDP is disabled in production for security reasons');
  }

  // Security: Validate code is a string
  if (typeof code !== 'string') {
    throw new Error('Code must be a string');
  }

  // Security: Limit code length to prevent abuse
  if (code.length > MAX_CDP_CODE_LENGTH) {
    throw new Error(`Code exceeds maximum length of ${MAX_CDP_CODE_LENGTH} characters`);
  }

  const browser = await getCDPBrowser();

  try {
    const page = await findLocalDevPage(browser);

    // Use evaluate to run code in page context
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const result = await page.evaluate((jsCode: string) => {
      // Intentional dynamic code execution for dev tools
      return Function(`"use strict"; return (${jsCode})`)();
    }, code);

    return result;
  } finally {
    await browser.disconnect();
  }
}

/**
 * Get network requests from the page
 */
export async function getNetworkRequestsViaCDP(options?: { filter?: string }): Promise<
  Array<{
    url: string;
    method: string;
    status?: number;
    statusText?: string;
    resourceType?: string;
    timestamp: number;
  }>
> {
  const browser = await getCDPBrowser();

  try {
    const page = await findLocalDevPage(browser);

    const requests: Array<{
      url: string;
      method: string;
      status?: number;
      statusText?: string;
      resourceType?: string;
      timestamp: number;
    }> = [];

    // Listen for requests
    page.on('request', (request: HTTPRequest) => {
      const url = request.url();

      // Apply filter if provided
      if (options?.filter && !url.includes(options.filter)) {
        return;
      }

      requests.push({
        url,
        method: request.method(),
        resourceType: request.resourceType(),
        timestamp: Date.now(),
      });
    });

    page.on('response', (response: HTTPResponse) => {
      const url = response.url();

      // Find matching request
      const request = requests.find((r) => r.url === url && !r.status);

      if (request) {
        request.status = response.status();
        request.statusText = response.statusText();
      }
    });

    // Wait a bit to collect requests
    await new Promise((resolve) => setTimeout(resolve, NETWORK_REQUEST_COLLECT_DELAY_MS));

    return requests;
  } finally {
    await browser.disconnect();
  }
}

/**
 * Get page performance metrics
 */
export async function getPerformanceMetricsViaCDP(): Promise<{
  metrics: Metrics;
  timings: {
    domContentLoaded: number;
    loadComplete: number;
    domInteractive: number;
    firstPaint: number | undefined;
    firstContentfulPaint: number | undefined;
  };
}> {
  const browser = await getCDPBrowser();

  try {
    const page = await findLocalDevPage(browser);

    const metrics = await page.metrics();

    const performanceTimings = await page.evaluate(() => {
      const perfData = window.performance.timing;
      const navigation = window.performance.getEntriesByType(
        'navigation'
      )[0] as PerformanceNavigationTiming;

      return {
        domContentLoaded:
          navigation?.domContentLoadedEventEnd - navigation?.domContentLoadedEventStart,
        loadComplete: navigation?.loadEventEnd - navigation?.loadEventStart,
        domInteractive: perfData.domInteractive - perfData.navigationStart,
        firstPaint: performance.getEntriesByType('paint').find((e) => e.name === 'first-paint')
          ?.startTime,
        firstContentfulPaint: performance
          .getEntriesByType('paint')
          .find((e) => e.name === 'first-contentful-paint')?.startTime,
      };
    });

    return {
      metrics,
      timings: performanceTimings,
    };
  } finally {
    await browser.disconnect();
  }
}

/**
 * Test CDP connection and return browser info
 */
export async function testCDPConnection(): Promise<{
  connected: boolean;
  browserVersion?: string;
  pages?: Array<{ url: string; title: string }>;
  error?: string;
}> {
  try {
    const response = await fetch(`${CDP_URL}/json/version`);
    const versionInfo = await response.json();

    const browser = await getCDPBrowser();
    const pages = await browser.pages();

    const pageInfo = await Promise.all(
      pages.map(async (page) => ({
        url: page.url(),
        title: await page.title(),
      }))
    );

    await browser.disconnect();

    return {
      connected: true,
      browserVersion: versionInfo.Browser,
      pages: pageInfo,
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
