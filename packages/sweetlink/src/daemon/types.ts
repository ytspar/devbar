/**
 * Daemon Types
 *
 * Types for the persistent Playwright daemon process.
 * Separate from main types.ts to avoid polluting the browser bundle.
 */

// ============================================================================
// State File
// ============================================================================

/** Persisted daemon state written to .sweetlink/daemon.json */
export interface DaemonState {
  pid: number;
  port: number;
  token: string;
  startedAt: string;
  url: string;
  lastActivity: string;
}

// ============================================================================
// HTTP API
// ============================================================================

/**
 * Actions the daemon HTTP server handles. The demo-* commands are NOT in
 * this union — they are CLI-only and operate on a file-backed state via
 * `demoMod.*`, never reaching the daemon. Keeping them out of the type
 * prevents callers from constructing requests the server will reject.
 */
export type DaemonAction =
  | 'ping'
  | 'shutdown'
  | 'screenshot'
  | 'screenshot-responsive'
  | 'snapshot'
  | 'inspect'
  | 'click-ref'
  | 'click-css'
  | 'fill-ref'
  | 'hover-ref'
  | 'press-key'
  | 'console-read'
  | 'network-read'
  | 'dialog-read'
  | 'screenshot-devices'
  | 'visual-diff'
  | 'record-start'
  | 'record-stop'
  | 'record-status'
  | 'record-pause'
  | 'record-resume'
  | 'sessions-list'
  | 'generate-viewer';

/**
 * Per-action params shape. Adding a new action means extending this map
 * with the action's required params; the discriminated `DaemonRequest`
 * union then forces every caller to supply the right payload at compile
 * time. Actions not listed here implicitly accept no params.
 */
export interface DaemonActionParams {
  ping: undefined;
  shutdown: undefined;
  screenshot: ScreenshotParams | undefined;
  'screenshot-responsive': ResponsiveScreenshotParams | undefined;
  snapshot: { diff?: boolean } | undefined;
  inspect: { selector?: string } | undefined;
  'click-ref': { ref: string };
  'click-css': { selector?: string; text?: string; index?: number };
  'fill-ref': { ref: string; value: string };
  'hover-ref': { ref: string };
  'press-key': { key: string };
  'console-read': { errors?: boolean; last?: number } | undefined;
  'network-read': { last?: number; status?: number } | undefined;
  'dialog-read': { last?: number } | undefined;
  'screenshot-devices': Record<string, unknown> | undefined;
  'visual-diff': {
    baseline: string;
    current: string;
    threshold?: number;
    outputPath?: string;
  };
  'record-start': { url?: string; label?: string; trace?: boolean } | undefined;
  'record-stop': undefined;
  'record-status': undefined;
  'record-pause': undefined;
  'record-resume': undefined;
  'sessions-list': undefined;
  'generate-viewer': { sessionDir: string; outputPath?: string };
}

/**
 * Request body for daemon HTTP POST. Discriminated on `action` so each
 * variant carries only the params shape that action accepts.
 *
 * The dispatch surface (`DAEMON_HANDLERS` in server.ts) still receives
 * `params: Record<string, unknown>` because the wire format is JSON —
 * but on the producing side, callers that build a typed DaemonRequest
 * get compile-time checking.
 */
export type DaemonRequest = {
  [A in DaemonAction]: { action: A; params: DaemonActionParams[A] };
}[DaemonAction];

/**
 * Response from the daemon HTTP server. Discriminated by `ok`:
 * a successful response is `{ ok: true; data?: ... }` (no `error`),
 * a failure is `{ ok: false; error: string; data?: ... }`. Some failure
 * paths still attach a `data` payload with diagnostic context (e.g. a
 * failure screenshot path) so we keep `data` optional on both branches.
 */
export type DaemonResponse =
  | { ok: true; data?: Record<string, unknown>; error?: never }
  | { ok: false; error: string; data?: Record<string, unknown> };

// ============================================================================
// Screenshot Params
// ============================================================================

export interface ScreenshotParams {
  selector?: string;
  fullPage?: boolean;
  /** Named preset, `WxH` string, or arbitrary string for back-compat. */
  viewport?: import('../viewportUtils.js').ViewportName | string;
  output?: string;
  hideDevbar?: boolean;
}

export interface ScreenshotResponseData {
  screenshot: string; // base64
  width: number;
  height: number;
  path?: string;
}

export interface ResponsiveScreenshotParams {
  viewports?: number[];
  fullPage?: boolean;
  output?: string;
  hideDevbar?: boolean;
}

export interface ResponsiveScreenshotResponseData {
  screenshots: Array<{
    width: number;
    height: number;
    screenshot: string; // base64
    label: string;
  }>;
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum port for daemon HTTP server */
export const DAEMON_PORT_MIN = 10000;

/** Maximum port for daemon HTTP server */
export const DAEMON_PORT_MAX = 60000;

/** Idle timeout before daemon auto-stops (ms) */
export const DAEMON_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/** Max time to wait for daemon to start (ms) */
export const DAEMON_SPAWN_TIMEOUT_MS = 15_000;

/** Poll interval when waiting for daemon state file (ms) */
export const DAEMON_POLL_INTERVAL_MS = 200;

/** State directory name */
export const DAEMON_STATE_DIR = '.sweetlink';

/** State file name */
export const DAEMON_STATE_FILE = 'daemon.json';

/** Lock file name */
export const DAEMON_LOCK_FILE = 'daemon.lock';

/** Default responsive viewports */
export const DEFAULT_RESPONSIVE_VIEWPORTS = [375, 768, 1280];
