/**
 * Report — TDD Suite
 *
 * `sweetlink report` reads the latest SUMMARY.md from a session dir and
 * prints/copies/serves it. We exercise the print path against a real
 * recording session.
 *
 * proof + evidence are skipped here: they upload to GitHub PRs and need
 * a mock or real GH endpoint, which is out of scope for the isolated
 * harness.
 */

import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { cli, daemonReq, makeFixture } from './_harness.js';

function buttonsPage(): string {
  return `<!DOCTYPE html><html><body>
<input id="i" placeholder="x" />
</body></html>`;
}

test.describe.configure({ mode: 'serial', timeout: 60_000 });

test('report prints the latest session SUMMARY.md', async () => {
  const fx = await makeFixture(buttonsPage());
  try {
    // Run a short recording so a session dir + SUMMARY.md exist.
    await daemonReq(fx.daemon, 'record-start');
    const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as {
      refs: Array<{ ref: string; role: string; name: string }>;
    };
    const tb = snap.refs.find((r) => r.role === 'textbox')!;
    await daemonReq(fx.daemon, 'fill-ref', { ref: tb.ref, value: 'report-test' });
    const stop = (await daemonReq(fx.daemon, 'record-stop')) as {
      manifest: { sessionId: string; commands: Array<{ action: string }> };
    };
    const sessionDir = path.join(fx.projectRoot, '.sweetlink', stop.manifest.sessionId);
    expect(fs.existsSync(path.join(sessionDir, 'SUMMARY.md'))).toBe(true);

    // CLI report should find this session and print its SUMMARY.md.
    const result = await cli(['report'], fx.projectRoot);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/Session Report/);
    expect(result.stdout).toContain(stop.manifest.sessionId);
    expect(result.stdout).toMatch(/Action Timeline/);
    expect(result.stdout).toContain('fill');
  } finally {
    await fx.cleanup();
  }
});

test('report fails gracefully when no session exists', async () => {
  const fx = await makeFixture(buttonsPage());
  try {
    // No record-start/stop has happened — there are no session-* dirs yet.
    const result = await cli(['report'], fx.projectRoot);
    // Should not crash hard; either a clear error message or exit 1.
    expect(result.stdout + result.stderr).toMatch(/No session|no session/i);
  } finally {
    await fx.cleanup();
  }
});
