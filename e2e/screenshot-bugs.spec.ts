/**
 * Screenshot Feature — TDD Suite
 *
 * Covers the four daemon paths the CLI exposes:
 *   - hifi single screenshot (Playwright on the persistent page)
 *   - --selector element capture
 *   - --full-page scrollable capture
 *   - --viewport sizing (preset + WxH)
 *   - --responsive multi-breakpoint
 *   - screenshot-devices (named device presets)
 *
 * Each test runs against a temp project root with a fresh daemon.
 *
 * Run only this file:
 *   pnpm exec playwright test e2e/screenshot-bugs.spec.ts --project=chromium
 */

import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { cli, daemonReq, decodeScreenshot, makeFixture, pngDimensions } from './_harness.js';

// Visual artifacts saved here so a human (or Claude) can eyeball them after
// the test run. Cleared on start so each run produces a clean set.
const ARTIFACT_DIR = '/tmp/sweetlink-e2e-artifacts/screenshot';
function saveArtifact(name: string, png: Buffer): void {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACT_DIR, name), png);
}

// ============================================================================
// Fixtures
// ============================================================================

function shortPage(): string {
  return `<!DOCTYPE html>
<html><head><title>Short</title><style>body{margin:0;font-family:sans-serif}#hero{height:200px;background:#a4f;color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px}button{margin:20px;padding:10px 24px}</style></head>
<body>
<div id="hero">HERO</div>
<button id="b">Click me</button>
</body></html>`;
}

function tallPage(): string {
  return `<!DOCTYPE html>
<html><head><title>Tall</title></head>
<body style="margin:0">
<div style="height:3000px;background:linear-gradient(red,blue)"></div>
</body></html>`;
}

// ============================================================================
// Specs
// ============================================================================

test.describe.configure({ mode: 'serial', timeout: 60_000 });

test.describe('Screenshot — happy path baselines', () => {
  test('hifi screenshot returns viewport-sized PNG', async () => {
    const fx = await makeFixture(shortPage());
    try {
      const data = (await daemonReq(fx.daemon, 'screenshot')) as {
        screenshot: string;
        width: number;
        height: number;
      };
      const png = decodeScreenshot(data.screenshot);
      saveArtifact('hifi-default.png', png);
      const dims = pngDimensions(png);
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
      // PNG magic bytes
      expect(png.subarray(0, 4).toString('hex')).toBe('89504e47');
    } finally {
      await fx.cleanup();
    }
  });

  test('--selector captures the element bounds (small image)', async () => {
    const fx = await makeFixture(shortPage());
    try {
      const data = (await daemonReq(fx.daemon, 'screenshot', {
        selector: '#b',
      })) as { screenshot: string; width: number; height: number };
      const png = decodeScreenshot(data.screenshot);
      saveArtifact('selector-button.png', png);
      const dims = pngDimensions(png);
      // Button is much smaller than viewport
      expect(dims.width).toBeLessThan(300);
      expect(dims.height).toBeLessThan(100);
    } finally {
      await fx.cleanup();
    }
  });

  test('--viewport WxH applies the requested size', async () => {
    const fx = await makeFixture(shortPage());
    try {
      const data = (await daemonReq(fx.daemon, 'screenshot', {
        viewport: '375x600',
      })) as { screenshot: string };
      const png = decodeScreenshot(data.screenshot);
      saveArtifact('viewport-375x600.png', png);
      const dims = pngDimensions(png);
      expect(dims.width).toBe(375);
      expect(dims.height).toBe(600);
    } finally {
      await fx.cleanup();
    }
  });

  test('--viewport mobile preset gives 375x667', async () => {
    const fx = await makeFixture(shortPage());
    try {
      const data = (await daemonReq(fx.daemon, 'screenshot', {
        viewport: 'mobile',
      })) as { screenshot: string };
      const png = decodeScreenshot(data.screenshot);
      saveArtifact('viewport-mobile.png', png);
      const dims = pngDimensions(png);
      expect(dims.width).toBe(375);
      expect(dims.height).toBe(667);
    } finally {
      await fx.cleanup();
    }
  });

  test('screenshot-devices captures multiple named presets', async () => {
    const fx = await makeFixture(shortPage());
    try {
      const data = (await daemonReq(fx.daemon, 'screenshot-devices', {
        devices: ['iphone-14', 'desktop'],
      })) as {
        screenshots: Array<{ device: string; width: number; height: number; screenshot: string }>;
      };
      expect(data.screenshots).toHaveLength(2);
      const iphone = data.screenshots.find((s) => /iphone/i.test(s.device));
      const desktop = data.screenshots.find((s) => /desktop/i.test(s.device));
      expect(iphone).toBeDefined();
      expect(desktop).toBeDefined();
      const iphoneDims = pngDimensions(decodeScreenshot(iphone!.screenshot));
      expect(iphoneDims.width).toBe(iphone!.width);
      expect(iphoneDims.height).toBe(iphone!.height);
      saveArtifact('device-iphone14.png', decodeScreenshot(iphone!.screenshot));
      saveArtifact('device-desktop.png', decodeScreenshot(desktop!.screenshot));
    } finally {
      await fx.cleanup();
    }
  });

  test('--responsive produces 3 breakpoints with matching PNG dims', async () => {
    const fx = await makeFixture(shortPage());
    try {
      const data = (await daemonReq(fx.daemon, 'screenshot-responsive', {})) as {
        screenshots: Array<{ width: number; height: number; screenshot: string; label: string }>;
      };
      expect(data.screenshots.length).toBe(3);
      const widths = data.screenshots.map((s) => s.width).sort((a, b) => a - b);
      expect(widths).toEqual([375, 768, 1280]);
      // Reported width/height should match the actual PNG.
      for (const s of data.screenshots) {
        const dims = pngDimensions(decodeScreenshot(s.screenshot));
        expect(dims.width, `${s.label} width mismatch`).toBe(s.width);
        expect(dims.height, `${s.label} height mismatch`).toBe(s.height);
        saveArtifact(`responsive-${s.label}.png`, decodeScreenshot(s.screenshot));
      }
    } finally {
      await fx.cleanup();
    }
  });

  test('CLI `screenshot --hifi --output` writes a valid PNG to disk', async () => {
    const fx = await makeFixture(shortPage());
    const outPath = `${fx.projectRoot}/cli-out.png`;
    try {
      const result = await cli(
        ['screenshot', '--hifi', '--url', fx.url, '--output', outPath],
        fx.projectRoot
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(fs.existsSync(outPath)).toBe(true);
      const buf = fs.readFileSync(outPath);
      expect(buf.subarray(0, 4).toString('hex')).toBe('89504e47');
      expect(buf.byteLength).toBeGreaterThan(1000);
    } finally {
      await fx.cleanup();
    }
  });
});

test.describe('Screenshot — known bugs (TDD: drop .fail when fixed)', () => {
  // ----------------------------------------------------------------------
  // Bug F: --full-page reports VIEWPORT dimensions, not actual capture.
  // Fixture has a 3000px-tall body. The PNG is correctly 1512x3000 but
  // daemon response has width=1512, height=982 (DEFAULT_VIEWPORT). The
  // dimensions field should reflect the captured image, not the viewport.
  // ----------------------------------------------------------------------
  test('BUG F — --full-page response dims match the actual PNG, not viewport', async () => {
    const fx = await makeFixture(tallPage());
    try {
      const data = (await daemonReq(fx.daemon, 'screenshot', {
        fullPage: true,
      })) as { screenshot: string; width: number; height: number };
      const png = decodeScreenshot(data.screenshot);
      const dims = pngDimensions(png);
      // Sanity: PNG itself captured the full 3000px.
      expect(dims.height).toBeGreaterThanOrEqual(2900);
      // Bug: daemon-reported height should equal the actual PNG height.
      expect(data.height).toBe(dims.height);
      expect(data.width).toBe(dims.width);
      saveArtifact('full-page-tall.png', png);
    } finally {
      await fx.cleanup();
    }
  });
});
