/**
 * Daemon State File Management
 *
 * Handles reading, writing, and cleanup of .sweetlink/daemon.json.
 * Uses atomic writes (tmp + rename) and lockfiles to prevent race conditions.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { DaemonState } from './types.js';
import { DAEMON_LOCK_FILE, DAEMON_STATE_DIR, DAEMON_STATE_FILE } from './types.js';

/**
 * Get the .sweetlink directory path for a given project root
 */
export function getStateDir(projectRoot: string): string {
  return path.join(projectRoot, DAEMON_STATE_DIR);
}

/**
 * Get the daemon.json file path
 */
export function getStateFilePath(projectRoot: string): string {
  return path.join(getStateDir(projectRoot), DAEMON_STATE_FILE);
}

/**
 * Get the daemon.lock file path
 */
export function getLockFilePath(projectRoot: string): string {
  return path.join(getStateDir(projectRoot), DAEMON_LOCK_FILE);
}

/**
 * Write daemon state to .sweetlink/daemon.json atomically.
 * Creates the directory if it doesn't exist.
 * Sets file permissions to 600 (owner read/write only) for security.
 */
export function writeDaemonState(projectRoot: string, state: DaemonState): void {
  const dir = getStateDir(projectRoot);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const stateFile = getStateFilePath(projectRoot);
  const tmpFile = stateFile + '.tmp';

  // Atomic write: write to tmp, then rename
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmpFile, stateFile);
}

/**
 * Read daemon state from .sweetlink/daemon.json.
 * Returns null if the file doesn't exist or is invalid.
 */
export function readDaemonState(projectRoot: string): DaemonState | null {
  const stateFile = getStateFilePath(projectRoot);
  try {
    const content = fs.readFileSync(stateFile, 'utf-8');
    const state = JSON.parse(content) as DaemonState;
    // Validate required fields
    if (
      typeof state.pid !== 'number' ||
      typeof state.port !== 'number' ||
      typeof state.token !== 'string' ||
      typeof state.startedAt !== 'string' ||
      typeof state.url !== 'string'
    ) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

/**
 * Remove daemon state file and lock file
 */
export function removeDaemonState(projectRoot: string): void {
  const stateFile = getStateFilePath(projectRoot);
  const lockFile = getLockFilePath(projectRoot);
  try {
    fs.unlinkSync(stateFile);
  } catch {
    // File may not exist
  }
  try {
    fs.unlinkSync(lockFile);
  } catch {
    // File may not exist
  }
}

/**
 * Check if a daemon is alive by sending an HTTP ping.
 * Returns true if the daemon responds, false otherwise.
 */
export async function isDaemonAlive(state: DaemonState): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`http://127.0.0.1:${state.port}/api/ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify({ action: 'ping' }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Acquire a lockfile to prevent concurrent daemon starts.
 * Returns true if the lock was acquired, false if another process holds it.
 */
export function acquireLock(projectRoot: string): boolean {
  const dir = getStateDir(projectRoot);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const lockFile = getLockFilePath(projectRoot);
  try {
    // 'wx' flag: write exclusive — fails if file exists
    fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx', mode: 0o600 });
    return true;
  } catch {
    // Check if the lock is stale (holding process is dead)
    try {
      const pid = parseInt(fs.readFileSync(lockFile, 'utf-8').trim(), 10);
      if (!isNaN(pid)) {
        try {
          // Signal 0 checks if process exists without killing it
          process.kill(pid, 0);
          // Process is alive — lock is valid
          return false;
        } catch {
          // Process is dead — stale lock, remove and retry
          fs.unlinkSync(lockFile);
          fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx', mode: 0o600 });
          return true;
        }
      }
    } catch {
      // Can't read lock file — another process may be writing it
    }
    return false;
  }
}

/**
 * Release the lockfile
 */
export function releaseLock(projectRoot: string): void {
  const lockFile = getLockFilePath(projectRoot);
  try {
    fs.unlinkSync(lockFile);
  } catch {
    // File may not exist
  }
}
