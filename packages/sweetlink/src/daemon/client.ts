/**
 * Daemon Client
 *
 * Used by the CLI to communicate with the daemon process.
 * Handles spawning, discovery, and HTTP requests to the daemon.
 */

import { fork } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  acquireLock,
  extractPort,
  isDaemonAlive,
  readDaemonState,
  releaseLock,
} from './stateFile.js';
import type { DaemonResponse, DaemonState } from './types.js';
import { DAEMON_POLL_INTERVAL_MS, DAEMON_SPAWN_TIMEOUT_MS } from './types.js';

export class DaemonRequestError extends Error {
  readonly action: string;
  readonly status: number;
  readonly response: DaemonResponse;
  readonly data?: Record<string, unknown>;

  constructor(action: string, status: number, response: DaemonResponse) {
    super(response.error ?? `Daemon request failed: ${action}`);
    this.name = 'DaemonRequestError';
    this.action = action;
    this.status = status;
    this.response = response;
    this.data = response.data;
  }
}

/**
 * Ensure a daemon is running for the given project root and URL.
 * If no daemon is alive, spawns one and waits for it to be ready.
 * Returns the daemon state (port, token) needed for requests.
 */
export async function ensureDaemon(
  projectRoot: string,
  url: string,
  options?: { headed?: boolean }
): Promise<DaemonState> {
  const appPort = extractPort(url);

  // Check if daemon is already running (scoped by app port)
  const existing = readDaemonState(projectRoot, appPort);
  if (existing) {
    const alive = await isDaemonAlive(existing);
    if (alive) {
      return existing;
    }
    console.log('[Sweetlink] Stale daemon state found. Starting fresh...');
  }

  return spawnDaemon(projectRoot, url, options);
}

/**
 * Spawn a new daemon process and wait for it to be ready.
 */
async function spawnDaemon(
  projectRoot: string,
  url: string,
  options?: { headed?: boolean }
): Promise<DaemonState> {
  // Acquire lock to prevent concurrent starts
  const appPort = extractPort(url);
  if (!acquireLock(projectRoot, appPort)) {
    // Another process is starting the daemon — wait for state file
    console.log('[Sweetlink] Another process is starting the daemon. Waiting...');
    return waitForDaemon(projectRoot, appPort);
  }

  try {
    console.log('[Sweetlink] Starting daemon...');

    // Resolve the daemon entry point from the built dist
    const thisFile = fileURLToPath(import.meta.url);
    const daemonEntry = path.join(path.dirname(thisFile), 'index.js');

    const forkArgs = ['--url', url, '--project-root', projectRoot];
    if (options?.headed) forkArgs.push('--headed');

    const child = fork(daemonEntry, forkArgs, {
      detached: true,
      stdio: options?.headed ? 'inherit' : 'ignore',
    });

    // Unref so the CLI process can exit without waiting for the daemon
    child.unref();
    if (child.connected) child.disconnect();

    // Wait for the daemon to write its state file
    return await waitForDaemon(projectRoot, appPort);
  } catch (error) {
    releaseLock(projectRoot, appPort);
    throw error;
  }
}

/**
 * Poll for daemon state file until it appears or timeout.
 */
async function waitForDaemon(projectRoot: string, appPort?: number): Promise<DaemonState> {
  const deadline = Date.now() + DAEMON_SPAWN_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const state = readDaemonState(projectRoot, appPort);
    if (state) {
      const alive = await isDaemonAlive(state);
      if (alive) {
        console.log(`[Sweetlink] Daemon ready on port ${state.port}`);
        return state;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, DAEMON_POLL_INTERVAL_MS));
  }

  throw new Error(
    'Daemon did not start within timeout. Check if Playwright is installed: pnpm add playwright'
  );
}

/**
 * Send a request to the daemon HTTP server.
 */
export async function daemonRequest(
  state: DaemonState,
  action: string,
  params?: Record<string, unknown>
): Promise<DaemonResponse> {
  const response = await fetch(`http://127.0.0.1:${state.port}/api/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`,
    },
    body: JSON.stringify({ params }),
  });

  const body = (await response.json()) as DaemonResponse;

  if (!body.ok) {
    throw new DaemonRequestError(action, response.status, body);
  }

  return body;
}

/**
 * Stop the daemon by sending a shutdown command.
 */
export async function stopDaemon(projectRoot: string, appPort?: number): Promise<boolean> {
  const state = readDaemonState(projectRoot, appPort);
  if (!state) {
    return false;
  }

  try {
    await daemonRequest(state, 'shutdown');
    return true;
  } catch {
    // Daemon may already be dead
    return false;
  }
}

/**
 * Get daemon status information.
 */
export async function getDaemonStatus(
  projectRoot: string,
  appPort?: number
): Promise<{ running: boolean; pid?: number; port?: number; url?: string; uptime?: number }> {
  const state = readDaemonState(projectRoot, appPort);
  if (!state) {
    return { running: false };
  }

  const alive = await isDaemonAlive(state);
  if (!alive) {
    return { running: false };
  }

  const uptimeMs = Date.now() - new Date(state.startedAt).getTime();
  return {
    running: true,
    pid: state.pid,
    port: state.port,
    url: state.url,
    uptime: Math.round(uptimeMs / 1000),
  };
}
