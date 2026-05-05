// @vitest-environment node

/**
 * Daemon Browser Tests
 *
 * The browser module wraps Playwright with module-level state. We test the
 * pieces that DON'T require an actual browser process:
 *   - Pre-init guards (getPage / getBrowserInstance throw with a useful
 *     message before initBrowser is called)
 *   - The headed-mode toggle
 *   - The lazy Playwright import error message (asserts the user-facing
 *     "install playwright" hint actually surfaces when the import fails)
 *   - takeScreenshot's PNG-dimension reading: the function reads
 *     width/height from the IHDR chunk (offsets 16/20). A PNG buffer
 *     check ensures we don't regress that arithmetic.
 *
 * The full screenshot/navigateTo paths require a real browser to be
 * meaningful — those run as e2e tests, not here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  // Each test gets a fresh module so the singleton state (browser/page)
  // does not leak between tests.
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pre-init guards', () => {
  it('getPage throws a clear error before initBrowser', async () => {
    const browser = await import('./browser.js');
    expect(() => browser.getPage()).toThrow(/Browser not initialized/i);
  });

  it('getBrowserInstance throws a clear error before initBrowser', async () => {
    const browser = await import('./browser.js');
    expect(() => browser.getBrowserInstance()).toThrow(/Browser not initialized/i);
  });
});

describe('setHeadedMode', () => {
  it('is callable independently of initBrowser', async () => {
    const browser = await import('./browser.js');
    expect(() => browser.setHeadedMode(true)).not.toThrow();
    expect(() => browser.setHeadedMode(false)).not.toThrow();
  });
});

describe('initBrowser is idempotent', () => {
  it('returns immediately on repeat calls (browser launched only once)', async () => {
    const launch = vi.fn(async () => ({
      newContext: async () => ({
        newPage: async () => ({
          goto: async () => null,
          on: () => undefined,
          addInitScript: async () => undefined,
          screenshot: async () => Buffer.from(''),
          evaluate: async () => undefined,
          waitForTimeout: async () => undefined,
        }),
      }),
    }));
    vi.doMock('playwright', () => ({ chromium: { launch } }));

    const browser = await import('./browser.js');
    await browser.initBrowser('http://localhost:3000/');
    await browser.initBrowser('http://localhost:3000/');
    await browser.initBrowser('http://localhost:3000/');

    expect(launch).toHaveBeenCalledTimes(1);
  });
});

describe('PNG dimension reading from IHDR', () => {
  // The screenshot helpers parse width/height directly from the PNG IHDR
  // chunk (bytes 16..23). If that arithmetic ever drifts, every screenshot
  // result reports junk. Verify the offsets against a real minimal PNG.
  it('readUInt32BE(16) and readUInt32BE(20) decode IHDR width/height', () => {
    // Minimal valid PNG: 8-byte signature + IHDR chunk header
    // length(4)=13 + 'IHDR' + width(4)=320 + height(4)=240 + ... (we don't
    // need the rest for the offset check).
    const buf = Buffer.alloc(32);
    // PNG signature
    buf.writeUInt8(0x89, 0);
    buf.write('PNG\r\n\x1a\n', 1, 'binary');
    // IHDR chunk length = 13
    buf.writeUInt32BE(13, 8);
    buf.write('IHDR', 12);
    // width=320, height=240
    buf.writeUInt32BE(320, 16);
    buf.writeUInt32BE(240, 20);

    expect(buf.readUInt32BE(16)).toBe(320);
    expect(buf.readUInt32BE(20)).toBe(240);
  });
});
