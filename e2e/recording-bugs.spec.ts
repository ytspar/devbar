/**
 * Recording Bugs — TDD Suite
 *
 * Each `test.fail()` below documents a known bug in the video-recording flow
 * (see chat transcript dated 2026-04-26). When a bug is fixed, drop the
 * `.fail()` annotation and the test should turn green.
 *
 * Layout: every test runs against a fresh static HTML fixture served from a
 * temp project root, so the global devbar repo state is untouched and
 * sessions are isolated from each other.
 *
 * Run only this file:
 *   pnpm exec playwright test e2e/recording-bugs.spec.ts --project=chromium
 */

import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { cli, daemonReq, makeFixture } from './_harness.js';

// Visual artifacts dumped here for human/Claude review after the run.
const ARTIFACT_DIR = '/tmp/sweetlink-e2e-artifacts/recording';
function copyArtifact(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.copyFileSync(src, path.join(ARTIFACT_DIR, dest));
}

// ============================================================================
// Fixture HTML builders
// ============================================================================

function pageWithButtons(): string {
  return `<!DOCTYPE html>
<html><head><title>RecFixture</title></head>
<body style="font-family:sans-serif;padding:40px">
<h1 id="h">Recording Fixture</h1>
<button id="b1">Button One</button>
<button id="b2">Button Two</button>
<input id="inp" placeholder="type here" />
<p id="out">no clicks</p>
<script>
document.getElementById('b1').addEventListener('click', () => {
  document.getElementById('out').textContent = 'b1 clicked';
});
document.getElementById('b2').addEventListener('click', () => {
  document.getElementById('out').textContent = 'b2 clicked';
});
</script>
</body></html>`;
}

function pageWithConsoleError(): string {
  return `<!DOCTYPE html>
<html><head><title>ConsoleError</title></head>
<body><h1>Page that errors on load</h1>
<script>
console.error('e2e-fixture: synthetic error A');
console.error('e2e-fixture: synthetic error B');
console.warn('e2e-fixture: synthetic warning');
</script>
</body></html>`;
}

// ============================================================================
// Specs
// ============================================================================

test.describe.configure({ mode: 'serial', timeout: 60_000 });

test.describe('Recording — happy path baselines (must always pass)', () => {
  test('record-start / record-stop produces a session dir, manifest, and webm', async () => {
    const fx = await makeFixture(pageWithButtons());
    try {
      const start = (await daemonReq(fx.daemon, 'record-start')) as { sessionId: string };
      // Session IDs are timestamped: session-YYYY-MM-DDTHH-MM-SS
      expect(start.sessionId).toMatch(/^session-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);

      // Use a fill action so the session has at least one logged command
      const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as {
        refs: Array<{ ref: string; role: string; name: string }>;
      };
      const tb = snap.refs.find((r) => r.role === 'textbox');
      expect(tb).toBeDefined();
      await daemonReq(fx.daemon, 'fill-ref', { ref: tb!.ref, value: 'baseline' });

      const stop = (await daemonReq(fx.daemon, 'record-stop')) as {
        manifest: {
          sessionId: string;
          duration: number;
          commands: Array<{ action: string; args: string[] }>;
          video?: string;
          screenshots: string[];
        };
      };
      expect(stop.manifest.sessionId).toBe(start.sessionId);
      expect(stop.manifest.commands.length).toBeGreaterThan(0);
      expect(stop.manifest.video).toBe('session.webm');

      const sessionDir = path.join(fx.projectRoot, '.sweetlink', start.sessionId);
      expect(fs.existsSync(path.join(sessionDir, 'sweetlink-session.json'))).toBe(true);
      const webm = path.join(sessionDir, 'session.webm');
      expect(fs.existsSync(webm)).toBe(true);

      // WebM starts with EBML header 1A 45 DF A3
      const head = Buffer.alloc(4);
      const fd = fs.openSync(webm, 'r');
      fs.readSync(fd, head, 0, 4, 0);
      fs.closeSync(fd);
      expect(head[0]).toBe(0x1a);
      expect(head[1]).toBe(0x45);
      expect(head[2]).toBe(0xdf);
      expect(head[3]).toBe(0xa3);
    } finally {
      await fx.cleanup();
    }
  });

  test('fill @ref logs an action with correct args + screenshot', async () => {
    const fx = await makeFixture(pageWithButtons());
    try {
      await daemonReq(fx.daemon, 'record-start');
      const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as {
        refs: Array<{ ref: string; role: string; name: string }>;
      };
      const tb = snap.refs.find((r) => r.role === 'textbox')!;
      await daemonReq(fx.daemon, 'fill-ref', { ref: tb.ref, value: 'hello' });

      const stop = (await daemonReq(fx.daemon, 'record-stop')) as {
        manifest: {
          sessionId: string;
          commands: Array<{ action: string; args: string[]; screenshot?: string }>;
          screenshots: string[];
        };
      };
      const fillCmd = stop.manifest.commands.find((c) => c.action === 'fill');
      expect(fillCmd).toBeDefined();
      expect(fillCmd!.args).toEqual([tb.ref, 'hello']);
      expect(fillCmd!.screenshot).toMatch(/^action-\d+\.png$/);
      expect(stop.manifest.screenshots).toContain(fillCmd!.screenshot);

      // Action screenshot exists on disk
      const sessionDir = path.join(fx.projectRoot, '.sweetlink', stop.manifest.sessionId);
      const shotPath = path.join(sessionDir, fillCmd!.screenshot!);
      expect(fs.existsSync(shotPath)).toBe(true);

      // Save artifacts for human review.
      copyArtifact(shotPath, 'fill-action.png');
      copyArtifact(path.join(sessionDir, 'session.webm'), 'fill-session.webm');
    } finally {
      await fx.cleanup();
    }
  });
});

test.describe('Recording — known bugs (TDD: drop .fail when fixed)', () => {
  // ----------------------------------------------------------------------
  // Bug A: console errors during recording are not reported in the manifest.
  // recording.ts hardcodes `errors: { console: 0, network: 0, server: 0 }`.
  // ----------------------------------------------------------------------
  test(
    'BUG A — manifest.errors.console reflects console errors fired during the session',
    async () => {
      const fx = await makeFixture(pageWithConsoleError());
      try {
        await daemonReq(fx.daemon, 'record-start');
        // Give the recording page time to load + emit the synthetic errors.
        await new Promise((r) => setTimeout(r, 750));
        const stop = (await daemonReq(fx.daemon, 'record-stop')) as {
          manifest: { errors: { console: number; network: number; server: number } };
        };
        // We synthesised exactly two console.error calls in the fixture.
        expect(stop.manifest.errors.console).toBeGreaterThanOrEqual(2);
      } finally {
        await fx.cleanup();
      }
    },
  );

  // ----------------------------------------------------------------------
  // Bug B: `screenshot` taken via the daemon during a recording is neither
  // logged as an action nor routed to the recording page. handleScreenshot
  // uses getPage(), not getRecordingPage(), and never calls logAction().
  // ----------------------------------------------------------------------
  test(
    'BUG B — daemon `screenshot` during recording logs a screenshot action',
    async () => {
      const fx = await makeFixture(pageWithButtons());
      try {
        await daemonReq(fx.daemon, 'record-start');
        await daemonReq(fx.daemon, 'screenshot', {});
        const stop = (await daemonReq(fx.daemon, 'record-stop')) as {
          manifest: { commands: Array<{ action: string }> };
        };
        const shotCmd = stop.manifest.commands.find((c) => c.action === 'screenshot');
        expect(shotCmd, 'screenshot during recording should appear in manifest.commands').toBeDefined();
      } finally {
        await fx.cleanup();
      }
    },
  );

  // ----------------------------------------------------------------------
  // Bug C: CLI `click --selector` during a recording does not log an action.
  // The CLI routes through the WebSocket bridge (devbar-injected page),
  // but the recording context has no devbar. There's also no `click @ref`
  // CLI verb. Until either is wired, recording cannot capture CSS clicks.
  // ----------------------------------------------------------------------
  test(
    'BUG C — CLI `click --selector "#b1"` during recording logs a click action',
    async () => {
      const fx = await makeFixture(pageWithButtons());
      try {
        await daemonReq(fx.daemon, 'record-start');

        const result = await cli(['click', '--selector', '#b1', '--url', fx.url], fx.projectRoot);
        // Today this exits 1 with "No element found matching: #b1" because
        // there's no devbar in the recording-context page.
        expect(result.exitCode, `click failed: ${result.stdout}\n${result.stderr}`).toBe(0);

        const stop = (await daemonReq(fx.daemon, 'record-stop')) as {
          manifest: { commands: Array<{ action: string; args: string[] }> };
        };
        const clickCmd = stop.manifest.commands.find((c) => c.action === 'click');
        expect(clickCmd).toBeDefined();
        expect(clickCmd!.args.join(' ')).toContain('#b1');
      } finally {
        await fx.cleanup();
      }
    },
  );

  // ----------------------------------------------------------------------
  // Bug D: ring buffers are global to the daemon and never scoped per
  // recording. Today both manifests report 0 (Bug A), so this is a
  // regression guard, not a current-failing test. Once Bug A is fixed,
  // a naive implementation that reads the entire consoleBuffer at
  // record-stop will double-count session 1's errors in session 2's
  // manifest. This test forces the implementer to scope by session
  // (e.g. by capturing buffer cursor at record-start).
  //
  // Two recordings against the SAME daemon — fixture HTML is swapped
  // between them so session 2 starts on a clean page.
  // ----------------------------------------------------------------------
  test('BUG D (regression guard) — second recording does not inherit session 1 errors', async () => {
    const fx = await makeFixture(pageWithConsoleError());
    try {
      // Session 1: noisy fixture emits 2 console.error calls on load.
      await daemonReq(fx.daemon, 'record-start');
      await new Promise((r) => setTimeout(r, 750));
      const stop1 = (await daemonReq(fx.daemon, 'record-stop')) as {
        manifest: { errors: { console: number } };
      };
      const errors1 = stop1.manifest.errors.console;

      // Swap to a clean page for session 2.
      fx.setHtml(pageWithButtons());

      // Session 2: clean fixture, no errors fire.
      await daemonReq(fx.daemon, 'record-start');
      await new Promise((r) => setTimeout(r, 500));
      const stop2 = (await daemonReq(fx.daemon, 'record-stop')) as {
        manifest: { errors: { console: number } };
      };
      const errors2 = stop2.manifest.errors.console;

      // Session 2 must not include session 1's errors.
      // Tolerate +1 for any device-pixel-ratio warning Chromium might
      // emit on its own — but never the 2 we synthesised in session 1.
      expect(errors2, `session1=${errors1} session2=${errors2} (session2 should not inherit session1's errors)`).toBeLessThanOrEqual(errors1);
      expect(errors2).toBeLessThan(2);
    } finally {
      await fx.cleanup();
    }
  });

  // ----------------------------------------------------------------------
  // Coverage test (was BUG E): the CLI's `click <@refN>` syntax should
  // route through the daemon's `click-ref` action. This was originally
  // suspected to be missing — turned out the CLI already supports it
  // (sweetlink.ts:2625), but a sync execFileSync in the test helper
  // was blocking the daemon's IPC. Kept as a regression guard.
  // ----------------------------------------------------------------------
  test('CLI `click @ref` routes through the daemon', async () => {
    const fx = await makeFixture(pageWithButtons());
    try {
      // Snapshot first to populate refs.
      const snapResult = await cli(['snapshot', '--url', fx.url], fx.projectRoot);
      expect(snapResult.exitCode, `snapshot failed:\nSTDOUT:\n${snapResult.stdout}\nSTDERR:\n${snapResult.stderr}`).toBe(0);
      const refMatch = snapResult.stdout.match(/@e(\d+)\s+\[button\]/);
      expect(refMatch, `no button ref in snapshot:\n${snapResult.stdout}`).not.toBeNull();
      const ref = `@e${refMatch![1]}`;

      const click = await cli(['click', ref, '--url', fx.url], fx.projectRoot);
      expect(click.exitCode, `click ${ref} failed: ${click.stdout}\n${click.stderr}`).toBe(0);
    } finally {
      await fx.cleanup();
    }
  });
});
