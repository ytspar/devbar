/**
 * Terminal Recorder
 *
 * Spawns a child process and captures stdout/stderr chunks with timestamps,
 * emitting an asciicast v2 file (https://docs.asciinema.org/manual/asciicast/v2/).
 *
 * Notes on PTY-vs-pipe: we don't ship a native node-pty dep, so we set
 * `FORCE_COLOR`, `TERM=xterm-256color`, `CI=` env vars to coax most CLIs
 * into emitting ANSI colour. Programs that strictly require a TTY (less,
 * top, vim) won't render correctly — that's a documented limitation.
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import type { CastEvent, CastHeader } from './cast.js';

/**
 * Allowlist of environment variables forwarded to recorded child processes.
 * Excludes anything matching common secret patterns (AWS_*, GH_TOKEN,
 * NPM_TOKEN, ANTHROPIC_API_KEY, etc.). Callers can opt into the full env
 * via `inheritEnv: true`.
 */
const MINIMAL_ENV_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'SHELL',
  'TZ',
  'TMPDIR',
  'PWD',
];

function pickMinimalEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of MINIMAL_ENV_KEYS) {
    const v = process.env[key];
    if (typeof v === 'string') out[key] = v;
  }
  return out;
}

export interface TerminalCaptureOptions {
  command: string;
  /** Output path for the .cast file. The .html player is written next to it. */
  output: string;
  /** Shell to run the command in. Defaults to /bin/sh. */
  shell?: string;
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string>;
  /** Optional human-readable label embedded in the .cast title field. */
  label?: string;
  /**
   * When true, the spawned child sees the full process.env (which may include
   * secrets like AWS_SECRET_ACCESS_KEY, ANTHROPIC_API_KEY, NPM_TOKEN). When
   * false (default), only a minimal allowlist is forwarded. Recorded stdout
   * is shareable, so leaking env values into a .cast on disk is a real risk.
   */
  inheritEnv?: boolean;
}

export interface TerminalCaptureResult {
  durationSec: number;
  bytes: number;
  exitCode: number;
  events: number;
  castPath: string;
}

export async function captureTerminal(
  options: TerminalCaptureOptions
): Promise<TerminalCaptureResult> {
  const startTime = Date.now();
  const events: CastEvent[] = [];
  const cols = options.cols ?? 120;
  const rows = options.rows ?? 30;

  // Coax common CLIs into emitting ANSI colour even though stdout isn't
  // a TTY. We don't drop a real PTY in front of them — the trade-off is
  // simpler installation (no native build) at the cost of TUI fidelity.
  // Default to a minimal env to avoid leaking secrets (AWS keys, GH tokens,
  // ANTHROPIC_API_KEY, etc.) into the recorded .cast — programs that print
  // env on error would otherwise embed them in the shareable artifact.
  const baseEnv: Record<string, string> = options.inheritEnv
    ? (process.env as Record<string, string>)
    : pickMinimalEnv();
  const env: Record<string, string> = {
    ...baseEnv,
    ...options.env,
    FORCE_COLOR: '3',
    CLICOLOR_FORCE: '1',
    TERM: 'xterm-256color',
    COLUMNS: String(cols),
    LINES: String(rows),
  };

  return new Promise((resolve, reject) => {
    const child = spawn(options.shell ?? '/bin/sh', ['-c', options.command], {
      cwd: options.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let totalBytes = 0;
    const handleData = (data: Buffer): void => {
      const t = (Date.now() - startTime) / 1000;
      const text = data.toString('utf-8');
      events.push([t, 'o', text]);
      totalBytes += data.length;
    };
    child.stdout?.on('data', handleData);
    child.stderr?.on('data', handleData);

    child.on('error', reject);

    child.on('close', async (code) => {
      try {
        const durationSec = (Date.now() - startTime) / 1000;
        const header: CastHeader = {
          version: 2,
          width: cols,
          height: rows,
          timestamp: Math.floor(startTime / 1000),
          duration: durationSec,
          title: options.label ?? options.command.slice(0, 100),
          env: { TERM: 'xterm-256color', SHELL: options.shell ?? '/bin/sh' },
        };
        const lines = [JSON.stringify(header)];
        for (const e of events) lines.push(JSON.stringify(e));
        await fs.writeFile(options.output, `${lines.join('\n')}\n`);
        resolve({
          durationSec,
          bytes: totalBytes,
          exitCode: code ?? 0,
          events: events.length,
          castPath: options.output,
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}
