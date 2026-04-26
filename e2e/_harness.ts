/**
 * Shared E2E harness for sweetlink feature tests.
 *
 * Each fixture spawns:
 *   - a temp project root (so .sweetlink state doesn't pollute the repo),
 *   - a static HTTP server on a free port (HTML body is swappable per request),
 *   - a sweetlink daemon scoped to that project root and URL.
 *
 * Tests interact via direct daemon HTTP calls (`daemonReq`) for low-level
 * checks, or via spawned CLI subprocesses (`cli`) for the user-facing path.
 *
 * Important: use `cli()` (async spawn) not execFileSync — sync child-process
 * helpers block Playwright's event loop and break the daemon's IPC.
 */

import { spawn, fork, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

export const REPO_ROOT = path.resolve(__dirname, '..');
export const CLI_PATH = path.join(REPO_ROOT, 'packages/sweetlink/dist/cli/sweetlink.js');
export const DAEMON_ENTRY = path.join(REPO_ROOT, 'packages/sweetlink/dist/daemon/index.js');

export interface DaemonState {
  pid: number;
  port: number;
  token: string;
  url: string;
}

export interface Fixture {
  url: string;
  appPort: number;
  projectRoot: string;
  daemon: DaemonState;
  daemonChild: ChildProcess;
  staticServer: http.Server;
  /** Swap HTML served on the next page navigation. */
  setHtml(html: string): void;
  cleanup(): Promise<void>;
}

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (typeof addr === 'object' && addr) {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error('Could not get free port'));
      }
    });
  });
}

async function serveStatic(
  port: number,
  getBody: () => string,
): Promise<http.Server> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end(getBody());
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return server;
}

async function startDaemon(
  projectRoot: string,
  url: string,
): Promise<{ state: DaemonState; child: ChildProcess }> {
  const child = fork(
    DAEMON_ENTRY,
    ['--url', url, '--project-root', projectRoot],
    { cwd: projectRoot, detached: false, stdio: 'ignore' },
  );

  const appPort = new URL(url).port;
  const stateFile = path.join(projectRoot, '.sweetlink', `daemon-${appPort}.json`);

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (fs.existsSync(stateFile)) {
      try {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8')) as DaemonState;
        const res = await fetch(`http://127.0.0.1:${state.port}/api/ping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
          body: '{}',
        });
        if (res.ok) return { state, child };
      } catch { /* not ready */ }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Daemon did not become ready (state file: ${stateFile})`);
}

export async function daemonReq(
  state: DaemonState,
  action: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${state.port}/api/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`,
    },
    body: JSON.stringify({ params }),
  });
  const body = (await res.json()) as { ok: boolean; data?: Record<string, unknown>; error?: string };
  if (!body.ok) throw new Error(body.error ?? `daemon ${action} failed`);
  return body.data ?? {};
}

export function cli(args: string[], cwd: string): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      stderr += '\n[cli helper] timeout after 30s';
    }, 30_000);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? (signal ? -1 : 1) });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + `\n[spawn] ${err.message}`, exitCode: 1 });
    });
  });
}

export async function makeFixture(html: string): Promise<Fixture> {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sweetlink-e2e-'));
  const appPort = await freePort();
  const url = `http://127.0.0.1:${appPort}/`;
  let body = html;
  const staticServer = await serveStatic(appPort, () => body);
  const { state, child } = await startDaemon(projectRoot, url);

  return {
    url,
    appPort,
    projectRoot,
    daemon: state,
    daemonChild: child,
    staticServer,
    setHtml(next: string) { body = next; },
    async cleanup() {
      try { await daemonReq(state, 'shutdown'); } catch { /* ignore */ }
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      await new Promise<void>((r) => staticServer.close(() => r()));
      fs.rmSync(projectRoot, { recursive: true, force: true });
    },
  };
}

/** Read PNG width × height from the IHDR chunk. */
export function pngDimensions(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Decode a base64-encoded screenshot string into a Buffer. */
export function decodeScreenshot(b64: string): Buffer {
  return Buffer.from(b64, 'base64');
}
