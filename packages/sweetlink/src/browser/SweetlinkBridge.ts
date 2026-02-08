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
  handleGetLogs,
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

import { DEFAULT_WS_PORT, WS_PORT_OFFSET as SWEETLINK_PORT_OFFSET } from '../types.js';

const DEFAULT_MAX_PORT_RETRIES = 10;

/** HMR settings */
const DEFAULT_HMR_DEBOUNCE_MS = 300;
const DEFAULT_HMR_CAPTURE_DELAY_MS = 100;

/** Reconnection settings */
const RECONNECT_DELAY_MS = 2000;
const VERIFICATION_TIMEOUT_MS = 1000;
const PORT_RETRY_DELAY_MS = 100;
const PORT_SEARCH_FAIL_RETRY_MS = 3000;

export interface SweetlinkBridgeConfig {
  basePort?: number;
  maxPortRetries?: number;
  hmrScreenshots?: boolean;
  hmrDebounceMs?: number;
  hmrCaptureDelay?: number;
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
  private readonly maxPortRetries: number;
  private readonly hmrScreenshots: boolean;
  private readonly hmrConfig: HmrCaptureConfig;
  private readonly currentAppPort: number;

  // Cleanup functions
  private cleanupFunctions: (() => void)[] = [];
  private capture = new ConsoleCapture();

  constructor(config: SweetlinkBridgeConfig = {}) {
    // Skip on server-side
    if (typeof window === 'undefined') {
      this.basePort = DEFAULT_WS_PORT;
      this.maxPortRetries = DEFAULT_MAX_PORT_RETRIES;
      this.hmrScreenshots = false;
      this.hmrConfig = {
        debounceMs: DEFAULT_HMR_DEBOUNCE_MS,
        captureDelay: DEFAULT_HMR_CAPTURE_DELAY_MS,
      };
      this.currentAppPort = 0;
      return;
    }

    // Calculate app port from URL
    this.currentAppPort =
      parseInt(window.location.port, 10) || (window.location.protocol === 'https:' ? 443 : 80);

    // Calculate expected WS port (appPort + port offset)
    this.basePort =
      config.basePort ??
      (this.currentAppPort > 0 ? this.currentAppPort + SWEETLINK_PORT_OFFSET : DEFAULT_WS_PORT);

    this.maxPortRetries = config.maxPortRetries ?? DEFAULT_MAX_PORT_RETRIES;
    this.hmrScreenshots = config.hmrScreenshots ?? false;
    this.hmrConfig = {
      debounceMs: config.hmrDebounceMs ?? DEFAULT_HMR_DEBOUNCE_MS,
      captureDelay: config.hmrCaptureDelay ?? DEFAULT_HMR_CAPTURE_DELAY_MS,
    };
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
    this.connectWebSocket(this.basePort);

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

  private connectWebSocket(port: number): void {
    const wsUrl = `ws://localhost:${port}`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    this.verified = false;

    // Timeout for server-info response
    const verificationTimeout = setTimeout(() => {
      if (!this.verified && ws.readyState === WebSocket.OPEN) {
        // Server didn't send server-info (old version) - accept for backwards compatibility
        console.log(
          `[Sweetlink] Server on port ${port} is old version (no server-info). Accepting for backwards compatibility.`
        );
        this.verified = true;
        this.connected = true;
      }
    }, VERIFICATION_TIMEOUT_MS);

    ws.onopen = () => {
      console.log(`[Sweetlink] Connected to server on port ${port}`);
      ws.send(JSON.stringify({ type: 'browser-client-ready' }));
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);

        // Handle confirmation and info messages
        switch (message.type) {
          case 'screenshot-saved':
            console.log('[Sweetlink] Screenshot saved:', message.path);
            return;

          case 'design-review-saved':
            console.log('[Sweetlink] Design review saved:', message.reviewPath);
            return;

          case 'design-review-error':
            console.error('[Sweetlink] Design review failed:', message.error);
            return;

          case 'server-info': {
            clearTimeout(verificationTimeout);
            const info = message as ServerInfo;
            console.log('[Sweetlink] Server info received:', info);

            const serverMatchesApp = info.appPort === null || info.appPort === this.currentAppPort;

            if (!serverMatchesApp) {
              console.log(
                `[Sweetlink] Server is for port ${info.appPort}, but we're on port ${this.currentAppPort}. Trying next port...`
              );
              ws.close();

              const nextPort = port + 1;
              if (nextPort < this.basePort + this.maxPortRetries) {
                setTimeout(() => this.connectWebSocket(nextPort), PORT_RETRY_DELAY_MS);
              } else {
                console.log(
                  `[Sweetlink] No matching server found for port ${this.currentAppPort}. Will retry...`
                );
                setTimeout(() => this.connectWebSocket(this.basePort), PORT_SEARCH_FAIL_RETRY_MS);
              }
              return;
            }

            this.verified = true;
            this.serverInfo = info;
            this.connected = true;
            console.log(
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
        console.log('[Sweetlink] Received command:', command.type);

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
      console.log('[Sweetlink] Disconnected from server');
      this.connected = false;
      this.serverInfo = null;
      this.verified = false;

      // If closed due to origin mismatch (code 4001), try next port immediately
      if (event.code === 4001) {
        const nextPort = port + 1;
        if (nextPort < this.basePort + this.maxPortRetries) {
          console.log(`[Sweetlink] Origin mismatch, trying port ${nextPort}...`);
          setTimeout(() => this.connectWebSocket(nextPort), PORT_RETRY_DELAY_MS);
          return;
        }
      }

      // Try to reconnect
      this.reconnectTimeout = setTimeout(() => {
        console.log('[Sweetlink] Attempting to reconnect...');
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
