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

import { ConsoleCapture, type LogChangeListener } from '@ytspar/sweetlink/browser/consoleCapture';
import {
  createSameOriginSweetlinkWsUrl,
  getSweetlinkRuntimeConfig,
  parsePortNumber,
  resolveAppPortFromRuntimeConfig,
  resolveSweetlinkWsPortForAppPort,
} from '@ytspar/sweetlink/types';
import {
  CSS_COLORS,
  DEVBAR_STYLES,
  getThemeColors,
  MAX_RECONNECT_ATTEMPTS,
  PALETTE,
  WS_PORT,
} from './constants.js';
import { DebugLogger, normalizeDebugConfig } from './debug.js';
import { setupKeyboardShortcuts } from './modules/keyboard.js';
import { setupBreakpointDetection, setupPerformanceMonitoring } from './modules/performance.js';
import { render as moduleRender } from './modules/rendering/index.js';
import { handleScreenshot as moduleHandleScreenshot } from './modules/screenshot.js';
import {
  loadCompactMode,
  setThemeMode as moduleSetThemeMode,
  setupTheme,
} from './modules/theme.js';
import type { DevBarState } from './modules/types.js';
// Import module functions
import { connectWebSocket, handleNotification } from './modules/websocket.js';
import { type DevBarSettings, getSettingsManager, type SettingsManager } from './settings.js';
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

// Re-export settings types
export type { DevBarPosition, DevBarSettings, MetricsVisibility } from './settings.js';
export { ACCENT_COLOR_PRESETS, DEFAULT_SETTINGS, getSettingsManager } from './settings.js';
// Re-export types for backwards compatibility
export type {
  ConsoleLog,
  DebugConfig,
  DevBarControl,
  GlobalDevBarOptions,
  OutlineNode,
  PageSchema,
  SweetlinkCommand,
  ThemeMode,
};

// html2canvas is lazy-loaded via getHtml2Canvas() to avoid bundling ~400KB upfront

function buildSweetlinkWsUrlCandidates(
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

  const directPort = parsePortNumber(options.wsPort) ?? options.fallbackPort;
  add(`ws://localhost:${directPort}`);

  return urls;
}

// ============================================================================
// Console Capture (single implementation from @ytspar/sweetlink)
// ============================================================================

const consoleCapture = new ConsoleCapture({ trackCounts: true });
consoleCapture.importEarlyLogs();
consoleCapture.start();
consoleCapture.startErrorHandlers();

// ============================================================================
// GlobalDevBar Class
// ============================================================================

export class GlobalDevBar {
  // Window-backed storage for custom controls.
  // Using window global instead of a static class property so that custom
  // controls survive module duplication by bundlers (e.g. Next.js creating
  // separate copies for different dynamic import() call sites).
  private static readonly CONTROLS_KEY = '__YTSPAR_DEVBAR_CONTROLS__';

  private static get customControls(): DevBarControl[] {
    if (typeof window === 'undefined') return [];
    return (
      ((window as unknown as Record<string, unknown>)[
        GlobalDevBar.CONTROLS_KEY
      ] as DevBarControl[]) ?? []
    );
  }

  private static set customControls(value: DevBarControl[]) {
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>)[GlobalDevBar.CONTROLS_KEY] = value;
    }
  }

  // -- State shared with the rendering modules --
  //
  // The properties below are public *only* so the helper modules in
  // ./modules/ can mutate them without going through getters/setters.
  // They are otherwise considered internal to the DevBar implementation
  // — external consumers should NOT read or write them. The genuinely
  // public surface is registerControl / unregisterControl / destroy /
  // getLogCounts and the static `init`/`getInstance` factory.
  // @internal
  options: Required<
    Omit<
      GlobalDevBarOptions,
      'defaultThemeMode' | 'sizeOverrides' | 'debug' | 'sweetlink' | 'themeMode'
    >
  > &
    Pick<GlobalDevBarOptions, 'sizeOverrides'>;
  readonly forcedThemeMode: ThemeMode | undefined;
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
  // Subset of ConsoleLogLevel — only the levels surfaced as filter chips.
  // Keeping it as an Extract<> alias makes the link explicit so adding
  // another level upstream automatically lights up here.
  consoleFilter: import('@ytspar/sweetlink/types').ConsoleLogLevel extends infer L
    ? Extract<L, 'error' | 'warn' | 'info'> | null
    : never = null;
  savingConsoleLogs = false;
  lastConsoleLogs: string | null = null;
  consoleLogsTimeout: ReturnType<typeof setTimeout> | undefined;

  // Modal states
  showOutlineModal = false;
  showSchemaModal = false;
  showA11yModal = false;
  a11yLoading = false;
  lastA11yAudit: string | null = null;
  savingA11yAudit = false;
  a11yTimeout: ReturnType<typeof setTimeout> | null = null;

  // Recording
  recordingActive = false;
  recordingSessionId: string | null = null;
  recordingStartedAt: number | null = null;
  recordingTimer: ReturnType<typeof setInterval> | null = null;
  lastViewerPath: string | null = null;
  pendingViewerWindow: Window | null = null;

  // Demo
  demoActive = false;
  demoTitle: string | null = null;
  demoSectionCount = 0;

  // Ruler
  rulerMode = false;
  rulerOverlay: HTMLDivElement | null = null;
  rulerPinnedElements: HTMLDivElement[] = [];
  rulerCleanup: (() => void) | null = null;

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
  readonly wsUrlCandidates: readonly string[];
  wsVerified = false;
  serverProjectDir: string | null = null;
  serverGitBranch: string | null = null;
  serverAppName: string | null = null;

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
    this.forcedThemeMode = options.themeMode;

    // Initialize settings manager
    this.settingsManager = getSettingsManager(
      options.defaultThemeMode ? { themeMode: options.defaultThemeMode } : {}
    );

    if (this.forcedThemeMode) {
      this.settingsManager.saveSettingsNow({
        themeMode: this.forcedThemeMode,
      });
    }

    // Calculate app and WS ports from the browser URL for multi-instance support
    if (typeof window !== 'undefined') {
      const runtimeConfig = getSweetlinkRuntimeConfig(window);
      const sweetlinkOptions = options.sweetlink;
      const configuredAppPort =
        sweetlinkOptions?.appPort ??
        resolveAppPortFromRuntimeConfig(window.location, runtimeConfig);
      this.currentAppPort = configuredAppPort;
      this.baseWsPort =
        sweetlinkOptions?.wsPort ??
        parsePortNumber(runtimeConfig.wsPort) ??
        resolveSweetlinkWsPortForAppPort(configuredAppPort);

      this.wsUrlCandidates = buildSweetlinkWsUrlCandidates(window.location, {
        wsUrl: sweetlinkOptions?.wsUrl ?? runtimeConfig.wsUrl,
        wsPort: sweetlinkOptions?.wsPort ?? runtimeConfig.wsPort,
        wsPath: sweetlinkOptions?.wsPath ?? runtimeConfig.wsPath,
        fallbackPort: this.baseWsPort,
      });
    } else {
      this.currentAppPort = 0;
      this.baseWsPort = WS_PORT;
      this.wsUrlCandidates = [`ws://localhost:${WS_PORT}`];
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
      saveLocation: options.saveLocation ?? 'auto',
      screenshotQuality: options.screenshotQuality ?? 0.65,
      sizeOverrides: options.sizeOverrides,
    };

    this.debug.lifecycle('GlobalDevBar constructed', { options: this.options });
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
      color: PALETTE.white,
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

    // Inject animation and utility CSS
    this.injectStyles();

    // Copy captured logs
    this.consoleLogs = consoleCapture.getLogs();
    this.debug.lifecycle('Copied console logs', { count: this.consoleLogs.length });

    // Subscribe to log changes for real-time badge updates.
    // Skip re-render while a modal overlay is open — content within
    // the modal (e.g. image loads) can generate console messages that
    // would tear down and recreate the modal in an infinite loop.
    this.logChangeListener = () => {
      this.consoleLogs = consoleCapture.getLogs();
      if (!this.overlayElement) {
        this.render();
      }
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
    if (this.consoleLogsTimeout) clearTimeout(this.consoleLogsTimeout);
    if (this.a11yTimeout) clearTimeout(this.a11yTimeout);

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
      document.body.style.overflow = '';
    }

    this.debug.lifecycle('DevBar destroyed');
  }

  private injectStyles(): void {
    const styleId = 'devbar-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = DEVBAR_STYLES;
      document.head.appendChild(style);
    }
  }

  // Delegate to module functions, binding `this` as state

  connectWebSocket(port?: number | string): void {
    connectWebSocket(this as DevBarState, port);
  }

  handleNotification(
    type: 'screenshot' | 'designReview' | 'outline' | 'schema' | 'consoleLogs' | 'a11y',
    path: string | undefined,
    durationMs: number
  ): void {
    handleNotification(this as DevBarState, type, path, durationMs);
  }

  /**
   * Apply settings to the DevBar state and options
   */
  applySettings(settings: DevBarSettings): void {
    const effectiveSettings = this.forcedThemeMode
      ? { ...settings, themeMode: this.forcedThemeMode }
      : settings;

    if (this.forcedThemeMode && this.settingsManager.get('themeMode') !== this.forcedThemeMode) {
      this.settingsManager.saveSettingsNow({
        themeMode: this.forcedThemeMode,
      });
    }

    // Update local state
    this.themeMode = effectiveSettings.themeMode;
    this.compactMode = effectiveSettings.compactMode;

    // Update options
    this.options.position = effectiveSettings.position;
    this.options.accentColor = effectiveSettings.accentColor;
    this.options.showScreenshot = effectiveSettings.showScreenshot;
    this.options.showConsoleBadges = effectiveSettings.showConsoleBadges;
    this.options.showTooltips = effectiveSettings.showTooltips;
    this.options.saveLocation = effectiveSettings.saveLocation;
    this.options.screenshotQuality = effectiveSettings.screenshotQuality ?? 0.65;
    this.options.showMetrics = { ...effectiveSettings.showMetrics };

    // Re-render with new settings
    this.render();
  }

  clearConsoleLogs(): void {
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
