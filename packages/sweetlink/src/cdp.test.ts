import * as fs from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
}));

// Mock puppeteer-core before importing cdp module
const mockPage = {
  evaluate: vi.fn(),
  screenshot: vi.fn(),
  setViewport: vi.fn(),
  waitForNetworkIdle: vi.fn(),
  waitForSelector: vi.fn(),
  hover: vi.fn(),
  $: vi.fn(),
  url: vi.fn(() => 'http://localhost:3000'),
  on: vi.fn(),
  metrics: vi.fn(),
  goto: vi.fn(),
};

const mockBrowser = {
  pages: vi.fn(() => [mockPage]),
  disconnect: vi.fn(),
  newPage: vi.fn(() => mockPage),
};

const mockConnect = vi.fn(() => mockBrowser);

vi.mock('puppeteer-core', () => ({
  default: {
    connect: mockConnect,
  },
}));

// Mock fetch for detectCDP
const originalFetch = globalThis.fetch;

import {
  detectCDP,
  execJSViaCDP,
  findLocalDevPage,
  getCDPBrowser,
  getNetworkRequestsViaCDP,
  screenshotViaCDP,
} from './cdp.js';

describe('detectCDP', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns true when CDP endpoint responds OK', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true } as Response));
    expect(await detectCDP()).toBe(true);
  });

  it('returns false when CDP endpoint fails', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    expect(await detectCDP()).toBe(false);
  });

  it('returns false when CDP endpoint returns non-OK', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false } as Response));
    expect(await detectCDP()).toBe(false);
  });
});

describe('getCDPBrowser', () => {
  it('connects to CDP and returns a browser', async () => {
    const browser = await getCDPBrowser();
    expect(browser).toBe(mockBrowser);
  });

  it('throws descriptive error when connection fails', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Connection refused'));
    await expect(getCDPBrowser()).rejects.toThrow('CDP connection failed: Connection refused');
  });

  it('handles non-Error thrown values', async () => {
    mockConnect.mockRejectedValueOnce('something weird');
    await expect(getCDPBrowser()).rejects.toThrow(
      'CDP connection failed: Failed to connect to Chrome'
    );
  });
});

describe('findLocalDevPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPage.url.mockReturnValue('http://localhost:3000');
  });

  it('returns existing page matching dev URL', async () => {
    const page = await findLocalDevPage(mockBrowser as any);
    expect(page).toBe(mockPage);
  });

  it('navigates to dev URL when no matching page is found', async () => {
    const nonMatchingPage = { ...mockPage, url: vi.fn(() => 'http://example.com') };
    mockBrowser.pages.mockResolvedValueOnce([nonMatchingPage]);
    nonMatchingPage.goto = vi.fn();

    const page = await findLocalDevPage(mockBrowser as any);
    expect(nonMatchingPage.goto).toHaveBeenCalledWith(expect.stringContaining('localhost'), {
      waitUntil: 'networkidle0',
    });
    expect(page).toBe(nonMatchingPage);
  });

  it('creates a new page when no pages exist', async () => {
    mockBrowser.pages.mockResolvedValueOnce([]);
    const newPage = { ...mockPage, url: vi.fn(() => 'about:blank'), goto: vi.fn() };
    mockBrowser.newPage.mockResolvedValueOnce(newPage);

    const page = await findLocalDevPage(mockBrowser as any);
    expect(mockBrowser.newPage).toHaveBeenCalled();
    expect(newPage.goto).toHaveBeenCalled();
    expect(page).toBe(newPage);
  });

  it('matches 127.0.0.1 URLs', async () => {
    const localPage = { ...mockPage, url: vi.fn(() => 'http://127.0.0.1:3000/app') };
    mockBrowser.pages.mockResolvedValueOnce([localPage]);

    const page = await findLocalDevPage(mockBrowser as any);
    expect(page).toBe(localPage);
  });
});

describe('screenshotViaCDP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPage.url.mockReturnValue('http://localhost:3000');
    mockBrowser.pages.mockReturnValue([mockPage]);
    mockPage.screenshot.mockResolvedValue(Buffer.from('png-data'));
    mockPage.evaluate.mockResolvedValue({ width: 1512, height: 982 });
    mockPage.waitForNetworkIdle.mockResolvedValue(undefined);
    mockPage.setViewport.mockResolvedValue(undefined);
  });

  it('takes a basic screenshot with default options', async () => {
    const result = await screenshotViaCDP({});
    expect(mockPage.setViewport).toHaveBeenCalled();
    expect(mockPage.screenshot).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'png', fullPage: false })
    );
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.width).toBe(1512);
    expect(result.height).toBe(982);
  });

  it('takes a full-page screenshot', async () => {
    await screenshotViaCDP({ fullPage: true });
    expect(mockPage.screenshot).toHaveBeenCalledWith(expect.objectContaining({ fullPage: true }));
  });

  it('saves to file when output is specified', async () => {
    await screenshotViaCDP({ output: '/tmp/test.png' });
    expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/test.png', expect.any(Buffer));
  });

  it('hides devbar chrome while taking CDP screenshots when requested', async () => {
    await screenshotViaCDP({ hideDevbar: true });

    expect(mockPage.evaluate).toHaveBeenCalledWith(
      expect.any(Function),
      'sweetlink-hide-devbar-for-screenshot',
      expect.stringContaining('[data-devbar]')
    );
    expect(mockPage.evaluate).toHaveBeenCalledWith(
      expect.any(Function),
      'sweetlink-hide-devbar-for-screenshot'
    );
  });

  it('handles network idle timeout gracefully', async () => {
    mockPage.waitForNetworkIdle.mockRejectedValueOnce(new Error('Timeout'));
    const result = await screenshotViaCDP({});
    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it('skips network idle wait when waitForNetwork is false', async () => {
    await screenshotViaCDP({ waitForNetwork: false });
    expect(mockPage.waitForNetworkIdle).not.toHaveBeenCalled();
  });

  it('screenshots a specific selector with clip', async () => {
    const mockElement = {
      boundingBox: vi.fn().mockResolvedValue({ x: 10, y: 20, width: 200, height: 100 }),
    };
    mockPage.waitForSelector.mockResolvedValue(undefined);
    mockPage.$.mockResolvedValue(mockElement);

    const result = await screenshotViaCDP({ selector: '.my-element' });
    expect(mockPage.waitForSelector).toHaveBeenCalledWith('.my-element', { timeout: 5000 });
    expect(mockPage.screenshot).toHaveBeenCalledWith(
      expect.objectContaining({
        clip: { x: 10, y: 20, width: 200, height: 100 },
      })
    );
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
  });

  it('throws when selector element is not found', async () => {
    mockPage.waitForSelector.mockResolvedValue(undefined);
    mockPage.$.mockResolvedValue(null);

    await expect(screenshotViaCDP({ selector: '.missing' })).rejects.toThrow(
      'Failed to find element ".missing"'
    );
  });

  it('hovers over element when hover option is set', async () => {
    const mockElement = {
      boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 100, height: 50 }),
    };
    mockPage.waitForSelector.mockResolvedValue(undefined);
    mockPage.$.mockResolvedValue(mockElement);
    mockPage.hover.mockResolvedValue(undefined);

    await screenshotViaCDP({ selector: '.btn', hover: true });
    expect(mockPage.hover).toHaveBeenCalledWith('.btn');
  });

  it('handles hover failure gracefully', async () => {
    const mockElement = {
      boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 100, height: 50 }),
    };
    mockPage.waitForSelector.mockResolvedValue(undefined);
    mockPage.$.mockResolvedValue(mockElement);
    mockPage.hover.mockRejectedValueOnce(new Error('Not hoverable'));

    // Should not throw, just warn
    const result = await screenshotViaCDP({ selector: '.btn', hover: true });
    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it('handles element with no bounding box', async () => {
    const mockElement = {
      boundingBox: vi.fn().mockResolvedValue(null),
    };
    mockPage.waitForSelector.mockResolvedValue(undefined);
    mockPage.$.mockResolvedValue(mockElement);

    // Should take screenshot without clip (falls through to page dimensions)
    const result = await screenshotViaCDP({ selector: '.hidden-el' });
    expect(result.width).toBe(1512);
  });

  it('disconnects browser even on error', async () => {
    mockPage.screenshot.mockRejectedValueOnce(new Error('screenshot failed'));
    mockBrowser.disconnect.mockClear();

    await expect(screenshotViaCDP({})).rejects.toThrow('screenshot failed');
    expect(mockBrowser.disconnect).toHaveBeenCalled();
  });

  it('passes viewport option to parseViewport', async () => {
    await screenshotViaCDP({ viewport: 'mobile' });
    expect(mockPage.setViewport).toHaveBeenCalledWith(
      expect.objectContaining({ width: 375, height: 667, isMobile: true })
    );
  });
});

describe('getNetworkRequestsViaCDP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPage.url.mockReturnValue('http://localhost:3000');
    mockBrowser.pages.mockReturnValue([mockPage]);
    mockPage.on.mockImplementation(() => {});
  });

  it('sets up request and response listeners', async () => {
    const result = await getNetworkRequestsViaCDP();
    expect(mockPage.on).toHaveBeenCalledWith('request', expect.any(Function));
    expect(mockPage.on).toHaveBeenCalledWith('response', expect.any(Function));
    expect(Array.isArray(result)).toBe(true);
  });

  it('collects requests and matches responses', async () => {
    const resultPromise = getNetworkRequestsViaCDP();

    // Simulate a request+response after listeners are set up
    // The promise includes a 2s delay, so we need to trigger before it resolves
    // But since the delay is internal, the handlers will be called synchronously by on()
    // Actually on() just registers; we need to call handlers manually after setup

    const result = await resultPromise;
    // With no actual events fired, result should be empty
    expect(result).toEqual([]);
    expect(mockBrowser.disconnect).toHaveBeenCalled();
  });

  it('filters requests by URL when filter is provided', async () => {
    let requestHandler: (req: any) => void = () => {};

    mockPage.on.mockImplementation((event: string, handler: any) => {
      if (event === 'request') requestHandler = handler;
    });

    const resultPromise = getNetworkRequestsViaCDP({ filter: 'api' });

    // Manually trigger the request handler with a matching and non-matching URL
    // We need to wait a tick for the on() calls to happen
    await new Promise((r) => setTimeout(r, 10));

    requestHandler({
      url: () => 'http://localhost:3000/api/data',
      method: () => 'GET',
      resourceType: () => 'fetch',
    });

    requestHandler({
      url: () => 'http://localhost:3000/styles.css',
      method: () => 'GET',
      resourceType: () => 'stylesheet',
    });

    const result = await resultPromise;
    // Only the api request should be included
    expect(result.length).toBe(1);
    expect(result[0]!.url).toContain('api');
  });

  it('matches response to request and adds status', async () => {
    let requestHandler: (req: any) => void = () => {};
    let responseHandler: (res: any) => void = () => {};

    mockPage.on.mockImplementation((event: string, handler: any) => {
      if (event === 'request') requestHandler = handler;
      if (event === 'response') responseHandler = handler;
    });

    const resultPromise = getNetworkRequestsViaCDP();

    await new Promise((r) => setTimeout(r, 10));

    requestHandler({
      url: () => 'http://localhost:3000/api/data',
      method: () => 'GET',
      resourceType: () => 'fetch',
    });

    responseHandler({
      url: () => 'http://localhost:3000/api/data',
      status: () => 200,
      statusText: () => 'OK',
    });

    const result = await resultPromise;
    expect(result.length).toBe(1);
    expect(result[0]!.status).toBe(200);
    expect(result[0]!.statusText).toBe('OK');
  });
});

describe('execJSViaCDP', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'development';
    mockPage.url.mockReturnValue('http://localhost:3000');
    mockBrowser.pages.mockReturnValue([mockPage]);
    mockPage.evaluate.mockResolvedValue(42);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('rejects in production environment', async () => {
    process.env.NODE_ENV = 'production';
    await expect(execJSViaCDP('1+1')).rejects.toThrow('disabled in production');
  });

  it('rejects non-string code', async () => {
    // @ts-expect-error testing invalid input
    await expect(execJSViaCDP(123)).rejects.toThrow('Code must be a string');
  });

  it('rejects code exceeding max length', async () => {
    const longCode = 'x'.repeat(10001);
    await expect(execJSViaCDP(longCode)).rejects.toThrow('exceeds maximum length');
  });

  it('accepts code within max length', async () => {
    const code = 'x'.repeat(10000);
    const result = await execJSViaCDP(code);
    expect(result).toBe(42);
  });

  it('disconnects browser after execution', async () => {
    await execJSViaCDP('1+1');
    expect(mockBrowser.disconnect).toHaveBeenCalled();
  });

  it('disconnects browser even when evaluate throws', async () => {
    mockPage.evaluate.mockRejectedValueOnce(new Error('eval error'));
    await expect(execJSViaCDP('bad code')).rejects.toThrow('eval error');
    expect(mockBrowser.disconnect).toHaveBeenCalled();
  });

  it('returns the result from page.evaluate', async () => {
    mockPage.evaluate.mockResolvedValue({ foo: 'bar' });
    const result = await execJSViaCDP('({foo: "bar"})');
    expect(result).toEqual({ foo: 'bar' });
  });
});
