/**
 * SweetlinkBridge - Vanilla JS WebSocket bridge for browser-side Sweetlink integration
 *
 * This module provides framework-agnostic browser integration for Sweetlink,
 * eliminating the React dependency to avoid conflicts with host applications.
 *
 * @version 1.0.0
 */

import type { ConsoleLog, ServerInfo, SweetlinkCommand, SweetlinkResponse } from '../types.js';
// Import command handlers
import {
  handleExecJS,
  handleGetA11y,
  handleGetLogs,
  handleGetOutline,
  handleGetSchema,
  handleGetVitals,
  handleQueryDOM,
  handleRequestScreenshot,
  handleScreenshot,
} from './commands/index.js';
import { ConsoleCapture } from './consoleCapture.js';

// Import HMR utilities
import {
  captureHmrScreenshot,
  type HmrCaptureConfig,
  type HmrCaptureState,
  setupHmrDetection,
} from './hmr.js';

// ============================================================================
// Constants
// ============================================================================

import {
  buildSweetlinkWsUrlCandidates,
  DEFAULT_WS_PORT,
  getSweetlinkRuntimeConfig,
  MAX_PORT_RETRIES,
  PORT_RETRY_DELAY_MS,
  parsePortNumber,
  resolveAppPortFromRuntimeConfig,
  resolveSweetlinkWsPortForAppPort,
  SWEETLINK_ACK_TIMEOUT_MS,
  toSafeWsPort,
} from '../types.js';

/** HMR settings */
const DEFAULT_HMR_DEBOUNCE_MS = 300;
const DEFAULT_HMR_CAPTURE_DELAY_MS = 100;

/** Reconnection settings */
const RECONNECT_DELAY_MS = 2000;
const PORT_SEARCH_FAIL_RETRY_MS = 3000;

export interface SweetlinkBridgeConfig {
  basePort?: number;
  appPort?: number;
  wsPort?: number;
  wsUrl?: string;
  wsPath?: string;
  maxPortRetries?: number;
  hmrScreenshots?: boolean;
  hmrDebounceMs?: number;
  hmrCaptureDelay?: number;
  /** Enable verbose console.log output for debugging connection and command flow */
  debug?: boolean;
}

// ============================================================================
// SweetlinkBridge Class
// ============================================================================

export class SweetlinkBridge {
  private ws: WebSocket | null = null;
  private connected = false;
  private serverInfo: ServerInfo | null = null;
  private verified = false;
  private consoleLogs: ConsoleLog[] = [];
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private savedScreenshotTimeout: ReturnType<typeof setTimeout> | null = null;
  private savedReviewTimeout: ReturnType<typeof setTimeout> | null = null;
  private active = false;

  // HMR tracking
  private hmrState: HmrCaptureState = {
    sequence: 0,
    debounceTimeout: null,
    lastCaptureTime: 0,
  };

  // Configuration
  private readonly basePort: number;
  private readonly wsUrlCandidates: readonly string[];
  private readonly maxPortRetries: number;
  private readonly hmrScreenshots: boolean;
  private readonly hmrConfig: HmrCaptureConfig;
  private readonly currentAppPort: number;
  private readonly debug: boolean;

  // Cleanup functions
  private cleanupFunctions: (() => void)[] = [];
  private capture = new ConsoleCapture();

  constructor(config: SweetlinkBridgeConfig = {}) {
    this.debug = config.debug ?? false;

    // Skip on server-side
    if (typeof window === 'undefined') {
      this.basePort = DEFAULT_WS_PORT;
      this.maxPortRetries = MAX_PORT_RETRIES;
      this.hmrScreenshots = false;
      this.hmrConfig = {
        debounceMs: DEFAULT_HMR_DEBOUNCE_MS,
        captureDelay: DEFAULT_HMR_CAPTURE_DELAY_MS,
      };
      this.currentAppPort = 0;
      this.wsUrlCandidates = [`ws://localhost:${DEFAULT_WS_PORT}`];
      return;
    }

    // Calculate expected app and WS ports from the browser URL.
    const runtimeConfig = getSweetlinkRuntimeConfig(window);
    this.currentAppPort =
      config.appPort ?? resolveAppPortFromRuntimeConfig(window.location, runtimeConfig);
    this.basePort =
      config.basePort ??
      config.wsPort ??
      parsePortNumber(runtimeConfig.wsPort) ??
      resolveSweetlinkWsPortForAppPort(this.currentAppPort);
    this.wsUrlCandidates = buildSweetlinkWsUrlCandidates(window.location, {
      wsUrl: config.wsUrl ?? runtimeConfig.wsUrl,
      wsPort: config.wsPort ?? config.basePort ?? runtimeConfig.wsPort,
      wsPath: config.wsPath ?? runtimeConfig.wsPath,
      fallbackPort: this.basePort,
    });

    this.maxPortRetries = config.maxPortRetries ?? MAX_PORT_RETRIES;
    this.hmrScreenshots = config.hmrScreenshots ?? false;
    this.hmrConfig = {
      debounceMs: config.hmrDebounceMs ?? DEFAULT_HMR_DEBOUNCE_MS,
      captureDelay: config.hmrCaptureDelay ?? DEFAULT_HMR_CAPTURE_DELAY_MS,
    };
  }

  /** Log informational message only when debug is enabled */
  private log(...args: unknown[]): void {
    if (this.debug) console.log(...args);
  }

  /**
   * Initialize the bridge - call this to start the connection
   */
  init(): void {
    if (typeof window === 'undefined') return;

    this.active = true;
    this.capture.importEarlyLogs();
    this.capture.start();
    this.consoleLogs = this.capture.getLogs();
    this.capture.addListener(() => {
      this.consoleLogs = this.capture.getLogs();
    });
    this.setupErrorHandlers();
    this.connectWebSocket(this.wsUrlCandidates[0] ?? this.basePort);

    if (this.hmrScreenshots) {
      const cleanup = setupHmrDetection((trigger, changedFile, hmrMetadata) => {
        if (this.verified) {
          captureHmrScreenshot(
            this.ws,
            this.consoleLogs,
            this.hmrState,
            this.hmrConfig,
            trigger,
            changedFile,
            hmrMetadata
          );
        }
      });
      this.cleanupFunctions.push(cleanup);
    }
  }

  /**
   * Clean up and disconnect
   */
  destroy(): void {
    this.active = false;

    // Clear timeouts
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.savedScreenshotTimeout) clearTimeout(this.savedScreenshotTimeout);
    if (this.savedReviewTimeout) clearTimeout(this.savedReviewTimeout);
    if (this.hmrState.debounceTimeout) clearTimeout(this.hmrState.debounceTimeout);

    // Null out timeout references to prevent stale references
    this.reconnectTimeout = null;
    this.savedScreenshotTimeout = null;
    this.savedReviewTimeout = null;

    // Reset HMR state to prevent memory leaks from closure references
    this.hmrState = {
      sequence: 0,
      debounceTimeout: null,
      lastCaptureTime: 0,
    };

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Restore console
    this.capture.stop();

    // Run cleanup functions
    this.cleanupFunctions.forEach((fn) => fn());
    this.cleanupFunctions = [];

    // Clear console logs array to free memory
    this.consoleLogs = [];

    // Clear server info
    this.serverInfo = null;

    this.connected = false;
    this.verified = false;
  }

  /**
   * Check if connected to server
   */
  isConnected(): boolean {
    return this.connected && this.verified;
  }

  /**
   * Get server info
   */
  getServerInfo(): ServerInfo | null {
    return this.serverInfo;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private setupErrorHandlers(): void {
    const cleanup = this.capture.startErrorHandlers();
    this.cleanupFunctions.push(cleanup);
  }

  private getWsUrlForTarget(target: number | string): string {
    return typeof target === 'string' ? target : `ws://localhost:${target}`;
  }

  private getPortForTarget(targetUrl: string): number | null {
    try {
      const url = new URL(targetUrl);
      if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return null;
      return parsePortNumber(url.port);
    } catch {
      return null;
    }
  }

  private scheduleConnect(target: number | string, delayMs: number): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (!this.active) return;
      this.connectWebSocket(target);
    }, delayMs);
  }

  private connectNextTarget(targetUrl: string, delayMs: number = PORT_RETRY_DELAY_MS): boolean {
    if (!this.active) return false;

    const candidateIndex = this.wsUrlCandidates.indexOf(targetUrl);
    if (candidateIndex >= 0 && candidateIndex + 1 < this.wsUrlCandidates.length) {
      this.scheduleConnect(this.wsUrlCandidates[candidateIndex + 1]!, delayMs);
      return true;
    }

    const targetPort = this.getPortForTarget(targetUrl);
    if (targetPort !== null) {
      // Skip browser-restricted ports while scanning — the server-side port
      // retry does the same, so both sides walk the same sequence.
      const nextPort = toSafeWsPort(targetPort + 1);
      if (nextPort < this.basePort + this.maxPortRetries) {
        this.scheduleConnect(nextPort, delayMs);
        return true;
      }
    }

    return false;
  }

  private connectWebSocket(target: number | string): void {
    if (!this.active) return;

    const wsUrl = this.getWsUrlForTarget(target);
    const ws = new WebSocket(wsUrl);
    let switchingTargets = false;
    this.ws = ws;
    this.verified = false;

    // Require the server-info ack before treating the socket as connected.
    // An OPEN socket is NOT a Sweetlink connection: dev-server upgrade
    // handlers (e.g. Next's HMR endpoint reached through an HTTPS proxy's
    // /__sweetlink path) accept arbitrary WS upgrades and swallow every
    // message. No ack within the window → close, try the next candidate.
    // The timer starts at `open` (a refused connection is handled by
    // onclose; arming it earlier would double-schedule the candidate walk).
    let verificationTimeout: ReturnType<typeof setTimeout> | undefined;

    ws.onopen = () => {
      this.log(`[Sweetlink] Socket open on ${wsUrl} — awaiting server-info ack`);
      // Report our location so the server can route targeted CLI commands
      // (--url) to the client that is actually on the requested page.
      ws.send(JSON.stringify({ type: 'browser-client-ready', url: window.location.href }));
      verificationTimeout = setTimeout(() => {
        if (this.verified || !this.active) return;
        this.log(
          `[Sweetlink] No server-info ack from ${wsUrl} — not a Sweetlink server. Trying next candidate...`
        );
        switchingTargets = true;
        ws.close();
        if (!this.connectNextTarget(wsUrl)) {
          this.scheduleConnect(this.basePort, PORT_SEARCH_FAIL_RETRY_MS);
        }
      }, SWEETLINK_ACK_TIMEOUT_MS);
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);

        // Handle confirmation and info messages
        switch (message.type) {
          case 'screenshot-saved':
            this.log('[Sweetlink] Screenshot saved:', message.path);
            return;

          case 'design-review-saved':
            this.log('[Sweetlink] Design review saved:', message.reviewPath);
            return;

          case 'design-review-error':
            console.error('[Sweetlink] Design review failed:', message.error);
            return;

          case 'server-info': {
            clearTimeout(verificationTimeout);
            const info = message as ServerInfo;
            this.log('[Sweetlink] Server info received:', info);

            const serverMatchesApp = info.appPort === null || info.appPort === this.currentAppPort;

            if (!serverMatchesApp) {
              this.log(
                `[Sweetlink] Server is for port ${info.appPort}, but we're on port ${this.currentAppPort}. Trying next port...`
              );
              switchingTargets = true;
              ws.close();
              if (!this.connectNextTarget(wsUrl)) {
                this.log(
                  `[Sweetlink] No matching server found for port ${this.currentAppPort}. Will retry...`
                );
                this.scheduleConnect(this.basePort, PORT_SEARCH_FAIL_RETRY_MS);
              }
              return;
            }

            this.verified = true;
            this.serverInfo = info;
            this.connected = true;
            this.log(
              `[Sweetlink] Verified connection to server for port ${info.appPort ?? 'any'} (project: ${info.projectDir})`
            );
            return;
          }
        }

        if (!this.verified) {
          console.warn('[Sweetlink] Ignoring command before verification');
          return;
        }

        const command = message as SweetlinkCommand;

        const response = await this.handleCommand(command);
        ws.send(JSON.stringify(response));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Sweetlink] Error handling command:', errorMessage);

        ws.send(
          JSON.stringify({
            success: false,
            error: errorMessage,
            timestamp: Date.now(),
          } as SweetlinkResponse)
        );
      }
    };

    ws.onclose = (event) => {
      clearTimeout(verificationTimeout);
      this.log('[Sweetlink] Disconnected from server');
      const wasVerified = this.verified;
      this.connected = false;
      this.serverInfo = null;
      this.verified = false;

      // We initiated this close while switching candidates (server-info
      // mismatch or missing ack) and already scheduled the next target —
      // don't let the generic reconnect below clobber that schedule.
      if (switchingTargets) return;

      // If closed due to origin mismatch (code 4001), try next port immediately
      if (event.code === 4001) {
        this.log(`[Sweetlink] Origin mismatch from ${wsUrl}; trying next target...`);
        if (this.connectNextTarget(wsUrl)) return;
      }

      if (!wasVerified && this.connectNextTarget(wsUrl)) {
        this.log(`[Sweetlink] Connection closed before verification from ${wsUrl}`);
        return;
      }

      // Try to reconnect
      this.scheduleConnect(this.basePort, RECONNECT_DELAY_MS);
    };

    ws.onerror = (error) => {
      clearTimeout(verificationTimeout);
      this.log('[Sweetlink] WebSocket connection error:', {
        url: wsUrl,
        readyState: ws.readyState,
        error,
      });
    };
  }

  private async handleCommand(command: SweetlinkCommand): Promise<SweetlinkResponse> {
    switch (command.type) {
      case 'screenshot':
        return await handleScreenshot(command);

      case 'request-screenshot':
        return await handleRequestScreenshot(command, this.ws);

      case 'query-dom':
        return handleQueryDOM(command);

      case 'get-logs':
        return handleGetLogs(command, this.consoleLogs);

      case 'exec-js':
        return handleExecJS(command);

      case 'get-schema':
        return handleGetSchema();

      case 'get-outline':
        return handleGetOutline();

      case 'get-a11y':
        return await handleGetA11y(command);

      case 'get-vitals':
        return await handleGetVitals();

      default:
        return {
          success: false,
          error: `Unknown command: ${command.type}`,
          timestamp: Date.now(),
        };
    }
  }
}

// ============================================================================
// Auto-initialization function for script tag usage
// ============================================================================

let globalBridge: SweetlinkBridge | null = null;

/**
 * Initialize Sweetlink Bridge - call from host application
 */
export function initSweetlinkBridge(config?: SweetlinkBridgeConfig): SweetlinkBridge {
  if (globalBridge) {
    return globalBridge;
  }

  globalBridge = new SweetlinkBridge(config);
  globalBridge.init();
  return globalBridge;
}

/**
 * Get the global bridge instance
 */
export function getSweetlinkBridge(): SweetlinkBridge | null {
  return globalBridge;
}

/**
 * Destroy the global bridge instance
 */
export function destroySweetlinkBridge(): void {
  if (globalBridge) {
    globalBridge.destroy();
    globalBridge = null;
  }
}

// Export default for backwards compatibility
export default SweetlinkBridge;
