/**
 * Wait Feature — TDD Suite
 *
 * `sweetlink wait` polls a URL until it responds 2xx or times out.
 * Used in scripts to gate downstream actions on server readiness.
 *
 * Run:
 *   pnpm exec playwright test e2e/wait-bugs.spec.ts --project=chromium
 */

import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import { cli, freePort } from './_harness.js';

test.describe.configure({ mode: 'serial', timeout: 30_000 });

test.describe('Wait — happy path baselines', () => {
  test('exits 0 quickly when server is already up', async () => {
    const port = await freePort();
    const server = http.createServer((_req, res) => { res.writeHead(200); res.end('ok'); });
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-wait-'));
    try {
      const t0 = Date.now();
      const result = await cli(['wait', '--url', `http://127.0.0.1:${port}/`, '--timeout', '5000'], tmp);
      const elapsed = Date.now() - t0;
      expect(result.exitCode, result.stderr).toBe(0);
      expect(elapsed).toBeLessThan(2_000);
      expect(result.stdout).toContain('ready');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('exits non-zero with clear message when timeout exceeded', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-wait-'));
    try {
      const t0 = Date.now();
      const result = await cli(
        ['wait', '--url', 'http://127.0.0.1:1/', '--timeout', '1500'],
        tmp,
      );
      const elapsed = Date.now() - t0;
      expect(result.exitCode).toBe(1);
      // Should respect the timeout (allow a small overshoot for process spawn).
      expect(elapsed).toBeLessThan(5_000);
      expect(result.stdout + result.stderr).toMatch(/not available|not ready|timeout/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('succeeds once a slow-to-start server eventually responds', async () => {
    const port = await freePort();
    let server: http.Server | null = null;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-wait-'));
    try {
      // Start the server 700ms after kicking off `wait`.
      const startServer = setTimeout(() => {
        server = http.createServer((_req, res) => { res.writeHead(200); res.end('ok'); });
        server.listen(port, '127.0.0.1');
      }, 700);

      const t0 = Date.now();
      const result = await cli(
        ['wait', '--url', `http://127.0.0.1:${port}/`, '--timeout', '5000'],
        tmp,
      );
      const elapsed = Date.now() - t0;
      clearTimeout(startServer);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(elapsed).toBeGreaterThan(500);
      expect(elapsed).toBeLessThan(3_500);
    } finally {
      if (server) await new Promise<void>((r) => (server as http.Server).close(() => r()));
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
