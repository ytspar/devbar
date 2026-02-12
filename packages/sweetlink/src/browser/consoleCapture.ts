/**
 * Console Capture Utility
 *
 * Shared console capturing logic used by both GlobalDevBar and SweetlinkBridge.
 * Provides consistent console interception and log formatting.
 */

import type { ConsoleLog } from '../types.js';

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of console logs to retain */
export const MAX_CONSOLE_LOGS = 100;

// ============================================================================
// Types
// ============================================================================

/**
 * Original console methods stored for restoration
 */
export interface OriginalConsoleMethods {
  log: typeof console.log;
  error: typeof console.error;
  warn: typeof console.warn;
  info: typeof console.info;
}

/**
 * Console capture state
 */
export interface ConsoleCaptureState {
  logs: ConsoleLog[];
  errorCount: number;
  warningCount: number;
  originalConsole: OriginalConsoleMethods | null;
  isPatched: boolean;
}

/**
 * Configuration for console capture
 */
export interface ConsoleCaptureConfig {
  maxLogs?: number;
  trackCounts?: boolean;
  onLog?: (log: ConsoleLog) => void;
}

/**
 * Listener callback for log count changes
 */
export type LogChangeListener = (errorCount: number, warningCount: number, infoCount: number) => void;

// ============================================================================
// Formatting Utilities
// ============================================================================

/**
 * Format a single argument for logging
 */
export function formatArg(arg: unknown): string {
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`;
  }
  if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
    return String(arg);
  }
  if (typeof arg === 'object' && arg !== null) {
    try {
      return JSON.stringify(arg, (_key, val) => {
        if (val instanceof Error) {
          return `${val.name}: ${val.message}`;
        }
        return val;
      });
    } catch {
      return '[object]';
    }
  }
  return String(arg);
}

/**
 * Format multiple arguments into a single message string
 */
export function formatArgs(args: unknown[]): string {
  return args.map(formatArg).join(' ');
}

// ============================================================================
// Console Capture Class
// ============================================================================

/**
 * ConsoleCapture - Captures console output and stores logs
 */
export class ConsoleCapture {
  private logs: ConsoleLog[] = [];
  private errorCount = 0;
  private warningCount = 0;
  private infoCount = 0;
  private originalConsole: OriginalConsoleMethods | null = null;
  private isPatched = false;
  private maxLogs: number;
  private trackCounts: boolean;
  private onLog?: (log: ConsoleLog) => void;
  private listeners: LogChangeListener[] = [];

  constructor(config: ConsoleCaptureConfig = {}) {
    this.maxLogs = config.maxLogs ?? MAX_CONSOLE_LOGS;
    this.trackCounts = config.trackCounts ?? true;
    this.onLog = config.onLog;
  }

  /**
   * Start capturing console output
   */
  start(): void {
    if (typeof window === 'undefined') return;
    if (this.isPatched) return;

    this.originalConsole = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      info: console.info.bind(console),
    };

    const captureLog = (level: string, args: unknown[]) => {
      const log: ConsoleLog = {
        level,
        message: formatArgs(args),
        timestamp: Date.now(),
      };

      this.logs.push(log);
      if (this.logs.length > this.maxLogs) {
        this.logs = this.logs.slice(-this.maxLogs);
      }

      if (this.trackCounts) {
        if (level === 'error') this.errorCount++;
        else if (level === 'warn') this.warningCount++;
        else if (level === 'info') this.infoCount++;
      }

      if (this.onLog) {
        this.onLog(log);
      }

      this.notifyListeners();
    };

    // Patch all console methods with a unified wrapper
    const levels = ['log', 'error', 'warn', 'info'] as const;
    for (const level of levels) {
      const original = this.originalConsole![level];
      console[level] = (...args: unknown[]) => {
        captureLog(level, args);
        original(...args);
      };
    }

    this.isPatched = true;
  }

  /**
   * Stop capturing and restore original console methods
   */
  stop(): void {
    if (!this.isPatched || !this.originalConsole) return;

    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;

    this.isPatched = false;
  }

  /**
   * Get all captured logs
   */
  getLogs(): ConsoleLog[] {
    return [...this.logs];
  }

  /**
   * Get filtered logs
   */
  getFilteredLogs(filter: string): ConsoleLog[] {
    const filterLower = filter.toLowerCase();
    return this.logs.filter(
      (log) => log.level === filterLower || log.message.toLowerCase().includes(filterLower)
    );
  }

  /**
   * Get error count
   */
  getErrorCount(): number {
    return this.errorCount;
  }

  /**
   * Get warning count
   */
  getWarningCount(): number {
    return this.warningCount;
  }

  /**
   * Get info count
   */
  getInfoCount(): number {
    return this.infoCount;
  }

  /**
   * Add a listener for log count changes
   */
  addListener(listener: LogChangeListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove a listener
   */
  removeListener(listener: LogChangeListener): void {
    const idx = this.listeners.indexOf(listener);
    if (idx !== -1) this.listeners.splice(idx, 1);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.errorCount, this.warningCount, this.infoCount);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Get current state
   */
  getState(): ConsoleCaptureState {
    return {
      logs: this.getLogs(),
      errorCount: this.errorCount,
      warningCount: this.warningCount,
      originalConsole: this.originalConsole,
      isPatched: this.isPatched,
    };
  }

  /**
   * Import logs from another source (e.g., early capture)
   */
  importLogs(logs: ConsoleLog[]): void {
    this.logs = [...logs, ...this.logs].slice(-this.maxLogs);
  }

  /**
   * Import early logs from window.__sweetlinkEarlyLogs (set by EARLY_CONSOLE_CAPTURE_SCRIPT)
   * and clear the global array. Converts ISO timestamp strings to epoch milliseconds.
   */
  importEarlyLogs(): void {
    if (typeof window === 'undefined' || !window.__sweetlinkEarlyLogs) return;

    const earlyLogs: ConsoleLog[] = window.__sweetlinkEarlyLogs.map((log) => ({
      level: log.level,
      message: log.message,
      timestamp: typeof log.timestamp === 'string' ? new Date(log.timestamp).getTime() : Number(log.timestamp),
    }));

    this.importLogs(earlyLogs);
    window.__sweetlinkEarlyLogs = [];
  }

  /**
   * Push a log entry directly (used by error/rejection handlers)
   */
  addLog(log: ConsoleLog): void {
    this.logs.push(log);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    if (this.trackCounts && log.level === 'error') this.errorCount++;
    this.notifyListeners();
  }

  /**
   * Start listening for uncaught errors and unhandled rejections
   */
  startErrorHandlers(): () => void {
    if (typeof window === 'undefined') return () => {};

    const errorHandler = (event: Event) => {
      // Resource load errors (img 404, script 404, etc.) fire an Event on
      // the target element that bubbles to window. They have no `message`
      // and their target is the failing element, not the window.  Skip them
      // to avoid re-render loops when the devbar itself shows broken images.
      if (!(event instanceof ErrorEvent)) return;

      this.addLog({
        level: 'error',
        message: `Uncaught: ${event.message}`,
        timestamp: Date.now(),
        source: event.filename,
        stack: event.error?.stack,
      });
    };

    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      this.addLog({
        level: 'error',
        message: reason instanceof Error
          ? `Unhandled rejection: ${reason.name}: ${reason.message}`
          : `Unhandled rejection: ${String(reason)}`,
        timestamp: Date.now(),
        stack: reason?.stack,
      });
    };

    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', rejectionHandler);

    return () => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
    };
  }

  /**
   * Clear all logs and reset counts
   */
  clear(): void {
    this.logs = [];
    this.errorCount = 0;
    this.warningCount = 0;
    this.infoCount = 0;
  }
}

