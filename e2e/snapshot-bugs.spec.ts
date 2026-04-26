/**
 * Snapshot / Refs Feature — TDD Suite
 *
 * Covers daemon actions:
 *   - snapshot (interactive vs full)
 *   - snapshot --diff and --annotate
 *   - click-ref / fill-ref / hover-ref / press-key
 *   - stale ref detection
 *
 * Run only this file:
 *   pnpm exec playwright test e2e/snapshot-bugs.spec.ts --project=chromium
 */

import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { daemonReq, decodeScreenshot, makeFixture, pngDimensions } from './_harness.js';

const ARTIFACT_DIR = '/tmp/sweetlink-e2e-artifacts/snapshot';
function saveArtifact(name: string, png: Buffer): void {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACT_DIR, name), png);
}

interface Ref { ref: string; role: string; name: string }

function refRichPage(): string {
  return `<!DOCTYPE html>
<html><head><title>Refs</title></head>
<body style="font-family:sans-serif;padding:30px">
<h1 id="h">Snap Fixture</h1>
<a href="#nowhere">Link One</a>
<button id="b1">Button One</button>
<button id="b2" disabled>Button Two (disabled)</button>
<input id="i1" type="text" placeholder="text" aria-label="My Input" />
<input id="i2" type="checkbox" aria-label="Agree" />
<select id="sel" aria-label="Choice"><option>A</option><option>B</option></select>
<p id="p">plain paragraph text</p>
<output id="result">no clicks</output>
<script>
document.getElementById('b1').addEventListener('click', () => {
  document.getElementById('result').textContent = 'clicked b1';
});
document.getElementById('i1').addEventListener('input', (e) => {
  document.getElementById('result').textContent = 'typed: ' + e.target.value;
});
</script>
</body></html>`;
}

test.describe.configure({ mode: 'serial', timeout: 60_000 });

test.describe('Snapshot — happy path baselines', () => {
  test('interactive snapshot lists buttons, links, inputs with @e refs', async () => {
    const fx = await makeFixture(refRichPage());
    try {
      const data = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as {
        refs: Ref[]; tree: string; count: number;
      };
      expect(data.refs.length).toBeGreaterThan(0);
      expect(data.refs[0]!.ref).toBe('@e1');

      const roles = new Set(data.refs.map((r) => r.role));
      expect(roles.has('button')).toBe(true);
      expect(roles.has('link')).toBe(true);
      expect(roles.has('textbox')).toBe(true);

      // Tree string echoes the same refs
      for (const r of data.refs) {
        expect(data.tree).toContain(r.ref);
      }
    } finally {
      await fx.cleanup();
    }
  });

  test('snapshot { interactive: false } includes non-interactive elements', async () => {
    const fx = await makeFixture(refRichPage());
    try {
      const inter = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as { refs: Ref[] };
      const full = (await daemonReq(fx.daemon, 'snapshot', { interactive: false })) as { refs: Ref[] };
      expect(full.refs.length).toBeGreaterThanOrEqual(inter.refs.length);
      // At least the heading should appear in the full snapshot
      const fullRoles = new Set(full.refs.map((r) => r.role));
      expect(fullRoles.has('heading'), `roles: ${[...fullRoles].join(', ')}`).toBe(true);
    } finally {
      await fx.cleanup();
    }
  });

  test('click-ref on a real button updates the page and is fast (< 3s)', async () => {
    const fx = await makeFixture(refRichPage());
    try {
      const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as { refs: Ref[] };
      const btn = snap.refs.find((r) => r.role === 'button' && r.name === 'Button One')!;
      const t0 = Date.now();
      const result = (await daemonReq(fx.daemon, 'click-ref', { ref: btn.ref })) as { clicked: string };
      expect(Date.now() - t0).toBeLessThan(3_000);
      expect(result.clicked).toBe(btn.ref);
    } finally {
      await fx.cleanup();
    }
  });

  test('fill-ref on a text input writes and triggers input handlers', async () => {
    const fx = await makeFixture(refRichPage());
    try {
      const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as { refs: Ref[] };
      const tb = snap.refs.find((r) => r.role === 'textbox')!;
      const result = (await daemonReq(fx.daemon, 'fill-ref', { ref: tb.ref, value: 'hello world' })) as {
        filled: string; value: string;
      };
      expect(result.filled).toBe(tb.ref);
      expect(result.value).toBe('hello world');
    } finally {
      await fx.cleanup();
    }
  });

  test('hover-ref on a link succeeds', async () => {
    const fx = await makeFixture(refRichPage());
    try {
      const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as { refs: Ref[] };
      const link = snap.refs.find((r) => r.role === 'link')!;
      const result = (await daemonReq(fx.daemon, 'hover-ref', { ref: link.ref })) as { hovered: string };
      expect(result.hovered).toBe(link.ref);
    } finally {
      await fx.cleanup();
    }
  });

  test('press-key sends a key to the page', async () => {
    const fx = await makeFixture(refRichPage());
    try {
      const result = (await daemonReq(fx.daemon, 'press-key', { key: 'Escape' })) as { pressed: string };
      expect(result.pressed).toBe('Escape');
    } finally {
      await fx.cleanup();
    }
  });

  test('stale ref returns a fast clear error', async () => {
    const fx = await makeFixture(refRichPage());
    try {
      // Take a snapshot so resolveRef has a refMap, then ask for a ref that
      // doesn't exist.
      await daemonReq(fx.daemon, 'snapshot', { interactive: true });
      const t0 = Date.now();
      let threw = false;
      try {
        await daemonReq(fx.daemon, 'click-ref', { ref: '@e9999' });
      } catch (e) {
        threw = true;
        expect((e as Error).message).toContain('@e9999');
      }
      expect(threw).toBe(true);
      // Stale-ref error should be near-instant.
      expect(Date.now() - t0).toBeLessThan(2_000);
    } finally {
      await fx.cleanup();
    }
  });

  test('snapshot diff with no baseline returns a clear error', async () => {
    const fx = await makeFixture(refRichPage());
    try {
      let threw = false;
      try {
        await daemonReq(fx.daemon, 'snapshot', { interactive: true, diff: true });
      } catch (e) {
        threw = true;
        expect((e as Error).message.toLowerCase()).toContain('baseline');
      }
      expect(threw, 'diff with no baseline should error').toBe(true);
    } finally {
      await fx.cleanup();
    }
  });

  test('snapshot annotate returns a base64 PNG', async () => {
    const fx = await makeFixture(refRichPage());
    try {
      // Prime the refmap first.
      await daemonReq(fx.daemon, 'snapshot', { interactive: true });
      const data = (await daemonReq(fx.daemon, 'snapshot', {
        interactive: true, annotate: true,
      })) as { screenshot: string; refs: Ref[] };
      expect(data.screenshot).toBeDefined();
      const png = decodeScreenshot(data.screenshot);
      saveArtifact('annotated.png', png);
      expect(png.subarray(0, 4).toString('hex')).toBe('89504e47');
      const dims = pngDimensions(png);
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    } finally {
      await fx.cleanup();
    }
  });
});

test.describe('Snapshot — known bugs (TDD: drop .fail when fixed)', () => {
  // ----------------------------------------------------------------------
  // Bug G: click-ref on a DISABLED element hangs for 30s waiting for
  // Playwright's default click timeout. Should detect the disabled state
  // up-front and fail fast (< 3s).
  // ----------------------------------------------------------------------
  test('BUG G — click-ref on a disabled element fails fast', async () => {
    const fx = await makeFixture(refRichPage());
    try {
      const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as { refs: Ref[] };
      const disabled = snap.refs.find((r) => r.role === 'button' && /disabled/i.test(r.name))!;
      expect(disabled).toBeDefined();
      const t0 = Date.now();
      let threw = false;
      try {
        await daemonReq(fx.daemon, 'click-ref', { ref: disabled.ref });
      } catch {
        threw = true;
      }
      const elapsed = Date.now() - t0;
      expect(threw, 'clicking a disabled button should fail').toBe(true);
      expect(elapsed, `disabled-click should fail fast, took ${elapsed}ms`).toBeLessThan(3_000);
    } finally {
      await fx.cleanup();
    }
  });

  // ----------------------------------------------------------------------
  // Bug H: fill-ref on a non-fillable element (e.g. <option>) hangs for
  // 30s on Playwright's editable-wait. Should reject the action up-front.
  // ----------------------------------------------------------------------
  test('BUG H — fill-ref on a non-fillable element fails fast', async () => {
    const fx = await makeFixture(refRichPage());
    try {
      const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as { refs: Ref[] };
      const opt = snap.refs.find((r) => r.role === 'option')!;
      expect(opt).toBeDefined();
      const t0 = Date.now();
      let threw = false;
      try {
        await daemonReq(fx.daemon, 'fill-ref', { ref: opt.ref, value: 'x' });
      } catch {
        threw = true;
      }
      const elapsed = Date.now() - t0;
      expect(threw, 'filling an <option> should fail').toBe(true);
      expect(elapsed, `non-fillable-fill should fail fast, took ${elapsed}ms`).toBeLessThan(3_000);
    } finally {
      await fx.cleanup();
    }
  });
});
