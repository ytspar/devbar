// @vitest-environment node

/**
 * Playwright Integration Tests
 *
 * Tests getBrowser() and screenshotViaPlaywright() with fully mocked
 * Playwright module, fs, and path. Covers CDP connect path, launch
 * fallback, selector handling, hover, viewport, output directory
 * creation, and error paths.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted so vi.mock factories can reference them
// ---------------------------------------------------------------------------

const { mockLocator, mockPage, mockContext, mockBrowser, mockChromium } = vi.hoisted(() => {
  const mkLocator = () => ({
    first: vi.fn(),
    waitFor: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('element-png')),
    boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 200, height: 100 }),
  });

  const locator = mkLocator();
  // first() returns an object with the same methods (Playwright's Locator API)
  locator.first.mockReturnValue(locator);

  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    url: vi.fn(() => 'http://localhost:3000'),
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    viewportSize: vi.fn(() => ({ width: 1512, height: 982 })),
    locator: vi.fn(() => locator),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('full-png')),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  };

  const context = {
    pages: vi.fn(() => [page]),
    newPage: vi.fn().mockResolvedValue(page),
  };

  const browser = {
    contexts: vi.fn(() => [context]),
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const chromium = {
    connectOverCDP: vi.fn().mockResolvedValue(browser),
    launch: vi.fn().mockResolvedValue(browser),
  };

  return { mockLocator: locator, mockPage: page, mockContext: context, mockBrowser: browser, mockChromium: chromium };
});

vi.mock('playwright', () => ({
  chromium: mockChromium,
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { getBrowser, screenshotViaPlaywright } from './playwright.js';
import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Suppress console output during tests */
function silenceConsole() {
  const spies = {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };
  return spies;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getBrowser', () => {
  let consoleSpy: ReturnType<typeof silenceConsole>;

  beforeEach(() => {
    consoleSpy = silenceConsole();
    vi.clearAllMocks();

    // Re-establish default mock behavior after clearAllMocks
    mockLocator.first.mockReturnValue(mockLocator);
    mockLocator.waitFor.mockResolvedValue(undefined);
    mockLocator.hover.mockResolvedValue(undefined);
    mockLocator.screenshot.mockResolvedValue(Buffer.from('element-png'));
    mockLocator.boundingBox.mockResolvedValue({ x: 0, y: 0, width: 200, height: 100 });

    mockPage.goto.mockResolvedValue(undefined);
    mockPage.url.mockReturnValue('http://localhost:3000');
    mockPage.setViewportSize.mockResolvedValue(undefined);
    mockPage.viewportSize.mockReturnValue({ width: 1512, height: 982 });
    mockPage.locator.mockReturnValue(mockLocator);
    mockPage.screenshot.mockResolvedValue(Buffer.from('full-png'));
    mockPage.waitForTimeout.mockResolvedValue(undefined);

    mockContext.pages.mockReturnValue([mockPage]);
    mockContext.newPage.mockResolvedValue(mockPage);

    mockBrowser.contexts.mockReturnValue([mockContext]);
    mockBrowser.newContext.mockResolvedValue(mockContext);
    mockBrowser.close.mockResolvedValue(undefined);

    mockChromium.connectOverCDP.mockResolvedValue(mockBrowser);
    mockChromium.launch.mockResolvedValue(mockBrowser);

    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  // ========================================================================
  // CDP connect path (happy path)
  // ========================================================================

  describe('CDP connect path', () => {
    it('connects to existing Chrome via CDP and returns isNew=false', async () => {
      const result = await getBrowser();
      expect(result.browser).toBe(mockBrowser);
      expect(result.page).toBe(mockPage);
      expect(result.isNew).toBe(false);
      expect(mockChromium.connectOverCDP).toHaveBeenCalledWith('http://localhost:9222');
    });

    it('reuses existing page when URL matches', async () => {
      mockPage.url.mockReturnValue('http://localhost:3000');
      const result = await getBrowser('http://localhost:3000');
      expect(result.page).toBe(mockPage);
      // Should NOT have navigated — page already has the URL
      expect(mockPage.goto).not.toHaveBeenCalled();
    });

    it('creates new page and navigates when no existing page matches URL', async () => {
      mockPage.url.mockReturnValue('http://localhost:9999');
      const newPage = { ...mockPage, url: vi.fn(() => 'http://localhost:4000') };
      mockContext.newPage.mockResolvedValue(newPage);

      const result = await getBrowser('http://localhost:4000');
      expect(mockContext.newPage).toHaveBeenCalled();
      expect(result.page).toBe(newPage);
      expect(newPage.goto).toHaveBeenCalledWith(
        'http://localhost:4000',
        expect.objectContaining({ waitUntil: 'domcontentloaded' }),
      );
    });

    it('creates a new context when no contexts exist', async () => {
      mockBrowser.contexts.mockReturnValue([]);
      const freshContext = {
        pages: vi.fn(() => []),
        newPage: vi.fn().mockResolvedValue(mockPage),
      };
      mockBrowser.newContext.mockResolvedValue(freshContext);

      const result = await getBrowser();
      expect(mockBrowser.newContext).toHaveBeenCalled();
      expect(result.isNew).toBe(false);
    });

    it('uses default URL (http://localhost:3000) when no url argument provided', async () => {
      mockPage.url.mockReturnValue('http://localhost:3000');
      const result = await getBrowser();
      expect(result.page).toBe(mockPage);
    });
  });

  // ========================================================================
  // Launch fallback path
  // ========================================================================

  describe('launch fallback', () => {
    beforeEach(() => {
      // Make CDP connection fail so we fall through to launch
      mockChromium.connectOverCDP.mockRejectedValue(new Error('ECONNREFUSED'));
    });

    it('launches a headless browser when CDP connection fails', async () => {
      const result = await getBrowser();
      expect(mockChromium.launch).toHaveBeenCalledWith(
        expect.objectContaining({ headless: true }),
      );
      expect(result.isNew).toBe(true);
    });

    it('creates a new context with the default viewport', async () => {
      await getBrowser();
      expect(mockBrowser.newContext).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: { width: 1512, height: 982 },
        }),
      );
    });

    it('navigates to the target URL after launch', async () => {
      await getBrowser('http://localhost:4000');
      expect(mockPage.goto).toHaveBeenCalledWith(
        'http://localhost:4000',
        expect.objectContaining({ waitUntil: 'domcontentloaded' }),
      );
    });

    it('does not throw when navigation times out during launch', async () => {
      mockPage.goto.mockRejectedValue(new Error('Navigation timeout'));

      // Should not throw — navigation errors are caught and logged
      const result = await getBrowser();
      expect(result.browser).toBe(mockBrowser);
      expect(result.isNew).toBe(true);
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('Navigation timeout or error'),
        expect.any(Error),
      );
    });
  });
});

// ===========================================================================
// screenshotViaPlaywright
// ===========================================================================

describe('screenshotViaPlaywright', () => {
  let consoleSpy: ReturnType<typeof silenceConsole>;

  beforeEach(() => {
    consoleSpy = silenceConsole();
    vi.clearAllMocks();

    // Re-establish default mock behavior after clearAllMocks
    mockLocator.first.mockReturnValue(mockLocator);
    mockLocator.waitFor.mockResolvedValue(undefined);
    mockLocator.hover.mockResolvedValue(undefined);
    mockLocator.screenshot.mockResolvedValue(Buffer.from('element-png'));
    mockLocator.boundingBox.mockResolvedValue({ x: 0, y: 0, width: 200, height: 100 });

    mockPage.goto.mockResolvedValue(undefined);
    mockPage.url.mockReturnValue('http://localhost:3000');
    mockPage.setViewportSize.mockResolvedValue(undefined);
    mockPage.viewportSize.mockReturnValue({ width: 1512, height: 982 });
    mockPage.locator.mockReturnValue(mockLocator);
    mockPage.screenshot.mockResolvedValue(Buffer.from('full-png'));
    mockPage.waitForTimeout.mockResolvedValue(undefined);

    mockContext.pages.mockReturnValue([mockPage]);
    mockContext.newPage.mockResolvedValue(mockPage);

    mockBrowser.contexts.mockReturnValue([mockContext]);
    mockBrowser.newContext.mockResolvedValue(mockContext);
    mockBrowser.close.mockResolvedValue(undefined);

    mockChromium.connectOverCDP.mockResolvedValue(mockBrowser);
    mockChromium.launch.mockResolvedValue(mockBrowser);

    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  // ========================================================================
  // Full page screenshot (no selector)
  // ========================================================================

  describe('full page screenshot', () => {
    it('returns buffer and viewport dimensions', async () => {
      const result = await screenshotViaPlaywright({});
      expect(result.buffer).toEqual(Buffer.from('full-png'));
      expect(result.width).toBe(1512);
      expect(result.height).toBe(982);
    });

    it('passes fullPage option to page.screenshot', async () => {
      await screenshotViaPlaywright({ fullPage: true });
      expect(mockPage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({ fullPage: true }),
      );
    });

    it('passes output path to page.screenshot', async () => {
      await screenshotViaPlaywright({ output: '/tmp/shots/screen.png' });
      expect(mockPage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/tmp/shots/screen.png' }),
      );
    });

    it('returns zero dimensions when viewportSize returns null', async () => {
      mockPage.viewportSize.mockReturnValue(null);
      const result = await screenshotViaPlaywright({});
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    });
  });

  // ========================================================================
  // Element screenshot (with selector)
  // ========================================================================

  describe('element screenshot', () => {
    it('takes screenshot of selected element', async () => {
      const result = await screenshotViaPlaywright({ selector: '#hero' });
      expect(mockPage.locator).toHaveBeenCalledWith('#hero');
      expect(mockLocator.screenshot).toHaveBeenCalled();
      expect(result.buffer).toEqual(Buffer.from('element-png'));
    });

    it('waits for selector to be visible', async () => {
      await screenshotViaPlaywright({ selector: '.card' });
      expect(mockLocator.waitFor).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'visible', timeout: 5000 }),
      );
    });

    it('returns element bounding box dimensions', async () => {
      mockLocator.boundingBox.mockResolvedValue({ x: 10, y: 20, width: 300, height: 150 });
      const result = await screenshotViaPlaywright({ selector: '.card' });
      expect(result.width).toBe(300);
      expect(result.height).toBe(150);
    });

    it('returns zero dimensions when boundingBox returns null', async () => {
      mockLocator.boundingBox.mockResolvedValue(null);
      const result = await screenshotViaPlaywright({ selector: '.card' });
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    });

    it('throws when selector is not found within timeout', async () => {
      mockLocator.waitFor.mockRejectedValue(new Error('Timeout 5000ms exceeded'));

      await expect(
        screenshotViaPlaywright({ selector: '.missing' }),
      ).rejects.toThrow('Timeout waiting for selector: .missing');
    });

    it('still closes browser when selector throws', async () => {
      mockLocator.waitFor.mockRejectedValue(new Error('Timeout'));

      await screenshotViaPlaywright({ selector: '.x' }).catch(() => {});

      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Hover
  // ========================================================================

  describe('hover', () => {
    it('hovers on the selected element when hover=true', async () => {
      await screenshotViaPlaywright({ selector: '.btn', hover: true });
      expect(mockLocator.hover).toHaveBeenCalled();
    });

    it('waits for transition delay after hover', async () => {
      await screenshotViaPlaywright({ selector: '.btn', hover: true });
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(300);
    });

    it('does not hover when hover=false', async () => {
      await screenshotViaPlaywright({ selector: '.btn', hover: false });
      expect(mockLocator.hover).not.toHaveBeenCalled();
    });

    it('does not hover when no selector is provided', async () => {
      await screenshotViaPlaywright({ hover: true });
      expect(mockLocator.hover).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Viewport
  // ========================================================================

  describe('viewport', () => {
    it('sets viewport when viewport option is provided', async () => {
      await screenshotViaPlaywright({ viewport: '800x600' });
      expect(mockPage.setViewportSize).toHaveBeenCalledWith({ width: 800, height: 600 });
    });

    it('handles mobile preset', async () => {
      await screenshotViaPlaywright({ viewport: 'mobile' });
      expect(mockPage.setViewportSize).toHaveBeenCalledWith({ width: 375, height: 667 });
    });

    it('does not set viewport when option is not provided', async () => {
      await screenshotViaPlaywright({});
      expect(mockPage.setViewportSize).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Output directory creation
  // ========================================================================

  describe('output directory', () => {
    it('creates directory when output path has non-existing parent', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await screenshotViaPlaywright({ output: '/tmp/new-dir/shot.png' });
      expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/new-dir', { recursive: true });
    });

    it('does not create directory when parent already exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      await screenshotViaPlaywright({ output: '/tmp/existing/shot.png' });
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('does not create directory when no output is specified', async () => {
      await screenshotViaPlaywright({});
      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Browser cleanup
  // ========================================================================

  describe('browser cleanup', () => {
    it('always closes the browser after a successful screenshot', async () => {
      await screenshotViaPlaywright({});
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('closes the browser even when an error occurs', async () => {
      mockPage.screenshot.mockRejectedValue(new Error('screenshot failed'));

      await screenshotViaPlaywright({}).catch(() => {});

      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // URL passthrough
  // ========================================================================

  describe('url option', () => {
    it('passes custom url to getBrowser', async () => {
      mockPage.url.mockReturnValue('http://localhost:4000');
      await screenshotViaPlaywright({ url: 'http://localhost:4000' });

      // The CDP path finds the page URL matches, so no navigation
      expect(mockChromium.connectOverCDP).toHaveBeenCalled();
    });
  });
});
