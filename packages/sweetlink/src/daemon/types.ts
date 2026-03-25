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

/** Actions the daemon HTTP server handles */
export type DaemonAction =
  | 'ping'
  | 'shutdown'
  | 'screenshot'
  | 'screenshot-responsive'
  | 'snapshot'
  | 'click-ref'
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
  | 'record-status';

/** Request body for daemon HTTP POST */
export interface DaemonRequest {
  action: DaemonAction;
  params?: Record<string, unknown>;
}

/** Response from daemon HTTP server */
export interface DaemonResponse {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// Screenshot Params
// ============================================================================

export interface ScreenshotParams {
  selector?: string;
  fullPage?: boolean;
  viewport?: string;
  output?: string;
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
