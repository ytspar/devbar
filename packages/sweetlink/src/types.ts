/**
 * Shared Type Definitions for Sweetlink
 *
 * These types are used by both the server (server.ts), the browser bridge
 * (SweetlinkBridge.ts), and the devbar package (GlobalDevBar.ts).
 */

// ============================================================================
// Console Log Types
// ============================================================================

/**
 * Structure for captured console log entries
 */
export interface ConsoleLog {
  level: 'log' | 'error' | 'warn' | 'info' | 'debug' | string;
  message: string;
  timestamp: number;
  stack?: string;
  source?: string;
}

// ============================================================================
// WebSocket Command Types
// ============================================================================

/**
 * Commands that can be sent over the Sweetlink WebSocket connection
 */
export interface SweetlinkCommand {
  type:
    | 'screenshot'
    | 'query-dom'
    | 'get-logs'
    | 'exec-js'
    | 'get-network'
    | 'browser-client-ready'
    | 'save-screenshot'
    | 'design-review-screenshot'
    | 'check-api-key'
    | 'api-key-status'
    | 'save-outline'
    | 'save-schema'
    | 'refresh'
    | 'request-screenshot'
    | 'screenshot-response'
    | 'log-subscribe'
    | 'log-unsubscribe'
    | 'log-event'
    | 'hmr-screenshot'
    | 'subscribe'
    | 'unsubscribe'
    | 'screenshot-saved'
    | 'design-review-saved'
    | 'design-review-error'
    | 'outline-saved'
    | 'outline-error'
    | 'schema-saved'
    | 'schema-error';
  selector?: string;
  property?: string;
  code?: string;
  filter?: string;
  options?: Record<string, unknown>;
  data?: unknown;
  path?: string;
  screenshotPath?: string;
  reviewPath?: string;
  outlinePath?: string;
  schemaPath?: string;
  error?: string;
  // v1.4.0 fields
  requestId?: string;
  subscriptionId?: string;
  channel?: string;
  captureConsole?: boolean;
  timeout?: number;
  format?: 'jpeg' | 'png';
  quality?: number;
  scale?: number;
  includeMetadata?: boolean;
  filters?: {
    levels?: ('log' | 'error' | 'warn' | 'info' | 'debug')[];
    pattern?: string;
    source?: string;
  };
}

/**
 * Response structure for Sweetlink commands
 */
export interface SweetlinkResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  timestamp: number;
  consoleLogs?: ConsoleLog[];
  duration?: number;
}

// ============================================================================
// HMR Types
// ============================================================================

/**
 * Data structure for HMR-triggered screenshots
 */
export interface HmrScreenshotData {
  trigger: string;
  changedFile?: string;
  screenshot: string;
  url: string;
  timestamp: number;
  sequenceNumber: number;
  logs: {
    all: ConsoleLog[];
    errors: ConsoleLog[];
    warnings: ConsoleLog[];
    sinceLastCapture: number;
  };
  hmrMetadata?: {
    modulesUpdated?: string[];
    fullReload?: boolean;
    updateDuration?: number;
  };
}

// ============================================================================
// Server Info Types
// ============================================================================

/**
 * Server information sent to browser clients
 */
export interface ServerInfo {
  type: 'server-info';
  appPort: number | null;
  wsPort: number;
  projectDir: string;
  timestamp: number;
}

// ============================================================================
// Document Structure Types
// ============================================================================

/**
 * Node in the document outline tree
 */
export interface OutlineNode {
  tagName: string;
  level: number;
  text: string;
  id?: string;
  children: OutlineNode[];
  category?: string;
}

/**
 * Extracted page schema information
 */
export interface PageSchema {
  jsonLd: unknown[];
  metaTags: Record<string, string>;
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
  microdata: unknown[];
}

// ============================================================================
// Subscription Types (v1.4.0)
// ============================================================================

/**
 * Log subscription for streaming logs to CLI clients
 */
export interface LogSubscription {
  subscriptionId: string;
  filters?: {
    levels?: string[];
    pattern?: string;
    source?: string;
  };
}

/**
 * Channel subscription for generic event streams
 */
export interface ChannelSubscription {
  channel: string;
}
