// @vitest-environment node

/**
 * E2E Harness Helper Tests
 *
 * The _harness module is itself an e2e fixture (it spawns a daemon and a
 * static HTTP server), but it exports a handful of pure helpers that are
 * worth unit-testing — they're load-bearing for every e2e test in the
 * project, so a regression in any of them quietly corrupts every test
 * downstream.
 *
 * What's covered:
 *   - pngDimensions reads from the PNG IHDR chunk at offsets 16/20.
 *     Verified against a hand-constructed minimal PNG so a future change
 *     in the offsets is caught locally before it shows up as "all
 *     screenshots have width=0" in CI.
 *   - decodeScreenshot round-trips base64 → Buffer.
 *   - freePort returns a port that is actually free at call time and
 *     differs across calls (no flaky in-use port handed out twice).
 *   - DaemonReqError preserves action / data / response for callers that
 *     want richer error context.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DaemonReqError, decodeScreenshot, freePort, pngDimensions } from './_harness';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pngDimensions', () => {
  it('reads width/height from a minimal PNG IHDR chunk', () => {
    const buf = Buffer.alloc(32);
    // PNG signature (not strictly required for offset reading but realistic)
    buf.writeUInt8(0x89, 0);
    buf.write('PNG\r\n\x1a\n', 1, 'binary');
    // IHDR length = 13
    buf.writeUInt32BE(13, 8);
    buf.write('IHDR', 12);
    buf.writeUInt32BE(1280, 16);
    buf.writeUInt32BE(720, 20);

    expect(pngDimensions(buf)).toEqual({ width: 1280, height: 720 });
  });

  it('handles square images', () => {
    const buf = Buffer.alloc(32);
    buf.writeUInt32BE(512, 16);
    buf.writeUInt32BE(512, 20);
    expect(pngDimensions(buf)).toEqual({ width: 512, height: 512 });
  });
});

describe('decodeScreenshot', () => {
  it('round-trips base64 to Buffer', () => {
    const original = Buffer.from('PNG-PAYLOAD-MOCK\x00\x01\xff');
    const encoded = original.toString('base64');
    const decoded = decodeScreenshot(encoded);
    expect(decoded.equals(original)).toBe(true);
  });

  it('produces an empty Buffer for empty input', () => {
    expect(decodeScreenshot('').length).toBe(0);
  });
});

describe('freePort', () => {
  it('returns a number in the ephemeral port range', async () => {
    const port = await freePort();
    expect(port).toBeGreaterThanOrEqual(1024);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it('returns a port that is actually bindable when called', async () => {
    // The contract is "this port was free when we asked"; the OS may
    // hand the same number to someone else after we release it. Verify
    // we can re-bind it back-to-back to catch any leaked listener.
    const port = await freePort();
    const http = await import('http');
    const server = http.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolve());
    });
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('ports differ across rapid successive calls (no stale cache)', async () => {
    const ports = new Set<number>();
    for (let i = 0; i < 5; i++) {
      ports.add(await freePort());
    }
    // Not strictly guaranteed by the OS, but on every modern platform
    // ephemeral ports cycle so two consecutive calls almost always differ.
    // Allow some duplicates (size > 1 is the meaningful invariant).
    expect(ports.size).toBeGreaterThan(1);
  });
});

describe('DaemonReqError', () => {
  it('captures action and response on the error instance', () => {
    const err = new DaemonReqError('snapshot', {
      ok: false,
      error: 'something went wrong',
      data: { failureScreenshot: '/tmp/x.png' },
    });
    expect(err.action).toBe('snapshot');
    expect(err.message).toBe('something went wrong');
    expect(err.response.ok).toBe(false);
    expect(err.data).toEqual({ failureScreenshot: '/tmp/x.png' });
    expect(err.name).toBe('DaemonReqError');
  });

  it('falls back to a generic message when the daemon supplies none', () => {
    const err = new DaemonReqError('click-ref', { ok: false });
    expect(err.message).toBe('daemon click-ref failed');
  });
});
