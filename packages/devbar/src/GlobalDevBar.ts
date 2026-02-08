/**
 * GlobalDevBar - Vanilla JS implementation
 *
 * A development toolbar that displays breakpoint info, performance stats,
 * console error/warning counts, and provides screenshot capabilities via Sweetlink.
 *
 * Framework-agnostic — no React, Vue, or other framework dependencies.
 *
 * Implementation is split across focused modules in ./modules/:
 * - websocket.ts   — WebSocket connection, reconnection, port scanning, message handling
 * - screenshot.ts  — Screenshot capture, design review, clipboard operations
 * - rendering.ts   — renderBar(), renderConsolePopup(), renderModal(), all DOM creation
 * - performance.ts — setupPerformanceMonitoring(), FCP/LCP/CLS/INP observers
 * - theme.ts       — setupTheme(), toggleTheme(), theme media query handling
 * - keyboard.ts    — setupKeyboardShortcuts(), handleKeydown()
 * - tooltips.ts    — tooltip creation, positioning, and management helpers
 */

import {
  CSS_COLORS,
  getThemeColors,
  MAX_RECONNECT_ATTEMPTS,
  TOOLTIP_STYLES,
  WS_PORT,
  WS_PORT_OFFSET,
} from './constants.js';
import { DebugLogger, normalizeDebugConfig } from './debug.js';
import {
  ACCENT_COLOR_PRESETS,
  DEFAULT_SETTINGS,
  type DevBarSettings,
  getSettingsManager,
  type SettingsManager,
} from './settings.js';
import type {
  ConsoleLog,
  DebugConfig,
  DevBarControl,
  GlobalDevBarOptions,
  OutlineNode,
  PageSchema,
  SweetlinkCommand,
  ThemeMode,
} from './types.js';
import { ConsoleCapture, type LogChangeListener } from '@ytspar/sweetlink/browser/consoleCapture';

// Import module functions
import { connectWebSocket, handleNotification } from './modules/websocket.js';
import { handleScreenshot as moduleHandleScreenshot } from './modules/screenshot.js';
import { render as moduleRender } from './modules/rendering.js';
import {
  setupBreakpointDetection,
  setupPerformanceMonitoring,
} from './modules/performance.js';
import { setupKeyboardShortcuts } from './modules/keyboard.js';
import {
  setupTheme,
  loadCompactMode,
  setThemeMode as moduleSetThemeMode,
} from './modules/theme.js';
import type { DevBarState } from './modules/types.js';

// Re-export types for backwards compatibility
export type {
  ConsoleLog,
  DebugConfig,
  SweetlinkCommand,
  OutlineNode,
  PageSchema,
  GlobalDevBarOptions,
  DevBarControl,
  ThemeMode,
};

// Re-export settings types
export type { DevBarPosition, DevBarSettings, MetricsVisibility } from './settings.js';
export { ACCENT_COLOR_PRESETS, DEFAULT_SETTINGS, getSettingsManager } from './settings.js';

// html2canvas is lazy-loaded via getHtml2Canvas() to avoid bundling ~400KB upfront

// ============================================================================
// Console Capture (single implementation from @ytspar/sweetlink)
// ============================================================================

const consoleCapture = new ConsoleCapture({ trackCounts: true });
consoleCapture.importEarlyLogs();
consoleCapture.start();

// ============================================================================
// GlobalDevBar Class
// ============================================================================

export class GlobalDevBar {
  // Static storage for custom controls
  private static customControls: DevBarControl[] = [];

  // -- Public state exposed via DevBarState interface for modules --
  options: Required<Omit<GlobalDevBarOptions, 'sizeOverrides' | 'debug'>> &
    Pick<GlobalDevBarOptions, 'sizeOverrides'>;
  private debugConfig!: DebugConfig;
  debug!: DebugLogger;
  container: HTMLDivElement | null = null;
  ws: WebSocket | null = null;
  consoleLogs: ConsoleLog[] = [];
  sweetlinkConnected = false;
  collapsed = false;
  capturing = false;
  copiedToClipboard = false;
  copiedPath = false;
  lastScreenshot: string | null = null;
  designReviewInProgress = false;
  lastDesignReview: string | null = null;
  designReviewError: string | null = null;
  showDesignReviewConfirm = false;
  apiKeyStatus: {
    configured: boolean;
    model?: string;
    pricing?: { input: number; output: number };
  } | null = null;
  lastOutline: string | null = null;
  lastSchema: string | null = null;
  savingOutline = false;
  savingSchema = false;
  consoleFilter: 'error' | 'warn' | 'info' | null = null;

  // Modal states
  showOutlineModal = false;
  showSchemaModal = false;

  // Track active HTML tooltips for cleanup on re-render
  activeTooltips = new Set<HTMLDivElement>();

  breakpointInfo: { tailwindBreakpoint: string; dimensions: string } | null = null;
  perfStats: {
    fcp: string;
    lcp: string;
    cls: string;
    inp: string;
    totalSize: string;
  } | null = null;
  lcpValue: number | null = null;
  clsValue = 0;
  inpValue = 0;

  reconnectAttempts = 0;

  // Port scanning state for multi-instance support
  readonly currentAppPort: number;
  readonly baseWsPort: number;
  wsVerified = false;
  serverProjectDir: string | null = null;

  // Track the position of the connection indicator dot for smooth collapse
  lastDotPosition: { left: number; top: number; bottom: number } | null = null;

  reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  screenshotTimeout: ReturnType<typeof setTimeout> | null = null;
  copiedPathTimeout: ReturnType<typeof setTimeout> | null = null;
  designReviewTimeout: ReturnType<typeof setTimeout> | null = null;
  designReviewErrorTimeout: ReturnType<typeof setTimeout> | null = null;
  outlineTimeout: ReturnType<typeof setTimeout> | null = null;
  schemaTimeout: ReturnType<typeof setTimeout> | null = null;

  resizeHandler: (() => void) | null = null;
  keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  fcpObserver: PerformanceObserver | null = null;
  lcpObserver: PerformanceObserver | null = null;
  clsObserver: PerformanceObserver | null = null;
  inpObserver: PerformanceObserver | null = null;
  destroyed = false;

  // Theme state
  themeMode: ThemeMode = 'system';
  themeMediaQuery: MediaQueryList | null = null;
  themeMediaHandler: ((e: MediaQueryListEvent) => void) | null = null;

  // Compact mode state
  compactMode = false;

  // Settings popover state
  showSettingsPopover = false;

  // Overlay element for modals
  overlayElement: HTMLDivElement | null = null;

  // Settings manager for persistence
  settingsManager: SettingsManager;

  // Console log listener for real-time badge updates
  private logChangeListener: LogChangeListener | null = null;

  constructor(options: GlobalDevBarOptions = {}) {
    // Initialize debug config first so we can log during construction
    this.debugConfig = normalizeDebugConfig(options.debug);
    this.debug = new DebugLogger(this.debugConfig);

    // Initialize settings manager
    this.settingsManager = getSettingsManager();

    // Calculate app port from URL for multi-instance support
    if (typeof window !== 'undefined') {
      this.currentAppPort =
        parseInt(window.location.port, 10) || (window.location.protocol === 'https:' ? 443 : 80);
      // Calculate expected WS port (appPort + port offset) like SweetlinkBridge does
      this.baseWsPort = this.currentAppPort > 0 ? this.currentAppPort + WS_PORT_OFFSET : WS_PORT;
    } else {
      this.currentAppPort = 0;
      this.baseWsPort = WS_PORT;
    }

    this.options = {
      position: options.position ?? 'bottom-left',
      accentColor: options.accentColor ?? CSS_COLORS.primary,
      showMetrics: {
        breakpoint: options.showMetrics?.breakpoint ?? true,
        fcp: options.showMetrics?.fcp ?? true,
        lcp: options.showMetrics?.lcp ?? true,
        cls: options.showMetrics?.cls ?? true,
        inp: options.showMetrics?.inp ?? true,
        pageSize: options.showMetrics?.pageSize ?? true,
      },
      showScreenshot: options.showScreenshot ?? true,
      showConsoleBadges: options.showConsoleBadges ?? true,
      showTooltips: options.showTooltips ?? true,
      sizeOverrides: options.sizeOverrides,
    };

    this.debug.lifecycle('GlobalDevBar constructed', { options: this.options });
  }

  /**
   * Get tooltip class name(s) if tooltips are enabled, otherwise empty string
   */
  tooltipClass(
    direction: 'left' | 'right' = 'left',
    ...additionalClasses: string[]
  ): string {
    if (!this.options.showTooltips) {
      return additionalClasses.join(' ');
    }
    return ['devbar-tooltip', `devbar-tooltip-${direction}`, ...additionalClasses].join(' ');
  }

  /**
   * Get current error, warning, and info counts from the log array
   */
  getLogCounts(): { errorCount: number; warningCount: number; infoCount: number } {
    return {
      errorCount: consoleCapture.getErrorCount(),
      warningCount: consoleCapture.getWarningCount(),
      infoCount: consoleCapture.getInfoCount(),
    };
  }

  /**
   * Reset position style properties on an element to clear stale values
   */
  resetPositionStyles(element: HTMLElement): void {
    Object.assign(element.style, { top: '', bottom: '', left: '', right: '', transform: '' });
  }

  /**
   * Create a collapsed count badge (used for error/warning counts in minimized state)
   */
  createCollapsedBadge(count: number, bgColor: string, rightPos: string): HTMLSpanElement {
    const badge = document.createElement('span');
    Object.assign(badge.style, {
      position: 'absolute',
      top: '-6px',
      right: rightPos,
      minWidth: '16px',
      height: '16px',
      padding: '0 4px',
      borderRadius: '9999px',
      backgroundColor: bgColor,
      color: '#fff',
      fontSize: '0.5625rem',
      fontWeight: '600',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });
    badge.textContent = count > 99 ? '!' : String(count);
    return badge;
  }

  // ============================================================================
  // Static Methods for Custom Controls
  // ============================================================================

  /**
   * Register a custom control to be displayed in the devbar
   */
  static registerControl(control: DevBarControl): void {
    // Remove existing control with same ID
    GlobalDevBar.customControls = GlobalDevBar.customControls.filter((c) => c.id !== control.id);
    GlobalDevBar.customControls.push(control);
    // Trigger re-render of all instances
    const instance = getGlobalInstance();
    if (instance) {
      instance.render();
    }
  }

  /**
   * Unregister a custom control by ID
   */
  static unregisterControl(id: string): void {
    GlobalDevBar.customControls = GlobalDevBar.customControls.filter((c) => c.id !== id);
    // Trigger re-render of all instances
    const instance = getGlobalInstance();
    if (instance) {
      instance.render();
    }
  }

  /**
   * Get all registered custom controls
   */
  static getControls(): DevBarControl[] {
    return [...GlobalDevBar.customControls];
  }

  /**
   * Clear all custom controls
   */
  static clearControls(): void {
    GlobalDevBar.customControls = [];
    const instance = getGlobalInstance();
    if (instance) {
      instance.render();
    }
  }

  /**
   * Initialize and mount the devbar
   */
  init(): void {
    if (typeof window === 'undefined') return;
    if (this.destroyed) return;

    this.debug.lifecycle('Initializing DevBar');

    // Inject tooltip styles
    this.injectStyles();

    // Copy captured logs
    this.consoleLogs = consoleCapture.getLogs();
    this.debug.lifecycle('Copied console logs', { count: this.consoleLogs.length });

    // Subscribe to log changes for real-time badge updates
    this.logChangeListener = () => {
      this.consoleLogs = consoleCapture.getLogs();
      this.render();
    };
    consoleCapture.addListener(this.logChangeListener);

    // Setup theme
    setupTheme(this as DevBarState);

    // Load compact mode from storage
    loadCompactMode(this as DevBarState);

    // Setup WebSocket connection
    this.connectWebSocket();

    // Setup breakpoint detection
    setupBreakpointDetection(this as DevBarState);

    // Setup performance monitoring
    setupPerformanceMonitoring(this as DevBarState);

    // Setup keyboard shortcuts
    setupKeyboardShortcuts(this as DevBarState);

    // Initial render
    this.render();

    this.debug.lifecycle('DevBar initialized successfully');
  }

  /**
   * Get the current position
   */
  getPosition(): string {
    return this.options.position;
  }

  /**
   * Destroy the devbar and cleanup
   */
  destroy(): void {
    this.debug.lifecycle('Destroying DevBar');
    this.destroyed = true;

    // Close WebSocket
    this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // Prevent reconnection
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.ws) this.ws.close();

    // Clear timeouts
    if (this.screenshotTimeout) clearTimeout(this.screenshotTimeout);
    if (this.copiedPathTimeout) clearTimeout(this.copiedPathTimeout);
    if (this.designReviewTimeout) clearTimeout(this.designReviewTimeout);
    if (this.outlineTimeout) clearTimeout(this.outlineTimeout);
    if (this.schemaTimeout) clearTimeout(this.schemaTimeout);

    // Remove event listeners
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    if (this.keydownHandler) window.removeEventListener('keydown', this.keydownHandler);

    // Disconnect observers
    if (this.fcpObserver) this.fcpObserver.disconnect();
    if (this.lcpObserver) this.lcpObserver.disconnect();
    if (this.clsObserver) this.clsObserver.disconnect();
    if (this.inpObserver) this.inpObserver.disconnect();

    // Remove theme media listener
    if (this.themeMediaQuery && this.themeMediaHandler) {
      this.themeMediaQuery.removeEventListener('change', this.themeMediaHandler);
    }

    // Remove log change listener
    if (this.logChangeListener) {
      consoleCapture.removeListener(this.logChangeListener);
      this.logChangeListener = null;
    }

    // Restore console
    consoleCapture.stop();

    // Remove DOM elements
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    if (this.overlayElement) {
      this.overlayElement.remove();
      this.overlayElement = null;
    }

    this.debug.lifecycle('DevBar destroyed');
  }

  private injectStyles(): void {
    const styleId = 'devbar-tooltip-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = TOOLTIP_STYLES;
      document.head.appendChild(style);
    }
  }

  // Delegate to module functions, binding `this` as state

  connectWebSocket(port?: number): void {
    connectWebSocket(this as DevBarState, port);
  }

  handleNotification(
    type: 'screenshot' | 'designReview' | 'outline' | 'schema',
    path: string | undefined,
    durationMs: number
  ): void {
    handleNotification(this as DevBarState, type, path, durationMs);
  }

  /**
   * Apply settings to the DevBar state and options
   */
  applySettings(settings: DevBarSettings): void {
    // Update local state
    this.themeMode = settings.themeMode;
    this.compactMode = settings.compactMode;

    // Update options
    this.options.position = settings.position;
    this.options.accentColor = settings.accentColor;
    this.options.showScreenshot = settings.showScreenshot;
    this.options.showConsoleBadges = settings.showConsoleBadges;
    this.options.showTooltips = settings.showTooltips;
    this.options.showMetrics = { ...settings.showMetrics };

    // Re-render with new settings
    this.render();
  }

  private clearConsoleLogs(): void {
    consoleCapture.clear();
    this.consoleLogs = [];
    this.consoleFilter = null;
    this.render();
  }

  handleScreenshot(copyToClipboard: boolean): Promise<void> {
    return moduleHandleScreenshot(this as DevBarState, copyToClipboard);
  }

  /**
   * Get the current theme mode
   */
  getThemeMode(): ThemeMode {
    return this.themeMode;
  }

  /**
   * Set the theme mode
   */
  setThemeMode(mode: ThemeMode): void {
    moduleSetThemeMode(this as DevBarState, mode);
  }

  /**
   * Get the current effective theme colors
   */
  getColors(): ReturnType<typeof getThemeColors> {
    return getThemeColors(this.themeMode);
  }

  /**
   * Toggle compact mode
   */
  toggleCompactMode(): void {
    this.compactMode = !this.compactMode;
    this.settingsManager.saveSettings({ compactMode: this.compactMode });
    this.debug.state('Compact mode toggled', { compactMode: this.compactMode });
    this.render();
  }

  /**
   * Check if compact mode is enabled
   */
  isCompactMode(): boolean {
    return this.compactMode;
  }

  // ============================================================================
  // Render (delegates to rendering module)
  // ============================================================================

  render(): void {
    moduleRender(this as DevBarState, consoleCapture, GlobalDevBar.customControls);
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

// Use window-based global to survive HMR (Hot Module Replacement)
const DEVBAR_GLOBAL_KEY = '__YTSPAR_DEVBAR_INSTANCE__';

function getGlobalInstance(): GlobalDevBar | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as Record<string, GlobalDevBar | null>)[DEVBAR_GLOBAL_KEY] ?? null;
}

function setGlobalInstance(instance: GlobalDevBar | null): void {
  if (typeof window === 'undefined') return;
  (window as unknown as Record<string, GlobalDevBar | null>)[DEVBAR_GLOBAL_KEY] = instance;
}

/**
 * Initialize and mount the GlobalDevBar
 *
 * HMR-safe: Uses window-based global that survives module reloads.
 * If an instance already exists, it will be destroyed and recreated.
 */
export function initGlobalDevBar(options?: GlobalDevBarOptions): GlobalDevBar {
  const existing = getGlobalInstance();
  if (existing) {
    // Check if already initialized with same position - skip re-init during HMR
    const existingPosition = existing.getPosition();
    const newPosition = options?.position ?? 'bottom-left';
    if (existingPosition === newPosition) {
      return existing;
    }
    // Position changed, destroy and recreate
    existing.destroy();
    setGlobalInstance(null);
  }
  const instance = new GlobalDevBar(options);
  instance.init();
  setGlobalInstance(instance);
  return instance;
}

/**
 * Get the current GlobalDevBar instance
 */
export function getGlobalDevBar(): GlobalDevBar | null {
  return getGlobalInstance();
}

/**
 * Destroy the GlobalDevBar
 */
export function destroyGlobalDevBar(): void {
  const instance = getGlobalInstance();
  if (instance) {
    instance.destroy();
    setGlobalInstance(null);
  }
}

// Re-export console capture instance for backward compatibility
export { consoleCapture as earlyConsoleCapture };
