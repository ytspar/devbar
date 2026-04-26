/**
 * Daemon Lifecycle — TDD Suite
 *
 * Covers: daemon start / stop / status, status (general), cleanup.
 */

import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import { cli, freePort } from './_harness.js';

test.describe.configure({ mode: 'serial', timeout: 60_000 });

async function withApp(fn: (url: string, cwd: string, port: number) => Promise<void>): Promise<void> {
  const port = await freePort();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-life-'));
  const server = http.createServer((_req, res) => { res.writeHead(200); res.end('ok'); });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  try {
    await fn(`http://127.0.0.1:${port}/`, cwd, port);
  } finally {
    // Best-effort daemon stop so we don't leak forks.
    try { await cli(['daemon', 'stop', '--url', `http://127.0.0.1:${port}/`], cwd); } catch { /* ignore */ }
    await new Promise<void>((r) => server.close(() => r()));
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

test('daemon start writes a state file scoped by app port', async () => {
  await withApp(async (url, cwd, port) => {
    const start = await cli(['daemon', 'start', '--url', url], cwd);
    expect(start.exitCode, start.stderr).toBe(0);
    expect(start.stdout).toMatch(/Daemon (running|ready)/);
    expect(fs.existsSync(path.join(cwd, '.sweetlink', `daemon-${port}.json`))).toBe(true);
  });
});

test('BUG N — daemon status (with --url) reports the running daemon', async () => {
  await withApp(async (url, cwd) => {
    await cli(['daemon', 'start', '--url', url], cwd);
    const status = await cli(['daemon', 'status', '--url', url], cwd);
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toMatch(/Daemon running/);
    expect(status.stdout).toMatch(/port=\d+/);
  });
});

test('BUG N — daemon stop (with --url) shuts down the running daemon', async () => {
  await withApp(async (url, cwd) => {
    await cli(['daemon', 'start', '--url', url], cwd);
    const stop = await cli(['daemon', 'stop', '--url', url], cwd);
    expect(stop.exitCode).toBe(0);
    expect(stop.stdout).toMatch(/Daemon stopped/);
    // Daemon shutdown is async (scheduled 100ms after the stop response).
    // Poll status until it reports not running, or fail after 3s.
    const deadline = Date.now() + 3_000;
    let stopped = false;
    while (Date.now() < deadline) {
      const status = await cli(['daemon', 'status', '--url', url], cwd);
      if (/No daemon running/.test(status.stdout)) { stopped = true; break; }
      await new Promise((r) => setTimeout(r, 150));
    }
    expect(stopped, 'daemon should report not running within 3s of stop').toBe(true);
  });
});

test('status (general) reports the app server is reachable', async () => {
  await withApp(async (url, cwd) => {
    const result = await cli(['status', '--url', url], cwd);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/running|ready/i);
  });
});
