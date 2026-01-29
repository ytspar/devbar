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
    | 'save-settings'
    | 'load-settings'
    | 'settings-loaded'
    | 'settings-saved'
    | 'settings-error'
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
  settingsPath?: string;
  settings?: unknown;
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

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a valid SweetlinkCommand
 */
export function isSweetlinkCommand(value: unknown): value is SweetlinkCommand {
  return (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    typeof (value as Record<string, unknown>).type === 'string'
  );
}

/**
 * Check if a value is a valid ConsoleLog
 */
export function isConsoleLog(value: unknown): value is ConsoleLog {
  return (
    value !== null &&
    typeof value === 'object' &&
    'level' in value &&
    'message' in value &&
    'timestamp' in value &&
    typeof (value as Record<string, unknown>).level === 'string' &&
    typeof (value as Record<string, unknown>).message === 'string' &&
    typeof (value as Record<string, unknown>).timestamp === 'number'
  );
}

/**
 * Check if a value is a valid HmrScreenshotData
 */
export function isHmrScreenshotData(value: unknown): value is HmrScreenshotData {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.trigger === 'string' &&
    typeof obj.screenshot === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.timestamp === 'number'
  );
}

/**
 * Type guard for save-screenshot command data
 * Validates minimum required fields for handleSaveScreenshot
 */
export function isSaveScreenshotData(
  value: unknown
): value is { screenshot: string; url: string; timestamp: number; width: number; height: number } {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.screenshot === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.timestamp === 'number' &&
    typeof obj.width === 'number' &&
    typeof obj.height === 'number'
  );
}

/**
 * Type guard for design-review-screenshot command data
 * Validates minimum required fields for handleDesignReviewScreenshot
 */
export function isDesignReviewScreenshotData(
  value: unknown
): value is { screenshot: string; url: string; timestamp: number; width: number; height: number } {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.screenshot === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.timestamp === 'number' &&
    typeof obj.width === 'number' &&
    typeof obj.height === 'number'
  );
}

/**
 * Type guard for save-outline command data
 * Validates minimum required fields for handleSaveOutline
 */
export function isSaveOutlineData(value: unknown): value is {
  outline: unknown[];
  markdown: string;
  url: string;
  title: string;
  timestamp: number;
} {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    Array.isArray(obj.outline) &&
    typeof obj.markdown === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.timestamp === 'number'
  );
}

/**
 * Type guard for save-schema command data
 * Validates minimum required fields for handleSaveSchema
 */
export function isSaveSchemaData(
  value: unknown
): value is { schema: unknown; markdown: string; url: string; title: string; timestamp: number } {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.schema !== null &&
    typeof obj.schema === 'object' &&
    typeof obj.markdown === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.timestamp === 'number'
  );
}

/**
 * Type guard for save-settings command data
 * Validates minimum required fields for handleSaveSettings
 */
export function isSaveSettingsData(value: unknown): value is { settings: Record<string, unknown> } {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return obj.settings !== null && typeof obj.settings === 'object';
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Safely extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
