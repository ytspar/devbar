/**
 * devbar Debug Utilities
 *
 * Debug logging system for devbar lifecycle, state, and events.
 */

import type { DebugConfig } from './types.js';

/**
 * Normalize debug option to DebugConfig
 */
export function normalizeDebugConfig(debug: boolean | DebugConfig | undefined): DebugConfig {
  if (!debug) {
    return { enabled: false };
  }
  if (debug === true) {
    return {
      enabled: true,
      logLifecycle: true,
      logStateChanges: true,
      logWebSocket: true,
      logPerformance: true,
    };
  }
  return {
    enabled: debug.enabled,
    logLifecycle: debug.logLifecycle ?? true,
    logStateChanges: debug.logStateChanges ?? true,
    logWebSocket: debug.logWebSocket ?? true,
    logPerformance: debug.logPerformance ?? true,
  };
}

/**
 * Debug logger for devbar
 */
export class DebugLogger {
  private config: DebugConfig;
  private prefix = '[devbar]';

  constructor(config: DebugConfig) {
    this.config = config;
  }

  /**
   * Update debug configuration
   */
  setConfig(config: DebugConfig): void {
    this.config = config;
  }

  /**
   * Log lifecycle events (init, destroy, etc.)
   */
  lifecycle(message: string, data?: unknown): void {
    if (this.config.enabled && this.config.logLifecycle) {
      this.log('lifecycle', message, data);
    }
  }

  /**
   * Log state changes (collapse, modal open/close, etc.)
   */
  state(message: string, data?: unknown): void {
    if (this.config.enabled && this.config.logStateChanges) {
      this.log('state', message, data);
    }
  }

  /**
   * Log WebSocket events (connect, disconnect, messages)
   */
  ws(message: string, data?: unknown): void {
    if (this.config.enabled && this.config.logWebSocket) {
      this.log('ws', message, data);
    }
  }

  /**
   * Log performance measurements (FCP, LCP, CLS, INP)
   */
  perf(message: string, data?: unknown): void {
    if (this.config.enabled && this.config.logPerformance) {
      this.log('perf', message, data);
    }
  }

  private log(category: string, message: string, data?: unknown): void {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const categoryColors: Record<string, string> = {
      lifecycle: '#10b981', // emerald
      state: '#3b82f6', // blue
      ws: '#a855f7', // purple
      perf: '#f59e0b', // amber
    };
    const color = categoryColors[category] || '#6b7280';

    if (data !== undefined) {
      console.log(
        `%c${this.prefix}%c [${category}] %c${timestamp}%c ${message}`,
        'color: #10b981; font-weight: bold',
        `color: ${color}`,
        'color: #6b7280',
        'color: inherit',
        data
      );
    } else {
      console.log(
        `%c${this.prefix}%c [${category}] %c${timestamp}%c ${message}`,
        'color: #10b981; font-weight: bold',
        `color: ${color}`,
        'color: #6b7280',
        'color: inherit'
      );
    }
  }
}
