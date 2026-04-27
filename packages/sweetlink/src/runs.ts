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
  /** Subdirectory inside the run slot. Omit for the session root. */
  kind?: 'term' | 'sim' | 'session';
}

/**
 * Slugify a user-supplied namespace segment into something safe to use as a
 * directory name. Without this, `--app ../../../tmp/x` would let a malicious
 * caller (CI template, package.json script, batch JSON producer) write
 * artifacts anywhere the user can write — including ~/.ssh/authorized_keys
 * or LaunchAgents. Limited charset matches the existing --label slugifier.
 */
export function slugifyNamespace(value: string): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (!cleaned) {
    throw new Error(
      `Invalid namespace "${value}" — must contain at least one alphanumeric, dash, or underscore character`
    );
  }
  return cleaned;
}

function defaultRunId(): string {
  if (process.env.SWEETLINK_RUN) return slugifyNamespace(process.env.SWEETLINK_RUN);
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  // HHMM-SS — short and human-readable. The date component lives in the
  // parent directory, so duplicating it here would be noise.
  return `${pad(d.getHours())}${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
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
 *
 * `app` and `run` are slugified to prevent path traversal — anyone who can
 * influence a sweetlink invocation (npm script, CI template, batch stdin)
 * could otherwise pass `../../../tmp/x` and target arbitrary writable paths.
 */
export function runSlot(options: RunSlotOptions): string {
  const baseDir = options.baseDir.endsWith('.sweetlink')
    ? options.baseDir
    : path.join(options.baseDir, '.sweetlink');

  if (!options.app) {
    if (!options.kind || options.kind === 'session') return baseDir;
    return path.join(baseDir, options.kind);
  }

  const safeApp = slugifyNamespace(options.app);
  const safeRun = options.run ? slugifyNamespace(options.run) : defaultRunId();
  const head = path.join(baseDir, safeApp, todayYmd(), safeRun);
  if (!options.kind || options.kind === 'session') return head;
  return path.join(head, options.kind);
}

/** Reset internal caches — kept for back-compat with existing tests; now a no-op. */
export function _resetRunCache(): void {
  /* no-op: runIds are no longer cached at module level */
}
