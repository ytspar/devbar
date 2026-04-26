/**
 * Visual Diff — TDD Suite
 *
 * Compares two PNG buffers byte-by-byte. Identical inputs → 0% mismatch.
 * The implementation is byte-level (not pixel-level), but PNG encoding is
 * deterministic for identical pixel data, so this still gives meaningful
 * pass/fail signals for screenshot regression testing.
 *
 * NOTE: any change in pixel content tends to produce a large compressed-byte
 * diff because the deflate encoder amplifies even small differences. So the
 * mismatchPercentage is closer to a binary "same / not-same" indicator than
 * a graded similarity score.
 */

import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { daemonReq, decodeScreenshot, makeFixture } from './_harness.js';

const ARTIFACT_DIR = '/tmp/sweetlink-e2e-artifacts/visual-diff';

function visualPage(): string {
  return `<!DOCTYPE html><html><body style="margin:0">
<div id="hero" style="height:200px;background:linear-gradient(45deg,#a4f,#4fa)"></div>
<button id="b" style="margin:20px">Click me</button>
</body></html>`;
}

test.describe.configure({ mode: 'serial', timeout: 60_000 });

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test('identical screenshot bytes → 0% mismatch, pass=true', async () => {
  const fx = await makeFixture(visualPage());
  try {
    const a = (await daemonReq(fx.daemon, 'screenshot')) as { screenshot: string };
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'identical-A.png'), decodeScreenshot(a.screenshot));
    const result = (await daemonReq(fx.daemon, 'visual-diff', {
      baseline: a.screenshot, current: a.screenshot,
    })) as { mismatchPercentage: number; mismatchCount: number; pass: boolean };
    expect(result.mismatchPercentage).toBe(0);
    expect(result.mismatchCount).toBe(0);
    expect(result.pass).toBe(true);
  } finally {
    await fx.cleanup();
  }
});

test('two captures of the same static page → 0% mismatch (deterministic encoding)', async () => {
  const fx = await makeFixture(visualPage());
  try {
    const a = (await daemonReq(fx.daemon, 'screenshot')) as { screenshot: string };
    const b = (await daemonReq(fx.daemon, 'screenshot')) as { screenshot: string };
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'consecutive-A.png'), decodeScreenshot(a.screenshot));
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'consecutive-B.png'), decodeScreenshot(b.screenshot));
    const result = (await daemonReq(fx.daemon, 'visual-diff', {
      baseline: a.screenshot, current: b.screenshot,
    })) as { mismatchPercentage: number; pass: boolean };
    // Static page, same viewport, no animations → bytes should match.
    expect(result.mismatchPercentage).toBeLessThan(1);
    expect(result.pass).toBe(true);
  } finally {
    await fx.cleanup();
  }
});

test('different viewport produces high mismatch + pass=false', async () => {
  const fx = await makeFixture(visualPage());
  try {
    const baseline = (await daemonReq(fx.daemon, 'screenshot')) as { screenshot: string };
    const tiny = (await daemonReq(fx.daemon, 'screenshot', {
      viewport: '375x600',
    })) as { screenshot: string };
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'diff-baseline.png'), decodeScreenshot(baseline.screenshot));
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'diff-tiny.png'), decodeScreenshot(tiny.screenshot));
    const result = (await daemonReq(fx.daemon, 'visual-diff', {
      baseline: baseline.screenshot, current: tiny.screenshot,
    })) as { mismatchPercentage: number; pass: boolean };
    expect(result.mismatchPercentage).toBeGreaterThan(50);
    expect(result.pass).toBe(false);
  } finally {
    await fx.cleanup();
  }
});

test('threshold is honored: pass when mismatch <= threshold', async () => {
  const fx = await makeFixture(visualPage());
  try {
    const a = (await daemonReq(fx.daemon, 'screenshot')) as { screenshot: string };
    const b = (await daemonReq(fx.daemon, 'screenshot', {
      viewport: '1280x800',
    })) as { screenshot: string };
    const strict = (await daemonReq(fx.daemon, 'visual-diff', {
      baseline: a.screenshot, current: b.screenshot, threshold: 0,
    })) as { pass: boolean };
    const lenient = (await daemonReq(fx.daemon, 'visual-diff', {
      baseline: a.screenshot, current: b.screenshot, threshold: 1,
    })) as { pass: boolean };
    expect(strict.pass).toBe(false); // any mismatch fails strict
    expect(lenient.pass).toBe(true); // 100% threshold accepts any diff
  } finally {
    await fx.cleanup();
  }
});

test('missing baseline/current parameters return clear error', async () => {
  const fx = await makeFixture(visualPage());
  try {
    let threw = false;
    try {
      await daemonReq(fx.daemon, 'visual-diff', {});
    } catch (e) {
      threw = true;
      expect((e as Error).message.toLowerCase()).toContain('baseline');
    }
    expect(threw).toBe(true);
  } finally {
    await fx.cleanup();
  }
});
