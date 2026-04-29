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
  createSameOriginSweetlinkWsUrl,
  DEFAULT_WS_PORT,
  getSweetlinkRuntimeConfig,
  MAX_PORT_RETRIES,
  PORT_RETRY_DELAY_MS,
  parsePortNumber,
  resolveAppPortFromRuntimeConfig,
  resolveSweetlinkWsPortForAppPort,
} from '../types.js';

/** HMR settings */
const DEFAULT_HMR_DEBOUNCE_MS = 300;
const DEFAULT_HMR_CAPTURE_DELAY_MS = 100;

/** Reconnection settings */
const RECONNECT_DELAY_MS = 2000;
const VERIFICATION_TIMEOUT_MS = 1000;
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
    this.wsUrlCandidates = this.buildWsUrlCandidates(window.location, {
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

  private buildWsUrlCandidates(
    location: Location,
    options: {
      wsUrl?: string | null;
      wsPort?: number | string | null;
      wsPath?: string | null;
      fallbackPort: number;
    }
  ): string[] {
    const urls: string[] = [];
    const add = (url: string | null | undefined): void => {
      if (url && !urls.includes(url)) urls.push(url);
    };

    add(options.wsUrl);
    if (options.wsPath) {
      add(createSameOriginSweetlinkWsUrl(location, options.wsPath));
    }
    add(`ws://localhost:${parsePortNumber(options.wsPort) ?? options.fallbackPort}`);
    return urls;
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

  private connectNextTarget(targetUrl: string, delayMs: number = PORT_RETRY_DELAY_MS): boolean {
    const candidateIndex = this.wsUrlCandidates.indexOf(targetUrl);
    if (candidateIndex >= 0 && candidateIndex + 1 < this.wsUrlCandidates.length) {
      setTimeout(() => this.connectWebSocket(this.wsUrlCandidates[candidateIndex + 1]!), delayMs);
      return true;
    }

    const targetPort = this.getPortForTarget(targetUrl);
    if (targetPort !== null) {
      const nextPort = targetPort + 1;
      if (nextPort < this.basePort + this.maxPortRetries) {
        setTimeout(() => this.connectWebSocket(nextPort), delayMs);
        return true;
      }
    }

    return false;
  }

  private connectWebSocket(target: number | string): void {
    const wsUrl = this.getWsUrlForTarget(target);
    const ws = new WebSocket(wsUrl);
    let switchingTargets = false;
    this.ws = ws;
    this.verified = false;

    // Timeout for server-info response
    const verificationTimeout = setTimeout(() => {
      if (!this.verified && ws.readyState === WebSocket.OPEN) {
        // Server didn't send server-info (old version) - accept for backwards compatibility
        this.log(
          `[Sweetlink] Server on ${wsUrl} is old version (no server-info). Accepting for backwards compatibility.`
        );
        this.verified = true;
        this.connected = true;
      }
    }, VERIFICATION_TIMEOUT_MS);

    ws.onopen = () => {
      this.log(`[Sweetlink] Connected to server on ${wsUrl}`);
      ws.send(JSON.stringify({ type: 'browser-client-ready' }));
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
                setTimeout(() => this.connectWebSocket(this.basePort), PORT_SEARCH_FAIL_RETRY_MS);
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

      // If closed due to origin mismatch (code 4001), try next port immediately
      if (event.code === 4001) {
        this.log(`[Sweetlink] Origin mismatch from ${wsUrl}; trying next target...`);
        if (this.connectNextTarget(wsUrl)) return;
      }

      if (!wasVerified && !switchingTargets && this.connectNextTarget(wsUrl)) {
        this.log(`[Sweetlink] Connection closed before verification from ${wsUrl}`);
        return;
      }

      // Try to reconnect
      this.reconnectTimeout = setTimeout(() => {
        this.log('[Sweetlink] Attempting to reconnect...');
        this.connectWebSocket(this.basePort);
      }, RECONNECT_DELAY_MS);
    };

    ws.onerror = (error) => {
      clearTimeout(verificationTimeout);
      console.error('[Sweetlink] WebSocket error:', error);
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
