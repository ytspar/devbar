/**
 * devbar Type Definitions
 *
 * Re-exports shared types from @ytspar/sweetlink and defines devbar-specific types.
 *
 * NOTE: We import from the types sub-path to avoid pulling in Node.js-only modules.
 */

// Re-export shared types from sweetlink's types module
export type {
  ConsoleLog,
  OutlineNode,
  PageSchema,
  SweetlinkCommand,
} from '@ytspar/sweetlink/types';

// ============================================================================
// devbar Configuration Types
// ============================================================================

/**
 * Theme mode for devbar display
 */
export type ThemeMode = 'dark' | 'light' | 'system';

/**
 * Debug configuration for devbar
 * When true, all debug options are enabled.
 * When an object, specific options can be toggled.
 */
export interface DebugConfig {
  /** Enable debug logging. Default: false */
  enabled: boolean;
  /** Log lifecycle events (init, destroy). Default: true when enabled */
  logLifecycle?: boolean;
  /** Log state changes (collapse, modals). Default: true when enabled */
  logStateChanges?: boolean;
  /** Log WebSocket events (connect, disconnect, messages). Default: true when enabled */
  logWebSocket?: boolean;
  /** Log performance measurements (FCP, LCP, CLS, INP). Default: true when enabled */
  logPerformance?: boolean;
}

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
    cls?: boolean;
    inp?: boolean;
    pageSize?: boolean;
  };
  /** Whether to show the screenshot button. Default: true */
  showScreenshot?: boolean;
  /** Whether to show console error/warning badges. Default: true */
  showConsoleBadges?: boolean;
  /** Whether to show tooltips on hover. Default: true */
  showTooltips?: boolean;
  /** Where to save files: 'auto' (detect), 'local' (via Sweetlink), or 'download' (browser). Default: 'auto' */
  saveLocation?: 'auto' | 'local' | 'download';
  /** Size overrides for special layouts (e.g., when other dev bars are present) */
  sizeOverrides?: {
    /** Custom width (CSS value). Default: calc(100vw - 140px) for centered, fit-content otherwise */
    width?: string;
    /** Custom max-width (CSS value). Default: 600px for centered, calc(100vw - 32px) otherwise */
    maxWidth?: string;
    /** Custom min-width (CSS value). Optional */
    minWidth?: string;
  };
  /** Enable debug logging. Pass true for all options, or an object for specific options. */
  debug?: boolean | DebugConfig;
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
