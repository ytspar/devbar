import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
};

const mockBrowser = {
  pages: vi.fn(() => [mockPage]),
  disconnect: vi.fn(),
  newPage: vi.fn(() => mockPage),
};

vi.mock('puppeteer-core', () => ({
  default: {
    connect: vi.fn(() => mockBrowser),
  },
}));

// Mock fetch for detectCDP
const originalFetch = globalThis.fetch;

import { detectCDP, execJSViaCDP, getCDPBrowser } from './cdp.js';

describe('detectCDP', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns true when CDP endpoint responds OK', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true } as Response)
    );
    expect(await detectCDP()).toBe(true);
  });

  it('returns false when CDP endpoint fails', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    expect(await detectCDP()).toBe(false);
  });

  it('returns false when CDP endpoint returns non-OK', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: false } as Response)
    );
    expect(await detectCDP()).toBe(false);
  });
});

describe('getCDPBrowser', () => {
  it('connects to CDP and returns a browser', async () => {
    const browser = await getCDPBrowser();
    expect(browser).toBe(mockBrowser);
  });
});

describe('execJSViaCDP', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
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
    mockBrowser.disconnect.mockClear();
    await execJSViaCDP('1+1');
    expect(mockBrowser.disconnect).toHaveBeenCalled();
  });
});
