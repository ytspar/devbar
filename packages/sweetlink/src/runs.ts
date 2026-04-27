/**
 * App-scoped run directory hierarchy.
 *
 * When `--app <name>` is provided, artifacts (term casts, sim mp4s, recording
 * sessions) live under:
 *
 *   <baseDir>/<app>/<YYYYMMDD>/<run>/
 *
 * `run` is auto-generated from the local time (HHMM) at first call so a
 * single test run groups its artifacts, but can be overridden via SWEETLINK_RUN.
 *
 * Without `--app`, callers fall back to the historical flat layout under
 * `<baseDir>/` so existing scripts and the daemon's own state files keep
 * working unchanged.
 */

import * as path from 'path';

export interface RunSlotOptions {
  /** Project root or other absolute base — usually findProjectRoot(). */
  baseDir: string;
  /** Logical app name. When omitted, returns the flat layout (just baseDir). */
  app?: string;
  /** Override the run identifier. Defaults to env SWEETLINK_RUN or HHMM. */
  run?: string;
  /** Subdirectory inside the run slot — typically "term" / "sim" / "" (sessions). */
  kind?: 'term' | 'sim' | 'session' | '';
}

let _cachedRun: string | null = null;
function defaultRunId(): string {
  if (_cachedRun) return _cachedRun;
  if (process.env.SWEETLINK_RUN) {
    _cachedRun = process.env.SWEETLINK_RUN;
    return _cachedRun;
  }
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  // HHMM-SS — short and human-readable. The date component lives in the
  // parent directory, so duplicating it here would be noise.
  _cachedRun = `${pad(d.getHours())}${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return _cachedRun;
}

function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/**
 * Resolve the artifact directory for a capture.
 * - With `app`:  <base>/<app>/<YYYYMMDD>/<run>[/<kind>]
 * - Without:     <base>[/<kindMap>]   (back-compat with .sweetlink/term, etc.)
 */
export function runSlot(options: RunSlotOptions): string {
  const baseDir = options.baseDir.endsWith('.sweetlink')
    ? options.baseDir
    : path.join(options.baseDir, '.sweetlink');

  if (!options.app) {
    if (!options.kind || options.kind === 'session') return baseDir;
    return path.join(baseDir, options.kind);
  }

  const run = options.run ?? defaultRunId();
  const head = path.join(baseDir, options.app, todayYmd(), run);
  if (!options.kind || options.kind === 'session') return head;
  return path.join(head, options.kind);
}

/** Reset the cached run id — used in tests. */
export function _resetRunCache(): void {
  _cachedRun = null;
}
