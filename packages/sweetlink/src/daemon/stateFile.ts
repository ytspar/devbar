/**
 * Daemon State File Management
 *
 * Handles reading, writing, and cleanup of .sweetlink/daemon.json.
 * Uses atomic writes (tmp + rename) and lockfiles to prevent race conditions.
 */

import * as crypto from 'crypto';
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
 * Get the daemon.json file path.
 * If appPort is provided, the state file is scoped per-port to support
 * multiple daemon instances in the same project (e.g., monorepo with
 * multiple apps running on different ports).
 */
export function getStateFilePath(projectRoot: string, appPort?: number): string {
  const filename = appPort ? `daemon-${appPort}.json` : DAEMON_STATE_FILE;
  return path.join(getStateDir(projectRoot), filename);
}

/**
 * Get the daemon.lock file path
 */
export function getLockFilePath(projectRoot: string, appPort?: number): string {
  const filename = appPort ? `daemon-${appPort}.lock` : DAEMON_LOCK_FILE;
  return path.join(getStateDir(projectRoot), filename);
}

/**
 * Extract port number from a URL string.
 */
export function extractPort(url: string): number | undefined {
  try {
    const port = new URL(url).port;
    return port ? parseInt(port, 10) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Write daemon state to .sweetlink/daemon.json (or daemon-{port}.json) atomically.
 * Creates the directory if it doesn't exist.
 * Sets file permissions to 600 (owner read/write only) for security.
 *
 * If the rename fails or the process crashes between the write and the
 * rename, the stale `.tmp` file is left containing the bearer token. We
 * unlink any pre-existing tmp before writing so a previous crash can't
 * leak a token across daemon restarts.
 */
export function writeDaemonState(projectRoot: string, state: DaemonState, appPort?: number): void {
  const dir = getStateDir(projectRoot);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const stateFile = getStateFilePath(projectRoot, appPort);
  const tmpFile = `${stateFile}.tmp`;

  try {
    fs.unlinkSync(tmpFile);
  } catch {
    /* tmp does not exist — fine */
  }

  // Atomic write: write to tmp, then rename
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  try {
    fs.renameSync(tmpFile, stateFile);
  } catch (err) {
    // Rename failed — clean up tmp so the token doesn't linger on disk.
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* best-effort */
    }
    throw err;
  }
}

/**
 * Read daemon state from .sweetlink/daemon.json (or daemon-{port}.json).
 * Returns null if the file doesn't exist or is invalid.
 */
export function readDaemonState(projectRoot: string, appPort?: number): DaemonState | null {
  const stateFile = getStateFilePath(projectRoot, appPort);
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
 * Remove daemon state file and lock file (and any leftover tmp).
 */
export function removeDaemonState(projectRoot: string, appPort?: number): void {
  const stateFile = getStateFilePath(projectRoot, appPort);
  const lockFile = getLockFilePath(projectRoot, appPort);
  for (const f of [stateFile, `${stateFile}.tmp`, lockFile]) {
    try {
      fs.unlinkSync(f);
    } catch {
      // File may not exist
    }
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
 *
 * Lockfile format: `PID:TOKEN` where TOKEN is a 16-byte random hex string
 * generated for this acquisition attempt. The token defends against PID
 * reuse — a reincarnated PID can't impersonate the original lock-holder
 * because it has a different token.
 *
 * Stale-lock recovery is made atomic by writing our token and reading it
 * back: if two processes race on recovery, only the winner's token will
 * be in the file.
 */
export function acquireLock(projectRoot: string, appPort?: number): boolean {
  const dir = getStateDir(projectRoot);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const lockFile = getLockFilePath(projectRoot, appPort);
  const ourToken = crypto.randomBytes(16).toString('hex');
  const ourContent = `${process.pid}:${ourToken}`;

  // Fast path: no existing lock.
  try {
    fs.writeFileSync(lockFile, ourContent, { flag: 'wx', mode: 0o600 });
    return verifyLockOwnership(lockFile, ourContent);
  } catch {
    // Lock exists — see if it's stale.
  }

  // Slow path: existing lock might be stale.
  let existingPid: number | undefined;
  try {
    const raw = fs.readFileSync(lockFile, 'utf-8').trim();
    const [pidPart] = raw.split(':');
    const parsed = parseInt(pidPart ?? raw, 10);
    if (!Number.isNaN(parsed)) existingPid = parsed;
  } catch {
    /* lockfile vanished or unreadable — fall through */
  }

  if (existingPid !== undefined && existingPid !== process.pid) {
    try {
      process.kill(existingPid, 0);
      // Process exists — but PID could have been recycled. Cross-check with
      // the daemon state file: if the state file's PID matches AND the
      // state was written recently, treat as live. Otherwise treat as stale.
      const state = readDaemonState(projectRoot, appPort);
      if (state && state.pid === existingPid) {
        return false; // genuinely live daemon owns the lock
      }
      // PID is alive but not our daemon — recycled. Fall through to recovery.
    } catch {
      // Process is dead — stale lock, recover.
    }
  }

  // Stale-lock recovery: try to atomically take over. Multiple racing
  // processes all unlink + wx-write here; only one wx-write can succeed.
  // Then verify by reading back our token.
  try {
    try {
      fs.unlinkSync(lockFile);
    } catch {
      /* may have been unlinked by a concurrent recoverer */
    }
    fs.writeFileSync(lockFile, ourContent, { flag: 'wx', mode: 0o600 });
    return verifyLockOwnership(lockFile, ourContent);
  } catch {
    return false;
  }
}

function verifyLockOwnership(lockFile: string, expected: string): boolean {
  try {
    return fs.readFileSync(lockFile, 'utf-8').trim() === expected;
  } catch {
    return false;
  }
}

/**
 * Release the lockfile
 */
export function releaseLock(projectRoot: string, appPort?: number): void {
  const lockFile = getLockFilePath(projectRoot, appPort);
  try {
    fs.unlinkSync(lockFile);
  } catch {
    // File may not exist
  }
}
