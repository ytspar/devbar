/**
 * Regression coverage for the round-2 UX features (1.18.0).
 *
 * - ActionEntry.duration is populated (>0).
 * - Session IDs are ISO timestamps (session-YYYY-MM-DDTHH-MM-SS).
 * - Recording label embeds in the manifest.
 * - record pause/resume gaps the timeline.
 * - sessions-list returns recorded sessions and writes index.html.
 * - Failure screenshots accompany click-ref errors.
 * - visual-diff produces a diff.html viewer alongside the diff PNG.
 * - --theme dark applies prefers-color-scheme.
 * - click-css occlusion detection returns a clear error.
 */

import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { cli, daemonReq, decodeScreenshot, makeFixture, pngDimensions } from './_harness.js';

interface Ref {
  ref: string;
  role: string;
  name: string;
}

const ARTIFACT_DIR = '/tmp/sweetlink-e2e-artifacts/wave';
function saveArtifact(name: string, png: Buffer): void {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACT_DIR, name), png);
}

const buttonsPage = `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:30px">
<button id="b1">Click me</button>
<input id="i1" placeholder="text" aria-label="My Input" />
</body></html>`;

const themedPage = `<!DOCTYPE html><html><head><style>
  body{background:#fff;color:#000}
  @media (prefers-color-scheme: dark) {
    body{background:#000;color:#fff}
    body::after{content:'DARK MODE';display:block;font-size:48px;text-align:center;padding:80px}
  }
</style></head><body><h1>Theme test</h1></body></html>`;

const occludedPage = `<!DOCTYPE html><html><body style="margin:0">
<button id="b" style="position:fixed;left:80px;top:80px;width:200px;height:50px">Hidden</button>
<div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10"
     id="modal">overlay</div>
</body></html>`;

const preSessionNoisePage = `<!DOCTYPE html><html><body>
<h1>Pre-session noise</h1>
<script>console.error('pre-session-noise: should not appear in session evidence');</script>
</body></html>`;

const sessionNoisePage = `<!DOCTYPE html><html><body>
<h1>Session noise</h1>
<button aria-label="Noisy action">Noisy action</button>
<script>console.error('session-noise: should appear in session evidence');</script>
</body></html>`;

test.describe.configure({ mode: 'serial', timeout: 60_000 });

test('action duration is captured (> 0ms)', async () => {
  const fx = await makeFixture(buttonsPage);
  try {
    await daemonReq(fx.daemon, 'record-start');
    const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as { refs: Ref[] };
    const tb = snap.refs.find((r) => r.role === 'textbox')!;
    const fillResp = (await daemonReq(fx.daemon, 'fill-ref', { ref: tb.ref, value: 'x' })) as {
      duration: number;
    };
    expect(fillResp.duration).toBeGreaterThan(0);
    const stop = (await daemonReq(fx.daemon, 'record-stop')) as {
      manifest: { commands: Array<{ duration: number }> };
    };
    const fillCmd = stop.manifest.commands.find(
      (c) => (c as { action?: string }).action === 'fill'
    );
    expect(fillCmd?.duration).toBeGreaterThan(0);
  } finally {
    await fx.cleanup();
  }
});

test('session id uses ISO timestamp format', async () => {
  const fx = await makeFixture(buttonsPage);
  try {
    const start = (await daemonReq(fx.daemon, 'record-start')) as { sessionId: string };
    expect(start.sessionId).toMatch(/^session-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    await daemonReq(fx.daemon, 'record-stop');
  } finally {
    await fx.cleanup();
  }
});

test('record-start --label embeds in manifest + SUMMARY title', async () => {
  const fx = await makeFixture(buttonsPage);
  try {
    await daemonReq(fx.daemon, 'record-start', { label: 'login flow' });
    const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as { refs: Ref[] };
    const tb = snap.refs.find((r) => r.role === 'textbox')!;
    await daemonReq(fx.daemon, 'fill-ref', { ref: tb.ref, value: 'x' });
    const stop = (await daemonReq(fx.daemon, 'record-stop')) as {
      manifest: { sessionId: string; label?: string };
    };
    expect(stop.manifest.label).toBe('login flow');

    const summaryPath = path.join(
      fx.projectRoot,
      '.sweetlink',
      stop.manifest.sessionId,
      'SUMMARY.md'
    );
    const summary = fs.readFileSync(summaryPath, 'utf-8');
    expect(summary).toMatch(/^# Session Report: login flow/m);
    expect(summary).toContain('**Label:** login flow');
  } finally {
    await fx.cleanup();
  }
});

test('record-stop report evidence is scoped to the active session', async () => {
  const fx = await makeFixture(preSessionNoisePage);
  try {
    // Force daemon startup/page-load noise before the recording begins.
    await daemonReq(fx.daemon, 'screenshot');

    fx.setHtml(sessionNoisePage);
    await daemonReq(fx.daemon, 'record-start', { label: 'scoped evidence' });
    const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as { refs: Ref[] };
    const button = snap.refs.find((r) => r.name === 'Noisy action')!;
    await daemonReq(fx.daemon, 'click-ref', { ref: button.ref });
    const stop = (await daemonReq(fx.daemon, 'record-stop')) as {
      manifest: { sessionId: string; errors: { console: number } };
    };

    expect(stop.manifest.errors.console).toBe(1);

    const summaryPath = path.join(
      fx.projectRoot,
      '.sweetlink',
      stop.manifest.sessionId,
      'SUMMARY.md'
    );
    const summary = fs.readFileSync(summaryPath, 'utf-8');
    expect(summary).toContain('session-noise: should appear in session evidence');
    expect(summary).not.toContain('pre-session-noise: should not appear in session evidence');

    const manifestPath = path.join(
      fx.projectRoot,
      '.sweetlink',
      stop.manifest.sessionId,
      'sweetlink-session.json'
    );
    const persistedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      errors: { console: number };
    };
    expect(persistedManifest.errors.console).toBe(1);
  } finally {
    await fx.cleanup();
  }
});

test('record pause/resume omits paused window from action timeline', async () => {
  const fx = await makeFixture(buttonsPage);
  try {
    await daemonReq(fx.daemon, 'record-start');
    await new Promise((r) => setTimeout(r, 250));
    await daemonReq(fx.daemon, 'record-pause');
    // Sleep while paused — this delta should NOT appear in action timestamps.
    await new Promise((r) => setTimeout(r, 600));
    const resume = (await daemonReq(fx.daemon, 'record-resume')) as { pausedDurationMs: number };
    expect(resume.pausedDurationMs).toBeGreaterThanOrEqual(550);

    const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as { refs: Ref[] };
    const tb = snap.refs.find((r) => r.role === 'textbox')!;
    await daemonReq(fx.daemon, 'fill-ref', { ref: tb.ref, value: 'after-pause' });
    const stop = (await daemonReq(fx.daemon, 'record-stop')) as {
      manifest: { duration: number; commands: Array<{ timestamp: number; action: string }> };
    };
    const fillCmd = stop.manifest.commands.find((c) => c.action === 'fill')!;
    // Without the pause subtraction, the fill would happen at ≥0.85s; with
    // it, the fill timestamp should be much smaller (≤0.6s).
    expect(fillCmd.timestamp).toBeLessThan(0.8);
  } finally {
    await fx.cleanup();
  }
});

test('sessions-list returns recorded sessions and writes index.html', async () => {
  const fx = await makeFixture(buttonsPage);
  try {
    // Make a tiny recording so there's something to list.
    await daemonReq(fx.daemon, 'record-start', { label: 'first' });
    const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as { refs: Ref[] };
    await daemonReq(fx.daemon, 'fill-ref', {
      ref: snap.refs.find((r) => r.role === 'textbox')!.ref,
      value: 'x',
    });
    await daemonReq(fx.daemon, 'record-stop');

    const list = (await daemonReq(fx.daemon, 'sessions-list')) as {
      sessions: Array<{ sessionId: string; label?: string; actionCount: number }>;
      indexPath: string;
    };
    expect(list.sessions.length).toBeGreaterThanOrEqual(1);
    expect(list.sessions[0]!.label).toBe('first');
    expect(fs.existsSync(path.join(fx.projectRoot, list.indexPath))).toBe(true);
    const indexHtml = fs.readFileSync(path.join(fx.projectRoot, list.indexPath), 'utf-8');
    expect(indexHtml).toContain('first');
    expect(indexHtml).toContain('viewer.html');
  } finally {
    await fx.cleanup();
  }
});

test('click-ref on stale ref attaches a failure screenshot', async () => {
  const fx = await makeFixture(buttonsPage);
  try {
    await daemonReq(fx.daemon, 'snapshot', { interactive: true });
    let caught: { error?: string; data?: { failureScreenshot?: string } } | null = null;
    try {
      await daemonReq(fx.daemon, 'click-ref', { ref: '@e9999' });
    } catch (e) {
      caught = { error: (e as Error).message };
    }
    expect(caught?.error).toContain('@e9999');

    // Verify a failure PNG exists in .sweetlink/failures/
    const failuresDir = path.join(fx.projectRoot, '.sweetlink', 'failures');
    expect(fs.existsSync(failuresDir)).toBe(true);
    const failures = fs.readdirSync(failuresDir).filter((f) => f.endsWith('.png'));
    expect(failures.length).toBeGreaterThan(0);
  } finally {
    await fx.cleanup();
  }
});

test('visual-diff writes a side-by-side .diff.html viewer for mismatches', async () => {
  const fx = await makeFixture(buttonsPage);
  try {
    const a = (await daemonReq(fx.daemon, 'screenshot')) as { screenshot: string };
    const b = (await daemonReq(fx.daemon, 'screenshot', { viewport: '375x600' })) as {
      screenshot: string;
    };
    const outPath = path.join(fx.projectRoot, 'diff.png');
    const result = (await daemonReq(fx.daemon, 'visual-diff', {
      baseline: a.screenshot,
      current: b.screenshot,
      outputPath: outPath,
    })) as { mismatchPercentage: number; diffViewerPath?: string; diffImagePath?: string };
    expect(result.mismatchPercentage).toBeGreaterThan(0);
    expect(result.diffViewerPath).toBeDefined();
    expect(fs.existsSync(result.diffViewerPath!)).toBe(true);
    const html = fs.readFileSync(result.diffViewerPath!, 'utf-8');
    expect(html).toContain('Visual Diff');
    expect(html).toContain('mix-blend-mode:difference');
    expect(html).toContain('data:image/png;base64'); // both images embedded
  } finally {
    await fx.cleanup();
  }
});

test('--theme dark applies prefers-color-scheme to screenshot', async () => {
  const fx = await makeFixture(themedPage);
  try {
    const lightResp = (await daemonReq(fx.daemon, 'screenshot', { theme: 'light' })) as {
      screenshot: string;
    };
    const darkResp = (await daemonReq(fx.daemon, 'screenshot', { theme: 'dark' })) as {
      screenshot: string;
    };
    const lightPng = decodeScreenshot(lightResp.screenshot);
    const darkPng = decodeScreenshot(darkResp.screenshot);
    saveArtifact('theme-light.png', lightPng);
    saveArtifact('theme-dark.png', darkPng);
    // Different themes → different rendered pages → different bytes.
    expect(Buffer.compare(lightPng, darkPng)).not.toBe(0);
    // PNG dimensions should still be sane.
    expect(pngDimensions(darkPng).width).toBeGreaterThan(0);
  } finally {
    await fx.cleanup();
  }
});

test('click-css on an occluded element returns a clear "covered by" error', async () => {
  const fx = await makeFixture(occludedPage);
  try {
    let err = '';
    try {
      await daemonReq(fx.daemon, 'click-css', { selector: '#b' });
    } catch (e) {
      err = (e as Error).message;
    }
    expect(err.toLowerCase()).toContain('covered by');
    expect(err).toContain('#modal');
  } finally {
    await fx.cleanup();
  }
});

test('CLI `record exec` runs a DSL and auto-stops', async () => {
  const fx = await makeFixture(buttonsPage);
  try {
    const result = await cli(
      ['record', 'exec', '--url', fx.url, '--label', 'dsl-test', 'fill @e2 hello there; press Tab'],
      fx.projectRoot
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain('Recording:');
    expect(result.stdout).toContain('fill @e2');
    expect(result.stdout).toContain('press Tab');
    expect(result.stdout).toContain('Done:');
  } finally {
    await fx.cleanup();
  }
});
