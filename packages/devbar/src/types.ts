/**
 * DevBar Type Definitions
 *
 * Shared types used by the DevBar components.
 */

// ============================================================================
// Console Log Types (duplicated from sweetlink for devbar independence)
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
// Sweetlink Command Types (subset needed by devbar)
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
// DevBar Configuration Types
// ============================================================================

/**
 * Options for configuring the GlobalDevBar
 */
export interface GlobalDevBarOptions {
  /** Position of the devbar. Default: 'bottom-left' */
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'bottom-center';
  /** Primary accent color (CSS color). Default: '#10b981' (emerald) */
  accentColor?: string;
  /** Which metrics to show. Default: all enabled */
  showMetrics?: {
    breakpoint?: boolean;
    fcp?: boolean;
    lcp?: boolean;
    pageSize?: boolean;
  };
  /** Whether to show the screenshot button. Default: true */
  showScreenshot?: boolean;
  /** Whether to show console error/warning badges. Default: true */
  showConsoleBadges?: boolean;
  /** Whether to show tooltips on hover. Default: true */
  showTooltips?: boolean;
  /** Size overrides for special layouts (e.g., when other dev bars are present) */
  sizeOverrides?: {
    /** Custom width (CSS value). Default: calc(100vw - 140px) for centered, fit-content otherwise */
    width?: string;
    /** Custom max-width (CSS value). Default: 600px for centered, calc(100vw - 32px) otherwise */
    maxWidth?: string;
    /** Custom min-width (CSS value). Optional */
    minWidth?: string;
  };
}

/**
 * Custom control that can be registered by host applications
 */
export interface DevBarControl {
  id: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'warning';
}
