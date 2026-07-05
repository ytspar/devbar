/**
 * Project-Local Server Discovery
 *
 * The WebSocket server writes `<projectRoot>/.sweetlink/server.json` on
 * startup and removes it on shutdown. The CLI walks up from its cwd to find
 * the file, so it connects to THIS project's server instead of guessing a
 * port — with several projects running sweetlink at once, the default-port
 * fallback (ws://localhost:9223) can land on a different project's server.
 *
 * Stale files happen (crashes, SIGKILL), so consumers must validate liveness
 * against the server's HTTP info endpoint (pid/appPort) before trusting one.
 * `.sweetlink/` should be gitignored (the file is machine- and run-specific).
 */

import * as fs from 'fs';
import * as path from 'path';
import { parsePortNumber } from '../types.js';

export const SWEETLINK_DIR = '.sweetlink';
export const SERVER_INFO_FILENAME = 'server.json';

export interface ServerInfoFile {
  /** Port the WebSocket server is listening on. */
  wsPort: number;
  /** Associated dev-server port, when known. */
  appPort: number | null;
  /** Declared public/proxy URL (PORTLESS_URL etc.), when set. */
  publicUrl?: string;
  /** Process id of the server — used to detect stale files. */
  pid: number;
  startedAt: string;
  version: string;
}

/** Absolute path of the server info file for a project root. */
export function serverInfoFilePath(projectRoot: string): string {
  return path.join(projectRoot, SWEETLINK_DIR, SERVER_INFO_FILENAME);
}

/**
 * Write the server info file. Never throws — discovery is an optimization,
 * and a read-only filesystem must not take the server down.
 */
export function writeServerInfoFile(projectRoot: string, info: ServerInfoFile): void {
  try {
    const filePath = serverInfoFilePath(projectRoot);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(info, null, 2)}\n`, 'utf-8');
  } catch (error) {
    console.warn(
      '[Sweetlink] Could not write .sweetlink/server.json:',
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Remove the server info file — but only when it still belongs to `pid`.
 * A slow shutdown must not delete the file a freshly restarted server (a
 * different pid) has already written. Never throws.
 */
export function removeServerInfoFile(projectRoot: string, pid: number = process.pid): void {
  try {
    const filePath = serverInfoFilePath(projectRoot);
    const existing = parseServerInfoFile(fs.readFileSync(filePath, 'utf-8'));
    if (existing && existing.pid !== pid) return;
    fs.unlinkSync(filePath);
  } catch {
    // Already gone or unreadable — nothing to clean up
  }
}

/** Parse and shape-validate a server info file. Returns null when invalid. */
export function parseServerInfoFile(raw: string): ServerInfoFile | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const wsPort = parsePortNumber(record.wsPort as number | string | null | undefined);
    const pid = typeof record.pid === 'number' && record.pid > 0 ? record.pid : null;
    if (!wsPort || !pid) return null;
    return {
      wsPort,
      appPort: parsePortNumber(record.appPort as number | string | null | undefined),
      publicUrl: typeof record.publicUrl === 'string' ? record.publicUrl : undefined,
      pid,
      startedAt: typeof record.startedAt === 'string' ? record.startedAt : '',
      version: typeof record.version === 'string' ? record.version : '',
    };
  } catch {
    return null;
  }
}

/**
 * Walk up from `startDir` looking for `.sweetlink/server.json`.
 * Returns the parsed info plus the project root it was found in, or null.
 */
export function findServerInfoFile(
  startDir: string
): { info: ServerInfoFile; projectRoot: string; filePath: string } | null {
  let dir = path.resolve(startDir);
  for (;;) {
    const filePath = serverInfoFilePath(dir);
    try {
      if (fs.existsSync(filePath)) {
        const info = parseServerInfoFile(fs.readFileSync(filePath, 'utf-8'));
        if (info) return { info, projectRoot: dir, filePath };
      }
    } catch {
      // Unreadable — keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
