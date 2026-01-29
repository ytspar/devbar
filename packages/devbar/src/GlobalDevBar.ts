/**
 * GlobalDevBar - Vanilla JS implementation
 *
 * A development toolbar that displays breakpoint info, performance stats,
 * console error/warning counts, and provides screenshot capabilities via Sweetlink.
 *
 * This is a vanilla JS replacement for the React-based GlobalDevBar component
 * to avoid React dependency conflicts in host applications.
 */

import * as html2canvasModule from 'html2canvas-pro';
import {
  BASE_RECONNECT_DELAY_MS,
  BUTTON_COLORS,
  CATEGORY_COLORS,
  CLIPBOARD_NOTIFICATION_MS,
  COLORS,
  DESIGN_REVIEW_NOTIFICATION_MS,
  DEVBAR_SCREENSHOT_QUALITY,
  FONT_MONO,
  getEffectiveTheme,
  getTheme,
  getThemeColors,
  injectThemeCSS,
  MAX_CONSOLE_LOGS,
  MAX_PORT_RETRIES,
  MAX_RECONNECT_ATTEMPTS,
  MAX_RECONNECT_DELAY_MS,
  PORT_RETRY_DELAY_MS,
  PORT_SCAN_RESTART_DELAY_MS,
  SCREENSHOT_BLUR_DELAY_MS,
  SCREENSHOT_NOTIFICATION_MS,
  SCREENSHOT_SCALE,
  TAILWIND_BREAKPOINTS,
  TOOLTIP_STYLES,
  WS_PORT,
  WS_PORT_OFFSET,
} from './constants.js';
import { DebugLogger, normalizeDebugConfig } from './debug.js';
import { extractDocumentOutline, outlineToMarkdown } from './outline.js';
import { extractPageSchema, schemaToMarkdown } from './schema.js';
import {
  ACCENT_COLOR_PRESETS,
  DEFAULT_SETTINGS,
  type DevBarSettings,
  getSettingsManager,
  type SettingsManager,
} from './settings.js';
// Import from split modules
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
import {
  createEmptyMessage,
  createInfoBox,
  createModalBox,
  createModalContent,
  createModalHeader,
  createModalOverlay,
  createStyledButton,
  createSvgIcon,
  getButtonStyles,
} from './ui/index.js';
import {
  canvasToDataUrl,
  copyCanvasToClipboard,
  delay,
  formatArgs,
  prepareForCapture,
} from './utils.js';

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

// Handle ESM/CJS interop for html2canvas-pro
type Html2CanvasFunc = (
  element: HTMLElement,
  options?: {
    logging?: boolean;
    useCORS?: boolean;
    allowTaint?: boolean;
    scale?: number;
    width?: number;
    windowWidth?: number;
  }
) => Promise<HTMLCanvasElement>;
const html2canvas = ((html2canvasModule as unknown as { default: Html2CanvasFunc }).default ??
  html2canvasModule) as Html2CanvasFunc;

// ============================================================================
// Early Console Capture (runs immediately on module load)
// ============================================================================

interface EarlyConsoleCapture {
  errorCount: number;
  warningCount: number;
  logs: ConsoleLog[];
  originalConsole: {
    log: typeof console.log;
    error: typeof console.error;
    warn: typeof console.warn;
    info: typeof console.info;
  } | null;
  isPatched: boolean;
}

const earlyConsoleCapture: EarlyConsoleCapture = (() => {
  const ssrFallback: EarlyConsoleCapture = {
    errorCount: 0,
    warningCount: 0,
    logs: [],
    originalConsole: null,
    isPatched: false,
  };

  // Skip on server-side rendering
  if (typeof window === 'undefined') return ssrFallback;

  const capture: EarlyConsoleCapture = {
    errorCount: 0,
    warningCount: 0,
    logs: [],
    originalConsole: {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
    },
    isPatched: false,
  };

  const captureLog = (level: string, args: unknown[]) => {
    capture.logs.push({ level, message: formatArgs(args), timestamp: Date.now() });
    if (capture.logs.length > MAX_CONSOLE_LOGS)
      capture.logs = capture.logs.slice(-MAX_CONSOLE_LOGS);
  };

  // Patch console immediately
  if (!capture.isPatched && capture.originalConsole) {
    console.log = (...args) => {
      captureLog('log', args);
      capture.originalConsole!.log(...args);
    };
    console.error = (...args) => {
      captureLog('error', args);
      capture.errorCount++;
      capture.originalConsole!.error(...args);
    };
    console.warn = (...args) => {
      captureLog('warn', args);
      capture.warningCount++;
      capture.originalConsole!.warn(...args);
    };
    console.info = (...args) => {
      captureLog('info', args);
      capture.originalConsole!.info(...args);
    };
    capture.isPatched = true;
  }

  return capture;
})();

// ============================================================================
// GlobalDevBar Class
// ============================================================================

export class GlobalDevBar {
  // Static storage for custom controls
  private static customControls: DevBarControl[] = [];

  private options: Required<Omit<GlobalDevBarOptions, 'sizeOverrides' | 'debug'>> &
    Pick<GlobalDevBarOptions, 'sizeOverrides'>;
  private debugConfig!: DebugConfig;
  private debug!: DebugLogger;
  private container: HTMLDivElement | null = null;
  private ws: WebSocket | null = null;
  private consoleLogs: ConsoleLog[] = [];
  private sweetlinkConnected = false;
  private collapsed = false;
  private capturing = false;
  private copiedToClipboard = false;
  private copiedPath = false;
  private lastScreenshot: string | null = null;
  private designReviewInProgress = false;
  private lastDesignReview: string | null = null;
  private designReviewError: string | null = null;
  private showDesignReviewConfirm = false;
  private apiKeyStatus: {
    configured: boolean;
    maskedKey?: string;
    model?: string;
    pricing?: { input: number; output: number };
  } | null = null;
  private lastOutline: string | null = null;
  private lastSchema: string | null = null;
  private savingOutline = false;
  private savingSchema = false;
  private consoleFilter: 'error' | 'warn' | null = null;

  // Modal states
  private showOutlineModal = false;
  private showSchemaModal = false;

  private breakpointInfo: { tailwindBreakpoint: string; dimensions: string } | null = null;
  private perfStats: {
    fcp: string;
    lcp: string;
    cls: string;
    inp: string;
    totalSize: string;
  } | null = null;
  private lcpValue: number | null = null;
  private clsValue = 0;
  private inpValue = 0;

  private reconnectAttempts = 0;

  // Port scanning state for multi-instance support
  private readonly currentAppPort: number;
  private readonly baseWsPort: number;
  private wsVerified = false;
  private serverProjectDir: string | null = null;

  // Track the position of the connection indicator dot for smooth collapse
  private lastDotPosition: { left: number; top: number; bottom: number } | null = null;

  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private screenshotTimeout: ReturnType<typeof setTimeout> | null = null;
  private copiedPathTimeout: ReturnType<typeof setTimeout> | null = null;
  private designReviewTimeout: ReturnType<typeof setTimeout> | null = null;
  private designReviewErrorTimeout: ReturnType<typeof setTimeout> | null = null;
  private outlineTimeout: ReturnType<typeof setTimeout> | null = null;
  private schemaTimeout: ReturnType<typeof setTimeout> | null = null;

  private resizeHandler: (() => void) | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private fcpObserver: PerformanceObserver | null = null;
  private lcpObserver: PerformanceObserver | null = null;
  private clsObserver: PerformanceObserver | null = null;
  private inpObserver: PerformanceObserver | null = null;
  private destroyed = false;

  // Theme state
  private themeMode: ThemeMode = 'system';
  private themeMediaQuery: MediaQueryList | null = null;
  private themeMediaHandler: ((e: MediaQueryListEvent) => void) | null = null;

  // Compact mode state
  private compactMode = false;

  // Settings popover state
  private showSettingsPopover = false;

  // Overlay element for modals
  private overlayElement: HTMLDivElement | null = null;

  // Settings manager for persistence
  private settingsManager: SettingsManager;

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
      accentColor: options.accentColor ?? COLORS.primary,
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
  private tooltipClass(
    direction: 'left' | 'right' = 'left',
    ...additionalClasses: string[]
  ): string {
    if (!this.options.showTooltips) {
      return additionalClasses.join(' ');
    }
    return ['devbar-tooltip', `devbar-tooltip-${direction}`, ...additionalClasses].join(' ');
  }

  /**
   * Get current error and warning counts from the log array
   */
  private getLogCounts(): { errorCount: number; warningCount: number } {
    const logs = earlyConsoleCapture.logs;
    let errorCount = 0;
    let warningCount = 0;
    for (const log of logs) {
      if (log.level === 'error') errorCount++;
      else if (log.level === 'warn') warningCount++;
    }
    return { errorCount, warningCount };
  }

  /**
   * Create a collapsed count badge (used for error/warning counts in minimized state)
   */
  private createCollapsedBadge(count: number, bgColor: string, rightPos: string): HTMLSpanElement {
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

    // Copy early captured logs
    this.consoleLogs = [...earlyConsoleCapture.logs];
    this.debug.lifecycle('Copied early console logs', { count: this.consoleLogs.length });

    // Setup theme
    this.setupTheme();

    // Load compact mode from storage
    this.loadCompactMode();

    // Setup WebSocket connection
    this.connectWebSocket();

    // Setup breakpoint detection
    this.setupBreakpointDetection();

    // Setup performance monitoring
    this.setupPerformanceMonitoring();

    // Setup keyboard shortcuts
    this.setupKeyboardShortcuts();

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

    // Restore console
    if (earlyConsoleCapture.originalConsole) {
      console.log = earlyConsoleCapture.originalConsole.log;
      console.error = earlyConsoleCapture.originalConsole.error;
      console.warn = earlyConsoleCapture.originalConsole.warn;
      console.info = earlyConsoleCapture.originalConsole.info;
    }

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

  private connectWebSocket(port?: number): void {
    if (this.destroyed) return;

    const targetPort = port ?? this.baseWsPort;
    this.debug.ws('Connecting to WebSocket', { port: targetPort, appPort: this.currentAppPort });
    const ws = new WebSocket(`ws://localhost:${targetPort}`);
    this.ws = ws;
    this.wsVerified = false;

    ws.onopen = () => {
      this.debug.ws('WebSocket socket opened, awaiting server-info');
      ws.send(JSON.stringify({ type: 'browser-client-ready' }));
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);

        // Handle server-info for port matching
        if (message.type === 'server-info') {
          const serverAppPort = message.appPort as number | null;
          const serverMatchesApp = serverAppPort === null || serverAppPort === this.currentAppPort;

          if (!serverMatchesApp) {
            this.debug.ws('Server mismatch', {
              serverAppPort,
              currentAppPort: this.currentAppPort,
              tryingNextPort: targetPort + 1,
            });
            ws.close();

            // Try next port
            const nextPort = targetPort + 1;
            if (nextPort < this.baseWsPort + MAX_PORT_RETRIES) {
              setTimeout(() => this.connectWebSocket(nextPort), PORT_RETRY_DELAY_MS);
            } else {
              this.debug.ws('No matching server found, will retry from base port');
              setTimeout(() => this.connectWebSocket(this.baseWsPort), PORT_SCAN_RESTART_DELAY_MS);
            }
            return;
          }

          // Server matches - mark as verified and connected
          this.wsVerified = true;
          this.sweetlinkConnected = true;
          this.reconnectAttempts = 0;
          this.serverProjectDir = message.projectDir ?? null;
          this.debug.ws('Server verified', {
            appPort: serverAppPort ?? 'any',
            projectDir: this.serverProjectDir,
          });

          this.settingsManager.setWebSocket(ws);
          this.settingsManager.setConnected(true);
          ws.send(JSON.stringify({ type: 'load-settings' }));
          this.render();
          return;
        }

        // Ignore other commands until verified
        if (!this.wsVerified) {
          this.debug.ws('Ignoring command before verification', { type: message.type });
          return;
        }

        const command = message as SweetlinkCommand;
        this.debug.ws('Received command', { type: command.type });
        await this.handleSweetlinkCommand(command);
      } catch (e) {
        console.error('[GlobalDevBar] Error handling command:', e);
      }
    };

    ws.onclose = () => {
      // Only reset connection state if we were actually verified/connected
      if (this.wsVerified) {
        this.sweetlinkConnected = false;
        this.wsVerified = false;
        this.serverProjectDir = null;
        this.settingsManager.setConnected(false);
        this.debug.ws('WebSocket disconnected');
        this.render();

        // Auto-reconnect with exponential backoff (start from base port)
        if (!this.destroyed && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delayMs = BASE_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts;
          this.reconnectAttempts++;
          this.debug.ws('Scheduling reconnect', { attempt: this.reconnectAttempts, delayMs });
          this.reconnectTimeout = setTimeout(
            () => this.connectWebSocket(this.baseWsPort),
            Math.min(delayMs, MAX_RECONNECT_DELAY_MS)
          );
        }
      }
    };

    ws.onerror = () => {
      // Error will trigger onclose, which handles reconnection
      this.debug.ws('WebSocket error');
    };
  }

  private async handleSweetlinkCommand(command: SweetlinkCommand): Promise<void> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    switch (command.type) {
      case 'screenshot': {
        const targetElement = command.selector
          ? (document.querySelector(command.selector) as HTMLElement) || document.body
          : document.body;
        const canvas = await html2canvas(targetElement, {
          logging: false,
          useCORS: true,
          allowTaint: true,
        });
        ws.send(
          JSON.stringify({
            success: true,
            data: {
              screenshot: canvas.toDataURL('image/png'),
              width: canvas.width,
              height: canvas.height,
              selector: command.selector || 'body',
            },
            timestamp: Date.now(),
          })
        );
        break;
      }
      case 'get-logs': {
        let logs = this.consoleLogs;
        if (command.filter) {
          const filter = command.filter.toLowerCase();
          logs = logs.filter(
            (log) => log.level.includes(filter) || log.message.toLowerCase().includes(filter)
          );
        }
        ws.send(JSON.stringify({ success: true, data: logs, timestamp: Date.now() }));
        break;
      }
      case 'query-dom': {
        if (command.selector) {
          const elements = Array.from(document.querySelectorAll(command.selector));
          const results = elements.map((el: Element) => {
            if (command.property)
              return (el as unknown as Record<string, unknown>)[command.property] ?? null;
            return {
              tagName: el.tagName,
              className: el.className,
              id: el.id,
              textContent: el.textContent?.trim().slice(0, 100),
            };
          });
          ws.send(
            JSON.stringify({
              success: true,
              data: { count: results.length, results },
              timestamp: Date.now(),
            })
          );
        }
        break;
      }
      case 'exec-js': {
        if (command.code) {
          try {
            // Use indirect eval to avoid strict mode issues
            const indirectEval = eval;
            const result = indirectEval(command.code);
            ws.send(JSON.stringify({ success: true, data: result, timestamp: Date.now() }));
          } catch (e) {
            ws.send(
              JSON.stringify({
                success: false,
                error: e instanceof Error ? e.message : 'Execution failed',
                timestamp: Date.now(),
              })
            );
          }
        }
        break;
      }
      case 'screenshot-saved':
        this.handleNotification('screenshot', command.path, SCREENSHOT_NOTIFICATION_MS);
        break;
      case 'design-review-saved':
        this.designReviewInProgress = false;
        this.handleNotification('designReview', command.reviewPath, DESIGN_REVIEW_NOTIFICATION_MS);
        break;
      case 'design-review-error':
        this.designReviewInProgress = false;
        this.designReviewError = command.error || 'Unknown error';
        console.error('[GlobalDevBar] Design review failed:', command.error);
        // Clear error after notification duration
        if (this.designReviewErrorTimeout) clearTimeout(this.designReviewErrorTimeout);
        this.designReviewErrorTimeout = setTimeout(() => {
          this.designReviewError = null;
          this.render();
        }, DESIGN_REVIEW_NOTIFICATION_MS);
        this.render();
        break;
      case 'api-key-status': {
        // Properties are at top level of the response
        const response = command as unknown as {
          configured?: boolean;
          maskedKey?: string;
          model?: string;
          pricing?: { input: number; output: number };
        };
        this.apiKeyStatus = {
          configured: response.configured ?? false,
          maskedKey: response.maskedKey,
          model: response.model,
          pricing: response.pricing,
        };
        // Re-render to update the confirmation modal
        this.render();
        break;
      }
      case 'outline-saved':
        this.handleNotification('outline', command.outlinePath, SCREENSHOT_NOTIFICATION_MS);
        break;
      case 'outline-error':
        console.error('[GlobalDevBar] Outline save failed:', command.error);
        break;
      case 'schema-saved':
        this.handleNotification('schema', command.schemaPath, SCREENSHOT_NOTIFICATION_MS);
        break;
      case 'schema-error':
        console.error('[GlobalDevBar] Schema save failed:', command.error);
        break;
      case 'settings-loaded':
        this.handleSettingsLoaded(command.settings as DevBarSettings | null);
        break;
      case 'settings-saved':
        this.debug.state('Settings saved to server', { path: command.settingsPath });
        break;
      case 'settings-error':
        console.error('[GlobalDevBar] Settings operation failed:', command.error);
        break;
    }
  }

  /**
   * Handle settings loaded from server
   */
  private handleSettingsLoaded(settings: DevBarSettings | null): void {
    if (!settings) {
      this.debug.state('No server settings found, using local');
      return;
    }

    this.debug.state('Settings loaded from server', settings);

    // Update settings manager
    this.settingsManager.handleSettingsLoaded(settings);

    // Apply settings to local state
    this.applySettings(settings);
  }

  /**
   * Apply settings to the DevBar state and options
   */
  private applySettings(settings: DevBarSettings): void {
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

  /**
   * Handle notification state updates with auto-clear timeout
   */
  private handleNotification(
    type: 'screenshot' | 'designReview' | 'outline' | 'schema',
    path: string | undefined,
    durationMs: number
  ): void {
    if (!path) return;

    // Update the appropriate state
    switch (type) {
      case 'screenshot':
        this.lastScreenshot = path;
        if (this.screenshotTimeout) clearTimeout(this.screenshotTimeout);
        this.screenshotTimeout = setTimeout(() => {
          this.lastScreenshot = null;
          this.render();
        }, durationMs);
        break;
      case 'designReview':
        this.lastDesignReview = path;
        if (this.designReviewTimeout) clearTimeout(this.designReviewTimeout);
        this.designReviewTimeout = setTimeout(() => {
          this.lastDesignReview = null;
          this.render();
        }, durationMs);
        break;
      case 'outline':
        this.savingOutline = false;
        this.lastOutline = path;
        if (this.outlineTimeout) clearTimeout(this.outlineTimeout);
        this.outlineTimeout = setTimeout(() => {
          this.lastOutline = null;
          this.render();
        }, durationMs);
        break;
      case 'schema':
        this.savingSchema = false;
        this.lastSchema = path;
        if (this.schemaTimeout) clearTimeout(this.schemaTimeout);
        this.schemaTimeout = setTimeout(() => {
          this.lastSchema = null;
          this.render();
        }, durationMs);
        break;
    }
    this.render();
  }

  private setupBreakpointDetection(): void {
    const updateBreakpointInfo = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      // Determine breakpoint by checking thresholds in descending order
      const breakpointOrder: Array<keyof typeof TAILWIND_BREAKPOINTS> = [
        '2xl',
        'xl',
        'lg',
        'md',
        'sm',
      ];
      const tailwindBreakpoint =
        breakpointOrder.find((bp) => width >= TAILWIND_BREAKPOINTS[bp].min) ?? 'base';

      this.breakpointInfo = {
        tailwindBreakpoint,
        dimensions: `${width}x${height}`,
      };
      this.render();
    };

    updateBreakpointInfo();
    this.resizeHandler = updateBreakpointInfo;
    window.addEventListener('resize', this.resizeHandler);
  }

  private setupPerformanceMonitoring(): void {
    const updatePerfStats = () => {
      // FCP
      const paintEntries = performance.getEntriesByType('paint');
      const fcpEntry = paintEntries.find((entry) => entry.name === 'first-contentful-paint');
      const fcp = fcpEntry ? `${Math.round(fcpEntry.startTime)}ms` : '-';

      // LCP (from cached value, updated by observer)
      const lcp = this.lcpValue !== null ? `${Math.round(this.lcpValue)}ms` : '-';

      // CLS (cumulative layout shift)
      const cls = this.clsValue > 0 ? this.clsValue.toFixed(3) : '-';

      // INP (Interaction to Next Paint)
      const inp = this.inpValue > 0 ? `${Math.round(this.inpValue)}ms` : '-';

      // Total Resource Size
      const resources = performance.getEntriesByType('resource');
      let totalBytes = 0;

      const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navEntry) {
        totalBytes += navEntry.transferSize || 0;
      }

      resources.forEach((entry) => {
        const resourceEntry = entry as PerformanceResourceTiming;
        totalBytes += resourceEntry.transferSize || 0;
      });

      const totalSize =
        totalBytes > 1024 * 1024
          ? `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.round(totalBytes / 1024)} KB`;

      this.perfStats = { fcp, lcp, cls, inp, totalSize };
      this.debug.perf('Performance stats updated', this.perfStats);
      this.render();
    };

    if (document.readyState === 'complete') {
      setTimeout(updatePerfStats, 100);
    } else {
      window.addEventListener('load', () => setTimeout(updatePerfStats, 100));
    }

    // FCP Observer
    try {
      this.fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if (entry.name === 'first-contentful-paint') {
            updatePerfStats();
          }
        });
      });
      this.fcpObserver.observe({ type: 'paint', buffered: true });
    } catch (e) {
      console.warn('[GlobalDevBar] FCP PerformanceObserver not supported', e);
    }

    // LCP Observer
    try {
      this.lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          this.lcpValue = lastEntry.startTime;
          this.debug.perf('LCP updated', { lcp: this.lcpValue });
          updatePerfStats();
        }
      });
      this.lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {
      console.warn('[GlobalDevBar] LCP PerformanceObserver not supported', e);
    }

    // CLS Observer (Cumulative Layout Shift)
    try {
      this.clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // Only count layout shifts without recent user input
          const layoutShift = entry as PerformanceEntry & {
            hadRecentInput?: boolean;
            value?: number;
          };
          if (!layoutShift.hadRecentInput && layoutShift.value) {
            this.clsValue += layoutShift.value;
            this.debug.perf('CLS updated', { cls: this.clsValue });
            updatePerfStats();
          }
        }
      });
      this.clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch (e) {
      console.warn('[GlobalDevBar] CLS PerformanceObserver not supported', e);
    }

    // INP Observer (Interaction to Next Paint)
    try {
      this.inpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const eventEntry = entry as PerformanceEntry & { duration?: number };
          if (eventEntry.duration && eventEntry.duration > this.inpValue) {
            this.inpValue = eventEntry.duration;
            this.debug.perf('INP updated', { inp: this.inpValue });
            updatePerfStats();
          }
        }
      });
      // durationThreshold filters out very short interactions
      this.inpObserver.observe({
        type: 'event',
        buffered: true,
        durationThreshold: 16,
      } as PerformanceObserverInit);
    } catch (e) {
      console.warn('[GlobalDevBar] INP PerformanceObserver not supported', e);
    }
  }

  private setupKeyboardShortcuts(): void {
    this.keydownHandler = (e: KeyboardEvent) => {
      // Close modals/popovers on Escape
      if (e.key === 'Escape') {
        if (this.showSettingsPopover) {
          this.showSettingsPopover = false;
          this.render();
          return;
        }
        if (
          this.consoleFilter ||
          this.showOutlineModal ||
          this.showSchemaModal ||
          this.showDesignReviewConfirm
        ) {
          this.consoleFilter = null;
          this.showOutlineModal = false;
          this.showSchemaModal = false;
          this.showDesignReviewConfirm = false;
          this.render();
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        // Cmd/Ctrl+Shift+M: Toggle compact mode
        if (e.key === 'M' || e.key === 'm') {
          e.preventDefault();
          this.toggleCompactMode();
          return;
        }
        if (e.key === 'S' || e.key === 's') {
          e.preventDefault();
          if (this.sweetlinkConnected && !this.capturing) {
            this.handleScreenshot(false);
          }
        } else if (e.key === 'C' || e.key === 'c') {
          const selection = window.getSelection();
          if (!selection || selection.toString().length === 0) {
            e.preventDefault();
            if (!this.capturing) {
              this.handleScreenshot(true);
            }
          }
        }
      }
    };
    window.addEventListener('keydown', this.keydownHandler);
  }

  private setupTheme(): void {
    // Load stored theme preference from settings manager
    const settings = this.settingsManager.getSettings();
    this.themeMode = settings.themeMode;
    // Inject the appropriate theme CSS variables on initial load
    injectThemeCSS(getTheme(this.themeMode));
    this.debug.state('Theme loaded', { mode: this.themeMode });

    // Listen for system theme changes
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.themeMediaHandler = () => {
        if (this.themeMode === 'system') {
          // Re-inject theme CSS when system preference changes
          injectThemeCSS(getTheme(this.themeMode));
          this.debug.state('System theme changed', {
            effectiveTheme: getEffectiveTheme(this.themeMode),
          });
          this.render();
        }
      };
      this.themeMediaQuery.addEventListener('change', this.themeMediaHandler);
    }
  }

  private loadCompactMode(): void {
    const settings = this.settingsManager.getSettings();
    this.compactMode = settings.compactMode;
    this.debug.state('Compact mode loaded', { compactMode: this.compactMode });
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
    this.themeMode = mode;
    this.settingsManager.saveSettings({ themeMode: mode });
    // Inject the appropriate theme CSS variables
    injectThemeCSS(getTheme(mode));
    this.debug.state('Theme mode changed', { mode, effectiveTheme: getEffectiveTheme(mode) });
    this.render();
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

  private async copyPathToClipboard(path: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(path);
      this.copiedPath = true;
      if (this.copiedPathTimeout) clearTimeout(this.copiedPathTimeout);
      this.copiedPathTimeout = setTimeout(() => {
        this.copiedPath = false;
        this.render();
      }, CLIPBOARD_NOTIFICATION_MS);
      this.render();
    } catch (error) {
      console.error('[GlobalDevBar] Failed to copy path:', error);
    }
  }

  private async handleScreenshot(copyToClipboard = false): Promise<void> {
    if (this.capturing) return;
    if (!copyToClipboard && !this.sweetlinkConnected) return;

    let cleanup: (() => void) | null = null;

    try {
      this.capturing = true;
      this.render();

      cleanup = prepareForCapture();
      await delay(SCREENSHOT_BLUR_DELAY_MS);

      const canvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        allowTaint: true,
        scale: SCREENSHOT_SCALE,
        width: window.innerWidth,
        windowWidth: window.innerWidth,
      });

      // Restore page state
      cleanup();
      cleanup = null;

      if (copyToClipboard) {
        try {
          await copyCanvasToClipboard(canvas);
          this.copiedToClipboard = true;
          this.render();
          if (this.screenshotTimeout) clearTimeout(this.screenshotTimeout);
          this.screenshotTimeout = setTimeout(() => {
            this.copiedToClipboard = false;
            this.render();
          }, CLIPBOARD_NOTIFICATION_MS);
        } catch (e) {
          console.error('[GlobalDevBar] Failed to copy to clipboard:', e);
        }
      } else {
        const dataUrl = canvasToDataUrl(canvas, {
          format: 'jpeg',
          quality: DEVBAR_SCREENSHOT_QUALITY,
        });
        if (this.ws?.readyState === WebSocket.OPEN) {
          // Include web vitals metrics
          const webVitals: Record<string, number> = {};
          if (this.lcpValue !== null) webVitals.lcp = Math.round(this.lcpValue);
          if (this.clsValue > 0) webVitals.cls = this.clsValue;
          if (this.inpValue > 0) webVitals.inp = Math.round(this.inpValue);

          // Get FCP from performance entries
          const fcpEntry = performance
            .getEntriesByType('paint')
            .find((e) => e.name === 'first-contentful-paint');
          if (fcpEntry) webVitals.fcp = Math.round(fcpEntry.startTime);

          // Calculate page size
          let pageSize = 0;
          const navEntry = performance.getEntriesByType(
            'navigation'
          )[0] as PerformanceNavigationTiming;
          if (navEntry) pageSize += navEntry.transferSize || 0;
          performance.getEntriesByType('resource').forEach((entry) => {
            pageSize += (entry as PerformanceResourceTiming).transferSize || 0;
          });

          this.ws.send(
            JSON.stringify({
              type: 'save-screenshot',
              data: {
                screenshot: dataUrl,
                width: canvas.width,
                height: canvas.height,
                logs: this.consoleLogs,
                url: window.location.href,
                timestamp: Date.now(),
                webVitals: Object.keys(webVitals).length > 0 ? webVitals : undefined,
                pageSize: pageSize > 0 ? pageSize : undefined,
              },
            })
          );
        }
      }
    } catch (e) {
      console.error('[GlobalDevBar] Screenshot failed:', e);
      if (cleanup) cleanup();
    } finally {
      this.capturing = false;
      this.render();
    }
  }

  private async handleDesignReview(): Promise<void> {
    if (this.designReviewInProgress || !this.sweetlinkConnected) return;

    let cleanup: (() => void) | null = null;

    try {
      this.designReviewInProgress = true;
      this.designReviewError = null; // Clear any previous error
      if (this.designReviewErrorTimeout) {
        clearTimeout(this.designReviewErrorTimeout);
        this.designReviewErrorTimeout = null;
      }
      this.render();

      cleanup = prepareForCapture();
      await delay(SCREENSHOT_BLUR_DELAY_MS);

      const canvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        allowTaint: true,
        scale: 1, // Full quality for design review
        width: window.innerWidth,
        windowWidth: window.innerWidth,
      });

      // Restore page state
      cleanup();
      cleanup = null;

      const dataUrl = canvasToDataUrl(canvas, { format: 'png' });
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'design-review-screenshot',
            data: {
              screenshot: dataUrl,
              width: canvas.width,
              height: canvas.height,
              logs: this.consoleLogs,
              url: window.location.href,
              timestamp: Date.now(),
            },
          })
        );
      }
    } catch (e) {
      console.error('[GlobalDevBar] Design review failed:', e);
      if (cleanup) cleanup();
      this.designReviewInProgress = false;
      this.render();
    }
  }

  /**
   * Show the design review confirmation modal
   * Checks API key status first
   */
  private showDesignReviewConfirmation(): void {
    if (!this.sweetlinkConnected) return;

    // Request API key status from server
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'check-api-key' }));
    }

    // Show the confirmation modal
    this.showDesignReviewConfirm = true;
    this.showOutlineModal = false;
    this.showSchemaModal = false;
    this.consoleFilter = null;
    this.render();
  }

  /**
   * Calculate estimated cost for design review based on viewport size
   */
  private calculateCostEstimate(): { tokens: number; cost: string } | null {
    if (!this.apiKeyStatus?.pricing) return null;

    // Image token estimation for Claude Vision:
    // Images are resized to fit within a bounding box, then tokenized
    // Rough estimate: ~1 token per 1.5x1.5 pixels, or (width * height) / 750
    const width = window.innerWidth;
    const height = window.innerHeight;
    const imageTokens = Math.ceil((width * height) / 750);

    // Prompt is ~500 tokens, output up to 2048 tokens
    const promptTokens = 500;
    const estimatedOutputTokens = 1500; // Conservative estimate

    const totalInputTokens = imageTokens + promptTokens;
    const { input: inputPrice, output: outputPrice } = this.apiKeyStatus.pricing;

    const inputCost = (totalInputTokens / 1_000_000) * inputPrice;
    const outputCost = (estimatedOutputTokens / 1_000_000) * outputPrice;
    const totalCost = inputCost + outputCost;

    return {
      tokens: totalInputTokens + estimatedOutputTokens,
      cost: totalCost < 0.01 ? '<$0.01' : `~$${totalCost.toFixed(2)}`,
    };
  }

  /**
   * Close the design review confirmation modal
   */
  private closeDesignReviewConfirm(): void {
    this.showDesignReviewConfirm = false;
    this.apiKeyStatus = null; // Reset so it's re-fetched next time
    this.render();
  }

  /**
   * Proceed with design review after confirmation
   */
  private proceedWithDesignReview(): void {
    this.showDesignReviewConfirm = false;
    this.handleDesignReview();
  }

  private handleDocumentOutline(): void {
    // Toggle outline modal
    this.showOutlineModal = !this.showOutlineModal;
    this.showSchemaModal = false;
    this.consoleFilter = null;
    this.render();
  }

  private handlePageSchema(): void {
    // Toggle schema modal
    this.showSchemaModal = !this.showSchemaModal;
    this.showOutlineModal = false;
    this.consoleFilter = null;
    this.render();
  }

  private handleSaveOutline(): void {
    if (this.savingOutline) return; // Prevent repeated clicks

    const outline = extractDocumentOutline();
    const markdown = outlineToMarkdown(outline);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.savingOutline = true;
      this.render();

      this.ws.send(
        JSON.stringify({
          type: 'save-outline',
          data: {
            outline,
            markdown,
            url: window.location.href,
            title: document.title,
            timestamp: Date.now(),
          },
        })
      );
    }
  }

  private handleSaveSchema(): void {
    if (this.savingSchema) return; // Prevent repeated clicks

    const schema = extractPageSchema();
    const markdown = schemaToMarkdown(schema);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.savingSchema = true;
      this.render();

      this.ws.send(
        JSON.stringify({
          type: 'save-schema',
          data: {
            schema,
            markdown,
            url: window.location.href,
            title: document.title,
            timestamp: Date.now(),
          },
        })
      );
    }
  }

  private clearConsoleLogs(): void {
    // Clear the logs array
    earlyConsoleCapture.logs = [];
    earlyConsoleCapture.errorCount = 0;
    earlyConsoleCapture.warningCount = 0;
    this.consoleLogs = [];
    this.consoleFilter = null;
    this.render();
  }

  // ============================================================================
  // Render Methods (Using Safe DOM Methods)
  // ============================================================================

  private render(): void {
    if (this.destroyed) return;
    if (typeof document === 'undefined') return;

    // Remove existing container if any
    if (this.container) {
      this.container.remove();
    }

    // Create new container
    this.container = document.createElement('div');
    this.container.setAttribute('data-devbar', 'true');

    if (this.collapsed) {
      this.renderCollapsed();
    } else if (this.compactMode) {
      this.renderCompact();
    } else {
      this.renderExpanded();
    }

    document.body.appendChild(this.container);

    // Render overlays/modals
    this.renderOverlays();
  }

  private renderOverlays(): void {
    // Remove existing overlay
    if (this.overlayElement) {
      this.overlayElement.remove();
      this.overlayElement = null;
    }

    // Render console popup if filter is active
    if (this.consoleFilter) {
      this.renderConsolePopup();
    }

    // Render outline modal
    if (this.showOutlineModal) {
      this.renderOutlineModal();
    }

    // Render schema modal
    if (this.showSchemaModal) {
      this.renderSchemaModal();
    }

    // Render design review confirmation modal
    if (this.showDesignReviewConfirm) {
      this.renderDesignReviewConfirmModal();
    }

    // Render settings popover
    if (this.showSettingsPopover) {
      this.renderSettingsPopover();
    }
  }

  private renderDesignReviewConfirmModal(): void {
    const color = BUTTON_COLORS.review;
    const closeModal = () => this.closeDesignReviewConfirm();

    const overlay = createModalOverlay(closeModal);
    // Override z-index for this modal to be above others
    overlay.style.zIndex = '10003';

    const modal = createModalBox(color);
    modal.style.maxWidth = '450px';

    // Header with title and close button
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 18px',
      borderBottom: `1px solid ${color}40`,
      backgroundColor: `${color}15`,
    });

    const title = document.createElement('span');
    Object.assign(title.style, { color, fontSize: '0.875rem', fontWeight: '600' });
    title.textContent = 'AI Design Review';
    header.appendChild(title);

    const closeBtn = createStyledButton({
      color: COLORS.textMuted,
      text: '×',
      padding: '0',
      fontSize: '1.25rem',
    });
    closeBtn.style.border = 'none';
    closeBtn.onclick = closeModal;
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Content
    const content = document.createElement('div');
    Object.assign(content.style, {
      padding: '18px',
      color: COLORS.text,
      fontSize: '0.8125rem',
      lineHeight: '1.6',
    });

    if (this.apiKeyStatus === null) {
      content.appendChild(createEmptyMessage('Checking API key configuration...'));
    } else if (!this.apiKeyStatus.configured) {
      content.appendChild(this.renderApiKeyNotConfiguredContent());
    } else {
      content.appendChild(this.renderApiKeyConfiguredContent());
    }

    modal.appendChild(content);

    // Footer with buttons
    const footer = document.createElement('div');
    Object.assign(footer.style, {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '10px',
      padding: '14px 18px',
      borderTop: `1px solid ${COLORS.border}`,
    });

    const cancelBtn = createStyledButton({
      color: COLORS.textMuted,
      text: 'Cancel',
      padding: '8px 16px',
    });
    cancelBtn.onclick = closeModal;
    footer.appendChild(cancelBtn);

    if (this.apiKeyStatus?.configured) {
      const proceedBtn = createStyledButton({ color, text: 'Run Review', padding: '8px 16px' });
      proceedBtn.style.backgroundColor = `${color}20`;
      proceedBtn.onclick = () => this.proceedWithDesignReview();
      footer.appendChild(proceedBtn);
    }

    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  /**
   * Render content when API key is not configured
   */
  private renderApiKeyNotConfiguredContent(): HTMLElement {
    const wrapper = document.createElement('div');

    wrapper.appendChild(
      createInfoBox(
        COLORS.error,
        'API Key Not Configured',
        'The ANTHROPIC_API_KEY environment variable is not set.'
      )
    );

    // Instructions
    const instructions = document.createElement('div');
    Object.assign(instructions.style, { marginBottom: '12px' });

    const instructTitle = document.createElement('div');
    Object.assign(instructTitle.style, {
      color: COLORS.textSecondary,
      fontWeight: '600',
      marginBottom: '8px',
    });
    instructTitle.textContent = 'To configure:';
    instructions.appendChild(instructTitle);

    const steps = [
      { text: '1. Get an API key from console.anthropic.com', highlight: false },
      { text: '2. Add to your .env file:', highlight: false },
      { text: '   ANTHROPIC_API_KEY=sk-ant-...', highlight: true },
      { text: '3. Restart your dev server', highlight: false },
    ];

    steps.forEach(({ text, highlight }) => {
      const stepDiv = document.createElement('div');
      Object.assign(stepDiv.style, {
        color: highlight ? COLORS.primary : COLORS.textMuted,
        fontSize: '0.75rem',
        marginBottom: '4px',
        fontFamily: FONT_MONO,
      });
      stepDiv.textContent = text;
      instructions.appendChild(stepDiv);
    });

    wrapper.appendChild(instructions);
    return wrapper;
  }

  /**
   * Render content when API key is configured (cost estimate and model info)
   */
  private renderApiKeyConfiguredContent(): HTMLElement {
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, { marginBottom: '16px' });

    const desc = document.createElement('p');
    Object.assign(desc.style, { color: COLORS.textSecondary, marginBottom: '12px' });
    desc.textContent = 'This will capture a screenshot and send it to Claude for design analysis.';
    wrapper.appendChild(desc);

    // Cost estimate
    const estimate = this.calculateCostEstimate();
    if (estimate) {
      const costBox = createInfoBox(COLORS.primary, 'Estimated Cost', []);
      // Remove default margin and adjust padding
      costBox.style.marginBottom = '0';
      costBox.style.padding = '12px';

      const costDetails = document.createElement('div');
      Object.assign(costDetails.style, {
        display: 'flex',
        justifyContent: 'space-between',
        color: COLORS.textSecondary,
        fontSize: '0.75rem',
      });

      const tokensSpan = document.createElement('span');
      tokensSpan.textContent = `~${estimate.tokens.toLocaleString()} tokens`;
      costDetails.appendChild(tokensSpan);

      const priceSpan = document.createElement('span');
      Object.assign(priceSpan.style, { color: COLORS.warning, fontWeight: '600' });
      priceSpan.textContent = estimate.cost;
      costDetails.appendChild(priceSpan);

      costBox.appendChild(costDetails);
      wrapper.appendChild(costBox);
    }

    // Model info
    if (this.apiKeyStatus?.model) {
      const modelDiv = document.createElement('div');
      Object.assign(modelDiv.style, {
        color: COLORS.textMuted,
        fontSize: '0.6875rem',
        marginTop: '12px',
      });
      modelDiv.textContent = `Model: ${this.apiKeyStatus.model}`;
      if (this.apiKeyStatus.maskedKey) {
        modelDiv.textContent += ` | Key: ${this.apiKeyStatus.maskedKey}`;
      }
      wrapper.appendChild(modelDiv);
    }

    return wrapper;
  }

  private renderConsolePopup(): void {
    const filterType = this.consoleFilter;
    if (!filterType) return;

    const logs = earlyConsoleCapture.logs.filter((log) => log.level === filterType);
    const color = filterType === 'error' ? BUTTON_COLORS.error : BUTTON_COLORS.warning;
    const label = filterType === 'error' ? 'Errors' : 'Warnings';

    const popup = document.createElement('div');
    popup.setAttribute('data-devbar', 'true');
    Object.assign(popup.style, {
      position: 'fixed',
      bottom: '60px',
      left: '80px',
      zIndex: '10002',
      backgroundColor: 'rgba(17, 24, 39, 0.98)',
      border: `1px solid ${color}`,
      borderRadius: '8px',
      boxShadow: `0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px ${color}33`,
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      minWidth: '400px',
      maxWidth: '600px',
      maxHeight: '400px',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: FONT_MONO,
    });

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 14px',
      borderBottom: `1px solid ${color}40`,
    });

    const title = document.createElement('span');
    Object.assign(title.style, { color, fontSize: '0.8125rem', fontWeight: '600' });
    title.textContent = `Console ${label} (${logs.length})`;
    header.appendChild(title);

    const headerButtons = document.createElement('div');
    Object.assign(headerButtons.style, { display: 'flex', gap: '8px' });

    // Clear button
    const clearBtn = createStyledButton({
      color,
      text: 'Clear All',
      padding: '4px 10px',
      borderRadius: '4px',
      fontSize: '0.6875rem',
    });
    clearBtn.onclick = () => this.clearConsoleLogs();
    headerButtons.appendChild(clearBtn);

    // Close button - match Clear button padding for consistent height
    const closeBtn = createStyledButton({
      color,
      text: '×',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '0.75rem',
    });
    closeBtn.onclick = () => {
      this.consoleFilter = null;
      this.render();
    };
    headerButtons.appendChild(closeBtn);

    header.appendChild(headerButtons);
    popup.appendChild(header);

    // Content
    const content = document.createElement('div');
    Object.assign(content.style, { flex: '1', overflow: 'auto', padding: '8px 0' });

    if (logs.length === 0) {
      const emptyMsg = document.createElement('div');
      Object.assign(emptyMsg.style, {
        padding: '20px',
        textAlign: 'center',
        color: COLORS.textMuted,
        fontSize: '0.75rem',
      });
      emptyMsg.textContent = `No ${filterType}s recorded`;
      content.appendChild(emptyMsg);
    } else {
      this.renderConsoleLogs(content, logs, color);
    }

    popup.appendChild(content);
    this.overlayElement = popup;
    document.body.appendChild(popup);
  }

  /**
   * Render console log items into a container
   */
  private renderConsoleLogs(container: HTMLElement, logs: ConsoleLog[], color: string): void {
    logs.forEach((log, index) => {
      const logItem = document.createElement('div');
      Object.assign(logItem.style, {
        padding: '8px 14px',
        borderBottom: index < logs.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
      });

      const timestamp = document.createElement('span');
      Object.assign(timestamp.style, {
        color: COLORS.textMuted,
        fontSize: '0.625rem',
        marginRight: '8px',
      });
      timestamp.textContent = new Date(log.timestamp).toLocaleTimeString();
      logItem.appendChild(timestamp);

      const message = document.createElement('span');
      Object.assign(message.style, {
        color,
        fontSize: '0.6875rem',
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
      });
      message.textContent =
        log.message.length > 500 ? `${log.message.slice(0, 500)}...` : log.message;
      logItem.appendChild(message);

      container.appendChild(logItem);
    });
  }

  private renderOutlineModal(): void {
    const outline = extractDocumentOutline();
    const color = BUTTON_COLORS.outline;

    const closeModal = () => {
      this.showOutlineModal = false;
      this.render();
    };

    const overlay = createModalOverlay(closeModal);
    const modal = createModalBox(color);

    const header = createModalHeader({
      color,
      title: 'Document Outline',
      onClose: closeModal,
      onCopyMd: async () => {
        const markdown = outlineToMarkdown(outline);
        await navigator.clipboard.writeText(markdown);
      },
      onSave: () => this.handleSaveOutline(),
      sweetlinkConnected: this.sweetlinkConnected,
      isSaving: this.savingOutline,
      savedPath: this.lastOutline,
    });
    modal.appendChild(header);

    const content = createModalContent();

    if (outline.length === 0) {
      content.appendChild(createEmptyMessage('No semantic elements found in this document'));
    } else {
      this.renderOutlineNodes(outline, content, 0);
    }

    modal.appendChild(content);
    overlay.appendChild(modal);

    this.overlayElement = overlay;
    document.body.appendChild(overlay);
  }

  /**
   * Recursively render outline nodes into a container element
   */
  private renderOutlineNodes(nodes: OutlineNode[], parentEl: HTMLElement, depth: number): void {
    for (const node of nodes) {
      const nodeEl = document.createElement('div');
      Object.assign(nodeEl.style, {
        padding: `4px 0 4px ${depth * 16}px`,
      });

      const tagSpan = document.createElement('span');
      const categoryColor = CATEGORY_COLORS[node.category || 'other'] || CATEGORY_COLORS.other;
      Object.assign(tagSpan.style, {
        color: categoryColor,
        fontSize: '0.6875rem',
        fontWeight: '500',
      });
      tagSpan.textContent = `<${node.tagName}>`;
      nodeEl.appendChild(tagSpan);

      if (node.category) {
        const categorySpan = document.createElement('span');
        Object.assign(categorySpan.style, {
          color: COLORS.textMuted,
          fontSize: '0.625rem',
          marginLeft: '6px',
        });
        categorySpan.textContent = `[${node.category}]`;
        nodeEl.appendChild(categorySpan);
      }

      const textSpan = document.createElement('span');
      Object.assign(textSpan.style, {
        color: '#d1d5db',
        fontSize: '0.6875rem',
        marginLeft: '8px',
      });
      const truncatedText = node.text.length > 60 ? `${node.text.slice(0, 60)}...` : node.text;
      textSpan.textContent = truncatedText;
      nodeEl.appendChild(textSpan);

      if (node.id) {
        const idSpan = document.createElement('span');
        Object.assign(idSpan.style, {
          color: '#9ca3af',
          fontSize: '0.625rem',
          marginLeft: '6px',
        });
        idSpan.textContent = `#${node.id}`;
        nodeEl.appendChild(idSpan);
      }

      parentEl.appendChild(nodeEl);

      if (node.children.length > 0) {
        this.renderOutlineNodes(node.children, parentEl, depth + 1);
      }
    }
  }

  private renderSchemaModal(): void {
    const schema = extractPageSchema();
    const color = BUTTON_COLORS.schema;

    const closeModal = () => {
      this.showSchemaModal = false;
      this.render();
    };

    const overlay = createModalOverlay(closeModal);
    const modal = createModalBox(color);

    const header = createModalHeader({
      color,
      title: 'Page Schema',
      onClose: closeModal,
      onCopyMd: async () => {
        const markdown = schemaToMarkdown(schema);
        await navigator.clipboard.writeText(markdown);
      },
      onSave: () => this.handleSaveSchema(),
      sweetlinkConnected: this.sweetlinkConnected,
      isSaving: this.savingSchema,
      savedPath: this.lastSchema,
    });
    modal.appendChild(header);

    const content = createModalContent();

    const hasContent =
      schema.jsonLd.length > 0 ||
      Object.keys(schema.openGraph).length > 0 ||
      Object.keys(schema.twitter).length > 0 ||
      Object.keys(schema.metaTags).length > 0;

    if (!hasContent) {
      content.appendChild(createEmptyMessage('No structured data found on this page'));
    } else {
      this.renderSchemaSection(content, 'JSON-LD', schema.jsonLd, color);
      this.renderSchemaSection(content, 'Open Graph', schema.openGraph, COLORS.info);
      this.renderSchemaSection(content, 'Twitter Cards', schema.twitter, COLORS.cyan);
      this.renderSchemaSection(content, 'Meta Tags', schema.metaTags, COLORS.textMuted);
    }

    modal.appendChild(content);
    overlay.appendChild(modal);

    this.overlayElement = overlay;
    document.body.appendChild(overlay);
  }

  /**
   * Render a section of schema data (either array or key-value object)
   */
  private renderSchemaSection(
    container: HTMLElement,
    title: string,
    items: Record<string, string> | unknown[],
    color: string
  ): void {
    const isEmpty = Array.isArray(items) ? items.length === 0 : Object.keys(items).length === 0;
    if (isEmpty) return;

    const section = document.createElement('div');
    section.style.marginBottom = '20px';

    const sectionTitle = document.createElement('h3');
    Object.assign(sectionTitle.style, {
      color,
      fontSize: '0.8125rem',
      fontWeight: '600',
      marginBottom: '10px',
      borderBottom: `1px solid ${color}40`,
      paddingBottom: '6px',
    });
    sectionTitle.textContent = title;
    section.appendChild(sectionTitle);

    if (Array.isArray(items)) {
      this.renderJsonLdItems(section, items);
    } else {
      this.renderKeyValueItems(section, items);
    }

    container.appendChild(section);
  }

  /**
   * Render JSON-LD items as formatted code blocks with syntax highlighting
   */
  private renderJsonLdItems(container: HTMLElement, items: unknown[]): void {
    items.forEach((item, i) => {
      const itemEl = document.createElement('div');
      itemEl.style.marginBottom = '10px';

      const itemTitle = document.createElement('div');
      Object.assign(itemTitle.style, {
        color: '#9ca3af',
        fontSize: '0.6875rem',
        marginBottom: '4px',
      });
      itemTitle.textContent = `Schema ${i + 1}`;
      itemEl.appendChild(itemTitle);

      const codeEl = document.createElement('pre');
      Object.assign(codeEl.style, {
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '4px',
        padding: '10px',
        overflow: 'auto',
        fontSize: '0.625rem',
        margin: '0',
        maxHeight: '300px', // Taller for more content
      });
      // Syntax highlight the JSON using DOM methods for safety
      this.appendHighlightedJson(codeEl, JSON.stringify(item, null, 2));
      itemEl.appendChild(codeEl);

      container.appendChild(itemEl);
    });
  }

  /**
   * Append syntax-highlighted JSON to an element using safe DOM methods
   * Uses textContent for all text to prevent XSS
   */
  private appendHighlightedJson(container: HTMLElement, json: string): void {
    // Color map for different token types
    const colors: Record<string, string> = {
      key: COLORS.primary, // green
      string: COLORS.warning, // amber/yellow
      number: COLORS.purple, // purple
      boolean: COLORS.info, // blue
      nullVal: COLORS.error, // red
      punct: COLORS.textMuted, // gray
    };

    // Simple tokenizer for JSON using matchAll for safety
    const tokenPattern =
      /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|(\btrue\b|\bfalse\b)|(\bnull\b)|(-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)|([{}[\],])|(\s+)/g;

    for (const match of json.matchAll(tokenPattern)) {
      const [, str, colon, bool, nullToken, num, punct, whitespace] = match;

      if (whitespace) {
        container.appendChild(document.createTextNode(whitespace));
      } else if (str !== undefined) {
        const span = document.createElement('span');
        span.style.color = colon ? colors.key : colors.string;
        span.textContent = str;
        container.appendChild(span);
        if (colon) {
          const colonSpan = document.createElement('span');
          colonSpan.style.color = colors.punct;
          colonSpan.textContent = ':';
          container.appendChild(colonSpan);
        }
      } else if (bool) {
        const span = document.createElement('span');
        span.style.color = colors.boolean;
        span.textContent = bool;
        container.appendChild(span);
      } else if (nullToken) {
        const span = document.createElement('span');
        span.style.color = colors.nullVal;
        span.textContent = nullToken;
        container.appendChild(span);
      } else if (num) {
        const span = document.createElement('span');
        span.style.color = colors.number;
        span.textContent = num;
        container.appendChild(span);
      } else if (punct) {
        const span = document.createElement('span');
        span.style.color = colors.punct;
        span.textContent = punct;
        container.appendChild(span);
      }
    }
  }

  /**
   * Render key-value pairs as rows with ellipsis overflow and hover tooltip
   */
  private renderKeyValueItems(container: HTMLElement, items: Record<string, string>): void {
    for (const [key, value] of Object.entries(items)) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        marginBottom: '4px',
        alignItems: 'flex-start',
      });

      const keyEl = document.createElement('span');
      Object.assign(keyEl.style, {
        color: '#9ca3af',
        fontSize: '0.6875rem',
        width: '120px',
        minWidth: '120px',
        maxWidth: '120px',
        flexShrink: '0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      });
      keyEl.textContent = key;
      // Show full key on hover if it might be truncated
      if (key.length > 18) {
        keyEl.title = key;
      }
      row.appendChild(keyEl);

      const valueEl = document.createElement('span');
      const strValue = String(value);
      Object.assign(valueEl.style, {
        color: '#d1d5db',
        fontSize: '0.6875rem',
        flex: '1',
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
      });
      valueEl.textContent = strValue;
      row.appendChild(valueEl);

      container.appendChild(row);
    }
  }

  /**
   * Render compact mode - single row with essential controls only
   * Shows: connection dot, error/warn badges, screenshot button, settings gear
   */
  private renderCompact(): void {
    if (!this.container) return;

    const { position, accentColor } = this.options;
    const { errorCount, warningCount } = this.getLogCounts();

    const positionStyles: Record<
      string,
      { bottom?: string; left?: string; top?: string; right?: string; transform?: string }
    > = {
      'bottom-left': { bottom: '20px', left: '80px' },
      'bottom-right': { bottom: '20px', right: '16px' },
      'top-left': { top: '20px', left: '80px' },
      'top-right': { top: '20px', right: '16px' },
      'bottom-center': { bottom: '12px', left: '50%', transform: 'translateX(-50%)' },
    };

    const posStyle = positionStyles[position] ?? positionStyles['bottom-left'];
    const wrapper = this.container;

    // Reset position properties first
    wrapper.style.top = '';
    wrapper.style.bottom = '';
    wrapper.style.left = '';
    wrapper.style.right = '';
    wrapper.style.transform = '';

    Object.assign(wrapper.style, {
      position: 'fixed',
      ...posStyle,
      zIndex: '9999',
      backgroundColor: 'rgba(17, 24, 39, 0.95)',
      border: `1px solid ${accentColor}`,
      borderRadius: '20px',
      color: accentColor,
      boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px ${accentColor}1A`,
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      padding: '6px 10px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontFamily: FONT_MONO,
      fontSize: '0.6875rem',
    });

    // Connection indicator
    const connIndicator = document.createElement('span');
    connIndicator.className = this.tooltipClass('left', 'devbar-clickable');
    connIndicator.setAttribute(
      'data-tooltip',
      this.sweetlinkConnected ? 'Sweetlink connected' : 'Sweetlink disconnected'
    );
    Object.assign(connIndicator.style, {
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
    });
    connIndicator.onclick = (e) => {
      e.stopPropagation();
      this.collapsed = true;
      this.debug.state('Collapsed DevBar from compact mode');
      this.render();
    };

    const connDot = document.createElement('span');
    Object.assign(connDot.style, {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      backgroundColor: this.sweetlinkConnected ? COLORS.primary : COLORS.textMuted,
      boxShadow: this.sweetlinkConnected ? `0 0 6px ${COLORS.primary}` : 'none',
    });
    connIndicator.appendChild(connDot);
    wrapper.appendChild(connIndicator);

    // Error badge
    if (errorCount > 0) {
      wrapper.appendChild(this.createConsoleBadge('error', errorCount, BUTTON_COLORS.error));
    }

    // Warning badge
    if (warningCount > 0) {
      wrapper.appendChild(this.createConsoleBadge('warn', warningCount, BUTTON_COLORS.warning));
    }

    // Screenshot button (if enabled)
    if (this.options.showScreenshot) {
      wrapper.appendChild(this.createScreenshotButton(accentColor));
    }

    // Settings gear button
    wrapper.appendChild(this.createSettingsButton());

    // Expand button (double-arrow)
    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = this.tooltipClass('right');
    expandBtn.setAttribute('data-tooltip', 'Expand DevBar');
    Object.assign(expandBtn.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      border: `1px solid ${accentColor}60`,
      backgroundColor: 'transparent',
      color: `${accentColor}99`,
      cursor: 'pointer',
      fontSize: '0.5rem',
      transition: 'all 150ms',
    });
    expandBtn.textContent = '⟫';
    expandBtn.onmouseenter = () => {
      expandBtn.style.backgroundColor = `${accentColor}20`;
      expandBtn.style.borderColor = accentColor;
      expandBtn.style.color = accentColor;
    };
    expandBtn.onmouseleave = () => {
      expandBtn.style.backgroundColor = 'transparent';
      expandBtn.style.borderColor = `${accentColor}60`;
      expandBtn.style.color = `${accentColor}99`;
    };
    expandBtn.onclick = () => {
      this.toggleCompactMode();
    };
    wrapper.appendChild(expandBtn);
  }

  /**
   * Create the settings gear button
   */
  private createSettingsButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = this.tooltipClass('right');
    btn.setAttribute('data-tooltip', 'Settings (Cmd+Shift+M: toggle compact)');

    const isActive = this.showSettingsPopover;
    const color = COLORS.textSecondary;

    Object.assign(btn.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '22px',
      height: '22px',
      minWidth: '22px',
      minHeight: '22px',
      flexShrink: '0',
      borderRadius: '50%',
      border: `1px solid ${isActive ? color : `${color}60`}`,
      backgroundColor: isActive ? `${color}20` : 'transparent',
      color: isActive ? color : `${color}99`,
      cursor: 'pointer',
      transition: 'all 150ms',
    });

    btn.onclick = () => {
      this.showSettingsPopover = !this.showSettingsPopover;
      this.consoleFilter = null;
      this.showOutlineModal = false;
      this.showSchemaModal = false;
      this.showDesignReviewConfirm = false;
      this.render();
    };

    // Gear icon SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'
    );
    svg.appendChild(path);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '3');
    svg.appendChild(circle);

    btn.appendChild(svg);
    return btn;
  }

  /**
   * Create the compact mode toggle button with chevron icon
   */
  private createCompactToggleButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = this.tooltipClass('right');

    const isCompact = this.compactMode;
    const tooltip = isCompact ? 'Expand (Cmd+Shift+M)' : 'Compact (Cmd+Shift+M)';
    btn.setAttribute('data-tooltip', tooltip);

    const { accentColor } = this.options;
    const iconColor = COLORS.textSecondary;

    Object.assign(btn.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '22px',
      height: '22px',
      minWidth: '22px',
      minHeight: '22px',
      flexShrink: '0',
      borderRadius: '50%',
      border: `1px solid ${accentColor}60`,
      backgroundColor: 'transparent',
      color: `${iconColor}99`,
      cursor: 'pointer',
      transition: 'all 150ms',
    });

    btn.onmouseenter = () => {
      btn.style.borderColor = accentColor;
      btn.style.backgroundColor = `${accentColor}20`;
      btn.style.color = iconColor;
    };

    btn.onmouseleave = () => {
      btn.style.borderColor = `${accentColor}60`;
      btn.style.backgroundColor = 'transparent';
      btn.style.color = `${iconColor}99`;
    };

    btn.onclick = () => {
      this.toggleCompactMode();
    };

    // Chevron icon SVG - points right when expanded, left when compact
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    // Left chevron (<) when expanded to shrink, right chevron (>) when compact to expand
    path.setAttribute('points', isCompact ? '9 18 15 12 9 6' : '15 18 9 12 15 6');
    svg.appendChild(path);

    btn.appendChild(svg);
    return btn;
  }

  /**
   * Create a settings section with title
   */
  private createSettingsSection(title: string, hasBorder = true): HTMLDivElement {
    const color = COLORS.textSecondary;
    const section = document.createElement('div');
    Object.assign(section.style, {
      padding: '10px 14px',
      borderBottom: hasBorder ? `1px solid ${color}20` : 'none',
    });

    const sectionTitle = document.createElement('div');
    Object.assign(sectionTitle.style, {
      color,
      fontSize: '0.625rem',
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      marginBottom: '8px',
    });
    sectionTitle.textContent = title;
    section.appendChild(sectionTitle);

    return section;
  }

  /**
   * Create a toggle switch row
   */
  private createToggleRow(
    label: string,
    checked: boolean,
    accentColor: string,
    onChange: () => void
  ): HTMLDivElement {
    const color = COLORS.textSecondary;
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '6px',
    });

    const labelEl = document.createElement('span');
    Object.assign(labelEl.style, { color: COLORS.text, fontSize: '0.6875rem' });
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const toggle = document.createElement('button');
    Object.assign(toggle.style, {
      width: '32px',
      height: '18px',
      borderRadius: '9px',
      border: 'none',
      backgroundColor: checked ? accentColor : `${color}40`,
      position: 'relative',
      cursor: 'pointer',
      transition: 'all 150ms',
      flexShrink: '0',
    });

    const knob = document.createElement('span');
    Object.assign(knob.style, {
      position: 'absolute',
      top: '2px',
      left: checked ? '16px' : '2px',
      width: '14px',
      height: '14px',
      borderRadius: '50%',
      backgroundColor: '#fff',
      transition: 'left 150ms',
    });
    toggle.appendChild(knob);

    toggle.onclick = onChange;
    row.appendChild(toggle);

    return row;
  }

  /**
   * Render the settings popover
   */
  private renderSettingsPopover(): void {
    const { position, accentColor } = this.options;
    const color = COLORS.textSecondary;

    const popover = document.createElement('div');
    popover.setAttribute('data-devbar', 'true');

    // Position based on devbar position
    const isTop = position.startsWith('top');
    const isRight = position.includes('right');

    Object.assign(popover.style, {
      position: 'fixed',
      [isTop ? 'top' : 'bottom']: isTop ? '70px' : '70px',
      [isRight ? 'right' : 'left']: isRight ? '16px' : '80px',
      zIndex: '10003',
      backgroundColor: 'rgba(17, 24, 39, 0.98)',
      border: `1px solid ${accentColor}`,
      borderRadius: '8px',
      boxShadow: `0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px ${accentColor}33`,
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      minWidth: '240px',
      maxWidth: '280px',
      maxHeight: 'calc(100vh - 100px)',
      overflowY: 'auto',
      fontFamily: FONT_MONO,
    });

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 14px',
      borderBottom: `1px solid ${accentColor}30`,
      position: 'sticky',
      top: '0',
      backgroundColor: 'rgba(17, 24, 39, 0.98)',
      zIndex: '1',
    });

    const title = document.createElement('span');
    Object.assign(title.style, { color: accentColor, fontSize: '0.75rem', fontWeight: '600' });
    title.textContent = 'Settings';
    header.appendChild(title);

    const closeBtn = createStyledButton({
      color: COLORS.textMuted,
      text: '×',
      padding: '2px 6px',
      fontSize: '0.875rem',
    });
    closeBtn.style.border = 'none';
    closeBtn.onclick = () => {
      this.showSettingsPopover = false;
      this.render();
    };
    header.appendChild(closeBtn);
    popover.appendChild(header);

    // ========== THEME SECTION ==========
    const themeSection = this.createSettingsSection('Theme');

    const themeOptions = document.createElement('div');
    Object.assign(themeOptions.style, { display: 'flex', gap: '6px' });

    const themeModes: ThemeMode[] = ['system', 'dark', 'light'];
    themeModes.forEach((mode) => {
      const btn = document.createElement('button');
      const isActive = this.themeMode === mode;
      Object.assign(btn.style, {
        padding: '4px 10px',
        backgroundColor: isActive ? `${accentColor}20` : 'transparent',
        border: `1px solid ${isActive ? accentColor : `${color}40`}`,
        borderRadius: '4px',
        color: isActive ? accentColor : color,
        fontSize: '0.625rem',
        cursor: 'pointer',
        textTransform: 'capitalize',
        transition: 'all 150ms',
      });
      btn.textContent = mode;
      btn.onclick = () => {
        this.setThemeMode(mode);
      };
      themeOptions.appendChild(btn);
    });
    themeSection.appendChild(themeOptions);
    popover.appendChild(themeSection);

    // ========== DISPLAY SECTION ==========
    const displaySection = this.createSettingsSection('Display');

    // Position mini-map selector
    const positionRow = document.createElement('div');
    Object.assign(positionRow.style, { marginBottom: '10px' });

    const posLabel = document.createElement('div');
    Object.assign(posLabel.style, {
      color: COLORS.text,
      fontSize: '0.6875rem',
      marginBottom: '6px',
    });
    posLabel.textContent = 'Position';
    positionRow.appendChild(posLabel);

    // Mini-map container
    const miniMap = document.createElement('div');
    Object.assign(miniMap.style, {
      position: 'relative',
      width: '100%',
      height: '50px',
      backgroundColor: 'rgba(10, 15, 26, 0.6)',
      border: `1px solid ${color}30`,
      borderRadius: '4px',
    });

    // Position indicator styles
    type PositionValue =
      | 'bottom-left'
      | 'bottom-right'
      | 'top-left'
      | 'top-right'
      | 'bottom-center';
    const positionConfigs: Array<{
      value: PositionValue;
      style: Partial<CSSStyleDeclaration>;
      title: string;
    }> = [
      { value: 'top-left', style: { top: '8px', left: '10%' }, title: 'Top Left' },
      { value: 'top-right', style: { top: '8px', right: '6%' }, title: 'Top Right' },
      { value: 'bottom-left', style: { bottom: '8px', left: '10%' }, title: 'Bottom Left' },
      { value: 'bottom-right', style: { bottom: '8px', right: '6%' }, title: 'Bottom Right' },
      {
        value: 'bottom-center',
        style: { bottom: '6px', left: '50%', transform: 'translateX(-50%)' },
        title: 'Bottom Center',
      },
    ];

    positionConfigs.forEach(({ value, style, title }) => {
      const indicator = document.createElement('button');
      const isActive = this.options.position === value;

      Object.assign(indicator.style, {
        position: 'absolute',
        width: '20px',
        height: '6px',
        backgroundColor: isActive ? accentColor : `${color}60`,
        border: `1px solid ${isActive ? accentColor : `${color}40`}`,
        borderRadius: '2px',
        cursor: 'pointer',
        padding: '0',
        transition: 'all 150ms',
        boxShadow: isActive ? `0 0 8px ${accentColor}60` : 'none',
        ...style,
      });

      indicator.title = title;
      indicator.onclick = () => {
        this.options.position = value;
        this.settingsManager.saveSettings({ position: value });
        this.render();
      };

      // Hover effect
      indicator.onmouseenter = () => {
        if (!isActive) {
          indicator.style.backgroundColor = accentColor;
          indicator.style.borderColor = accentColor;
          indicator.style.boxShadow = `0 0 6px ${accentColor}40`;
        }
      };
      indicator.onmouseleave = () => {
        if (!isActive) {
          indicator.style.backgroundColor = `${color}60`;
          indicator.style.borderColor = `${color}40`;
          indicator.style.boxShadow = 'none';
        }
      };

      miniMap.appendChild(indicator);
    });

    positionRow.appendChild(miniMap);
    displaySection.appendChild(positionRow);

    // Compact mode toggle
    displaySection.appendChild(
      this.createToggleRow('Compact Mode', this.compactMode, accentColor, () => {
        this.toggleCompactMode();
      })
    );

    // Keyboard shortcut hint
    const shortcutHint = document.createElement('div');
    Object.assign(shortcutHint.style, {
      color: COLORS.textMuted,
      fontSize: '0.5625rem',
      marginTop: '2px',
      marginBottom: '8px',
    });
    shortcutHint.textContent = 'Keyboard: Cmd+Shift+M';
    displaySection.appendChild(shortcutHint);

    // Accent color
    const accentRow = document.createElement('div');
    Object.assign(accentRow.style, { marginBottom: '6px' });

    const accentLabel = document.createElement('div');
    Object.assign(accentLabel.style, {
      color: COLORS.text,
      fontSize: '0.6875rem',
      marginBottom: '6px',
    });
    accentLabel.textContent = 'Accent Color';
    accentRow.appendChild(accentLabel);

    const colorSwatches = document.createElement('div');
    Object.assign(colorSwatches.style, {
      display: 'flex',
      gap: '6px',
      flexWrap: 'wrap',
    });

    ACCENT_COLOR_PRESETS.forEach(({ name, value }) => {
      const swatch = document.createElement('button');
      const isActive = this.options.accentColor === value;
      Object.assign(swatch.style, {
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        backgroundColor: value,
        border: isActive ? '2px solid #fff' : '2px solid transparent',
        cursor: 'pointer',
        transition: 'all 150ms',
        boxShadow: isActive ? `0 0 8px ${value}` : 'none',
      });
      swatch.title = name;
      swatch.onclick = () => {
        this.options.accentColor = value;
        this.settingsManager.saveSettings({ accentColor: value });
        this.render();
      };
      colorSwatches.appendChild(swatch);
    });

    accentRow.appendChild(colorSwatches);
    displaySection.appendChild(accentRow);

    popover.appendChild(displaySection);

    // ========== FEATURES SECTION ==========
    const featuresSection = this.createSettingsSection('Features');

    featuresSection.appendChild(
      this.createToggleRow('Screenshot Button', this.options.showScreenshot, accentColor, () => {
        this.options.showScreenshot = !this.options.showScreenshot;
        this.settingsManager.saveSettings({ showScreenshot: this.options.showScreenshot });
        this.render();
      })
    );

    featuresSection.appendChild(
      this.createToggleRow('Console Badges', this.options.showConsoleBadges, accentColor, () => {
        this.options.showConsoleBadges = !this.options.showConsoleBadges;
        this.settingsManager.saveSettings({ showConsoleBadges: this.options.showConsoleBadges });
        this.render();
      })
    );

    featuresSection.appendChild(
      this.createToggleRow('Tooltips', this.options.showTooltips, accentColor, () => {
        this.options.showTooltips = !this.options.showTooltips;
        this.settingsManager.saveSettings({ showTooltips: this.options.showTooltips });
        this.render();
      })
    );

    popover.appendChild(featuresSection);

    // ========== METRICS SECTION ==========
    const metricsSection = this.createSettingsSection('Metrics');

    type MetricKey = 'breakpoint' | 'fcp' | 'lcp' | 'cls' | 'inp' | 'pageSize';
    const metricsToggles: Array<{ key: MetricKey; label: string }> = [
      { key: 'breakpoint', label: 'Breakpoint' },
      { key: 'fcp', label: 'FCP' },
      { key: 'lcp', label: 'LCP' },
      { key: 'cls', label: 'CLS' },
      { key: 'inp', label: 'INP' },
      { key: 'pageSize', label: 'Page Size' },
    ];

    metricsToggles.forEach(({ key, label }) => {
      const currentValue = this.options.showMetrics[key] ?? true;
      metricsSection.appendChild(
        this.createToggleRow(label, currentValue, accentColor, () => {
          this.options.showMetrics[key] = !this.options.showMetrics[key];
          this.settingsManager.saveSettings({
            showMetrics: {
              breakpoint: this.options.showMetrics.breakpoint ?? true,
              fcp: this.options.showMetrics.fcp ?? true,
              lcp: this.options.showMetrics.lcp ?? true,
              cls: this.options.showMetrics.cls ?? true,
              inp: this.options.showMetrics.inp ?? true,
              pageSize: this.options.showMetrics.pageSize ?? true,
            },
          });
          this.render();
        })
      );
    });

    popover.appendChild(metricsSection);

    // ========== RESET SECTION ==========
    const resetSection = document.createElement('div');
    Object.assign(resetSection.style, {
      padding: '10px 14px',
      borderTop: `1px solid ${color}20`,
    });

    const resetBtn = createStyledButton({
      color: COLORS.textMuted,
      text: 'Reset to Defaults',
      padding: '6px 12px',
      fontSize: '0.625rem',
    });
    Object.assign(resetBtn.style, {
      width: '100%',
      justifyContent: 'center',
    });
    resetBtn.onclick = () => {
      this.resetToDefaults();
    };
    resetSection.appendChild(resetBtn);
    popover.appendChild(resetSection);

    this.overlayElement = popover;
    document.body.appendChild(popover);
  }

  /**
   * Reset all settings to defaults
   */
  private resetToDefaults(): void {
    this.settingsManager.resetToDefaults();
    const defaults = DEFAULT_SETTINGS;
    this.applySettings(defaults);
  }

  private renderCollapsed(): void {
    if (!this.container) return;

    const { position, accentColor } = this.options;
    const { errorCount, warningCount } = this.getLogCounts();

    // Use captured dot position if available, otherwise fall back to preset positions
    // The 13px offset accounts for half the collapsed circle diameter (26px / 2)
    let posStyle: {
      bottom?: string;
      left?: string;
      top?: string;
      right?: string;
      transform?: string;
    };

    if (this.lastDotPosition) {
      // Position based on where the dot actually was
      const isTop = position.startsWith('top');
      posStyle = isTop
        ? { top: `${this.lastDotPosition.top - 13}px`, left: `${this.lastDotPosition.left - 13}px` }
        : {
            bottom: `${this.lastDotPosition.bottom - 13}px`,
            left: `${this.lastDotPosition.left - 13}px`,
          };
    } else {
      // Fallback preset positions for when no dot position was captured
      const collapsedPositions: Record<
        string,
        { bottom?: string; left?: string; top?: string; right?: string; transform?: string }
      > = {
        'bottom-left': { bottom: '27px', left: '86px' },
        'bottom-right': { bottom: '27px', right: '29px' },
        'top-left': { top: '27px', left: '86px' },
        'top-right': { top: '27px', right: '29px' },
        'bottom-center': { bottom: '19px', left: '50%', transform: 'translateX(-50%)' },
      };
      posStyle = collapsedPositions[position] ?? collapsedPositions['bottom-left'];
    }

    const wrapper = this.container;
    wrapper.className = this.tooltipClass('left', 'devbar-collapse');
    wrapper.setAttribute(
      'data-tooltip',
      `Click to expand DevBar${this.sweetlinkConnected ? ' (Sweetlink connected)' : ' (Sweetlink not connected)'}${errorCount > 0 ? `\n${errorCount} console error${errorCount === 1 ? '' : 's'}` : ''}`
    );

    // Reset position properties first to avoid stale values
    wrapper.style.top = '';
    wrapper.style.bottom = '';
    wrapper.style.left = '';
    wrapper.style.right = '';
    wrapper.style.transform = '';

    Object.assign(wrapper.style, {
      position: 'fixed',
      ...posStyle,
      zIndex: '9999',
      backgroundColor: 'rgba(17, 24, 39, 0.95)',
      border: `1px solid ${accentColor}`,
      borderRadius: '50%',
      color: accentColor,
      boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px ${accentColor}1A`,
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '26px',
      height: '26px',
      boxSizing: 'border-box',
      animation: 'devbar-collapse 150ms ease-out',
    });

    wrapper.onclick = () => {
      this.collapsed = false;
      this.debug.state('Expanded DevBar');
      this.render();
    };

    // Connection indicator dot (same size as in expanded state)
    const dot = document.createElement('span');
    Object.assign(dot.style, {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      backgroundColor: this.sweetlinkConnected ? COLORS.primary : COLORS.textMuted,
      boxShadow: this.sweetlinkConnected ? `0 0 6px ${COLORS.primary}` : 'none',
    });
    wrapper.appendChild(dot);

    // Error badge (absolute, top-right of circle, shifted left if warning badge exists)
    if (errorCount > 0) {
      wrapper.appendChild(
        this.createCollapsedBadge(
          errorCount,
          'rgba(239, 68, 68, 0.95)',
          warningCount > 0 ? '12px' : '-6px'
        )
      );
    }

    // Warning badge (absolute, top-right)
    if (warningCount > 0) {
      wrapper.appendChild(
        this.createCollapsedBadge(warningCount, 'rgba(245, 158, 11, 0.95)', '-6px')
      );
    }
  }

  private renderExpanded(): void {
    if (!this.container) return;

    const { position, accentColor, showMetrics, showScreenshot, showConsoleBadges } = this.options;
    const { errorCount, warningCount } = this.getLogCounts();

    const positionStyles: Record<
      string,
      { bottom?: string; left?: string; top?: string; right?: string; transform?: string }
    > = {
      'bottom-left': { bottom: '20px', left: '80px' },
      'bottom-right': { bottom: '20px', right: '16px' },
      'top-left': { top: '20px', left: '80px' },
      'top-right': { top: '20px', right: '16px' },
      'bottom-center': { bottom: '12px', left: '50%', transform: 'translateX(-50%)' },
    };

    const posStyle = positionStyles[position] ?? positionStyles['bottom-left'];
    const isCentered = position === 'bottom-center';
    const sizeOverrides = this.options.sizeOverrides;

    const wrapper = this.container;

    // Reset position properties first to avoid stale values from previous renders
    wrapper.style.top = '';
    wrapper.style.bottom = '';
    wrapper.style.left = '';
    wrapper.style.right = '';
    wrapper.style.transform = '';

    // Calculate size values with overrides or defaults
    // Width always fit-content, maxWidth prevents overlap with other dev bars
    // BASE breakpoint (<640px) wraps buttons to centered second row via CSS
    const defaultWidth = 'fit-content';
    const defaultMinWidth = 'auto';
    const defaultMaxWidth = isCentered ? 'calc(100vw - 140px)' : 'calc(100vw - 32px)';

    Object.assign(wrapper.style, {
      position: 'fixed',
      ...posStyle,
      zIndex: '9999',
      backgroundColor: 'rgba(17, 24, 39, 0.95)',
      border: `1px solid ${accentColor}`,
      borderRadius: '12px',
      color: accentColor,
      boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px ${accentColor}1A`,
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      boxSizing: 'border-box',
      width: sizeOverrides?.width ?? defaultWidth,
      maxWidth: sizeOverrides?.maxWidth ?? defaultMaxWidth,
      minWidth: sizeOverrides?.minWidth ?? defaultMinWidth,
      cursor: 'default',
    });

    wrapper.ondblclick = () => {
      // Capture dot position before collapsing
      const dotEl = wrapper.querySelector('.devbar-status span span') as HTMLElement;
      if (dotEl) {
        const rect = dotEl.getBoundingClientRect();
        this.lastDotPosition = {
          left: rect.left + rect.width / 2,
          top: rect.top + rect.height / 2,
          bottom: window.innerHeight - (rect.top + rect.height / 2),
        };
      }
      this.collapsed = true;
      this.debug.state('Collapsed DevBar (double-click)');
      this.render();
    };

    // Main row - wrapping controlled by CSS media query
    const mainRow = document.createElement('div');
    mainRow.className = 'devbar-main';
    Object.assign(mainRow.style, {
      display: 'flex',
      alignItems: 'center',
      alignContent: 'flex-start',
      justifyContent: 'flex-start',
      gap: '0.5rem',
      padding: '0.5rem 0.75rem',
      minWidth: '0',
      boxSizing: 'border-box',
      fontFamily: FONT_MONO,
      fontSize: '0.6875rem',
      lineHeight: '1rem',
    });

    // Connection indicator (click to collapse)
    const connIndicator = document.createElement('span');
    connIndicator.className = this.tooltipClass('left', 'devbar-clickable');
    connIndicator.setAttribute(
      'data-tooltip',
      this.sweetlinkConnected
        ? 'Sweetlink connected (click to minimize)'
        : 'Sweetlink disconnected (click to minimize)'
    );
    Object.assign(connIndicator.style, {
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      backgroundColor: 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      flexShrink: '0',
    });
    connIndicator.onclick = (e) => {
      e.stopPropagation();
      // Capture dot position before collapsing (connDot is the inner 6px dot)
      const rect = connIndicator.getBoundingClientRect();
      this.lastDotPosition = {
        left: rect.left + rect.width / 2,
        top: rect.top + rect.height / 2,
        bottom: window.innerHeight - (rect.top + rect.height / 2),
      };
      this.collapsed = true;
      this.debug.state('Collapsed DevBar (connection dot click)');
      this.render();
    };

    const connDot = document.createElement('span');
    Object.assign(connDot.style, {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      backgroundColor: this.sweetlinkConnected ? COLORS.primary : COLORS.textMuted,
      boxShadow: this.sweetlinkConnected ? `0 0 6px ${COLORS.primary}` : 'none',
      transition: 'all 300ms',
    });
    connIndicator.appendChild(connDot);

    // Status row wrapper - keeps connection dot, info, and badges together
    const statusRow = document.createElement('div');
    statusRow.className = 'devbar-status';
    Object.assign(statusRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      flexWrap: 'nowrap',
      flexShrink: '0',
    });
    statusRow.appendChild(connIndicator);

    // Info section
    const infoSection = document.createElement('div');
    infoSection.className = 'devbar-info';
    Object.assign(infoSection.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      flexShrink: '1',
      minWidth: '0',
      overflow: 'visible',
    });

    // Breakpoint info
    if (showMetrics.breakpoint && this.breakpointInfo) {
      const bp = this.breakpointInfo.tailwindBreakpoint as keyof typeof TAILWIND_BREAKPOINTS;
      const breakpointData = TAILWIND_BREAKPOINTS[bp];

      const bpSpan = document.createElement('span');
      bpSpan.className = this.tooltipClass('left', 'devbar-item');
      Object.assign(bpSpan.style, { opacity: '0.9', cursor: 'default' });
      bpSpan.setAttribute(
        'data-tooltip',
        `Tailwind Breakpoint: ${bp}\n${breakpointData?.label || ''}\n\nViewport: ${this.breakpointInfo.dimensions}\n\nBreakpoints:\nbase: <640px | sm: >=640px\nmd: >=768px | lg: >=1024px\nxl: >=1280px | 2xl: >=1536px`
      );

      let bpText: string = bp;
      if (bp !== 'base') {
        bpText =
          bp === 'sm'
            ? `${bp} - ${this.breakpointInfo.dimensions.split('x')[0]}`
            : `${bp} - ${this.breakpointInfo.dimensions}`;
      }
      bpSpan.textContent = bpText;
      infoSection.appendChild(bpSpan);
    }

    // Performance stats
    if (this.perfStats) {
      const addSeparator = () => {
        const sep = document.createElement('span');
        sep.style.opacity = '0.4';
        sep.textContent = '|';
        infoSection.appendChild(sep);
      };

      if (showMetrics.fcp) {
        addSeparator();
        const fcpSpan = document.createElement('span');
        fcpSpan.className = 'devbar-item';
        Object.assign(fcpSpan.style, { opacity: '0.85', cursor: 'default' });
        fcpSpan.textContent = `FCP ${this.perfStats.fcp}`;
        this.attachMetricTooltip(
          fcpSpan,
          'First Contentful Paint (FCP): Time until first text/image renders.',
          { good: '<1.8s', needsWork: '1.8-3s', poor: '>3s' }
        );
        infoSection.appendChild(fcpSpan);
      }

      if (showMetrics.lcp) {
        addSeparator();
        const lcpSpan = document.createElement('span');
        lcpSpan.className = 'devbar-item';
        Object.assign(lcpSpan.style, { opacity: '0.85', cursor: 'default' });
        lcpSpan.textContent = `LCP ${this.perfStats.lcp}`;
        this.attachMetricTooltip(
          lcpSpan,
          'Largest Contentful Paint (LCP): Time until largest visible element renders.',
          { good: '<2.5s', needsWork: '2.5-4s', poor: '>4s' }
        );
        infoSection.appendChild(lcpSpan);
      }

      if (showMetrics.cls) {
        addSeparator();
        const clsSpan = document.createElement('span');
        clsSpan.className = 'devbar-item';
        Object.assign(clsSpan.style, { opacity: '0.85', cursor: 'default' });
        clsSpan.textContent = `CLS ${this.perfStats.cls}`;
        this.attachMetricTooltip(
          clsSpan,
          'Cumulative Layout Shift (CLS): Visual stability score. Higher values mean more unexpected layout shifts.',
          { good: '<0.1', needsWork: '0.1-0.25', poor: '>0.25' }
        );
        infoSection.appendChild(clsSpan);
      }

      if (showMetrics.inp) {
        addSeparator();
        const inpSpan = document.createElement('span');
        inpSpan.className = 'devbar-item';
        Object.assign(inpSpan.style, { opacity: '0.85', cursor: 'default' });
        inpSpan.textContent = `INP ${this.perfStats.inp}`;
        this.attachMetricTooltip(
          inpSpan,
          'Interaction to Next Paint (INP): Responsiveness to user input. Measures the longest interaction delay.',
          { good: '<200ms', needsWork: '200-500ms', poor: '>500ms' }
        );
        infoSection.appendChild(inpSpan);
      }

      if (showMetrics.pageSize) {
        addSeparator();
        const sizeSpan = document.createElement('span');
        sizeSpan.className = this.tooltipClass('left', 'devbar-item');
        Object.assign(sizeSpan.style, { opacity: '0.7', cursor: 'default' });
        sizeSpan.setAttribute(
          'data-tooltip',
          'Total page size (compressed/transferred).\nIncludes HTML, CSS, JS, images, and other resources.'
        );
        sizeSpan.textContent = this.perfStats.totalSize;
        infoSection.appendChild(sizeSpan);
      }
    }

    statusRow.appendChild(infoSection);

    // Console badges - add to status row so they stay with info
    if (showConsoleBadges) {
      if (errorCount > 0) {
        statusRow.appendChild(this.createConsoleBadge('error', errorCount, BUTTON_COLORS.error));
      }
      if (warningCount > 0) {
        statusRow.appendChild(this.createConsoleBadge('warn', warningCount, BUTTON_COLORS.warning));
      }
    }

    mainRow.appendChild(statusRow);

    // Action buttons - always render container for consistent height
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'devbar-actions';
    if (showScreenshot) {
      actionsContainer.appendChild(this.createScreenshotButton(accentColor));
    }
    actionsContainer.appendChild(this.createAIReviewButton());
    actionsContainer.appendChild(this.createOutlineButton());
    actionsContainer.appendChild(this.createSchemaButton());
    actionsContainer.appendChild(this.createSettingsButton());
    actionsContainer.appendChild(this.createCompactToggleButton());
    mainRow.appendChild(actionsContainer);

    wrapper.appendChild(mainRow);

    // Render custom controls row if there are any
    if (GlobalDevBar.customControls.length > 0) {
      const customRow = document.createElement('div');
      Object.assign(customRow.style, {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0 0.75rem 0.5rem 0.75rem',
        borderTop: `1px solid ${accentColor}30`,
        marginTop: '0',
        paddingTop: '0.5rem',
        fontFamily: FONT_MONO,
        fontSize: '0.6875rem',
      });

      GlobalDevBar.customControls.forEach((control) => {
        const btn = document.createElement('button');
        btn.type = 'button';

        const color = control.variant === 'warning' ? BUTTON_COLORS.warning : accentColor;
        const isActive = control.active ?? false;
        const isDisabled = control.disabled ?? false;

        Object.assign(btn.style, {
          padding: '4px 10px',
          backgroundColor: isActive ? `${color}33` : 'transparent',
          border: `1px solid ${isActive ? color : `${color}60`}`,
          borderRadius: '6px',
          color: isActive ? color : `${color}99`,
          fontSize: '0.625rem',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? '0.5' : '1',
          transition: 'all 150ms',
        });

        btn.textContent = control.label;
        btn.disabled = isDisabled;

        if (!isDisabled) {
          btn.onmouseenter = () => {
            btn.style.backgroundColor = `${color}20`;
            btn.style.borderColor = color;
            btn.style.color = color;
          };
          btn.onmouseleave = () => {
            btn.style.backgroundColor = isActive ? `${color}33` : 'transparent';
            btn.style.borderColor = isActive ? color : `${color}60`;
            btn.style.color = isActive ? color : `${color}99`;
          };
          btn.onclick = () => control.onClick();
        }

        customRow.appendChild(btn);
      });

      wrapper.appendChild(customRow);
    }
  }

  /**
   * Attach an HTML tooltip with colored threshold labels to a metric element
   */
  private attachMetricTooltip(
    element: HTMLElement,
    description: string,
    thresholds: { good: string; needsWork: string; poor: string }
  ): void {
    let tooltipEl: HTMLDivElement | null = null;

    element.onmouseenter = () => {
      tooltipEl = document.createElement('div');
      tooltipEl.setAttribute('data-devbar', 'true');

      Object.assign(tooltipEl.style, {
        position: 'fixed',
        zIndex: '10004',
        backgroundColor: 'rgba(17, 24, 39, 0.98)',
        border: `1px solid ${COLORS.border}`,
        borderRadius: '6px',
        padding: '10px 12px',
        fontSize: '0.6875rem',
        fontFamily: FONT_MONO,
        maxWidth: '280px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        pointerEvents: 'none',
      });

      // Description
      const descEl = document.createElement('div');
      Object.assign(descEl.style, {
        color: COLORS.text,
        marginBottom: '10px',
        lineHeight: '1.4',
      });
      descEl.textContent = description;
      tooltipEl.appendChild(descEl);

      // Thresholds header
      const thresholdsHeader = document.createElement('div');
      Object.assign(thresholdsHeader.style, {
        color: COLORS.textMuted,
        fontSize: '0.625rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '6px',
      });
      thresholdsHeader.textContent = 'Thresholds';
      tooltipEl.appendChild(thresholdsHeader);

      // Thresholds with colors
      const thresholdsEl = document.createElement('div');
      Object.assign(thresholdsEl.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      });

      const addThreshold = (label: string, value: string, color: string) => {
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '8px' });

        const dot = document.createElement('span');
        Object.assign(dot.style, {
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: color,
          flexShrink: '0',
        });
        row.appendChild(dot);

        const labelSpan = document.createElement('span');
        Object.assign(labelSpan.style, {
          color,
          fontWeight: '500',
          minWidth: '70px',
        });
        labelSpan.textContent = label;
        row.appendChild(labelSpan);

        const valueSpan = document.createElement('span');
        Object.assign(valueSpan.style, { color: COLORS.textMuted });
        valueSpan.textContent = value;
        row.appendChild(valueSpan);

        thresholdsEl.appendChild(row);
      };

      addThreshold('Good', thresholds.good, COLORS.primary);
      addThreshold('Needs work', thresholds.needsWork, COLORS.warning);
      addThreshold('Poor', thresholds.poor, COLORS.error);

      tooltipEl.appendChild(thresholdsEl);

      // Position tooltip above element
      const rect = element.getBoundingClientRect();
      tooltipEl.style.left = `${rect.left}px`;
      tooltipEl.style.bottom = `${window.innerHeight - rect.top + 8}px`;

      document.body.appendChild(tooltipEl);

      // Adjust if off-screen
      const tooltipRect = tooltipEl.getBoundingClientRect();
      if (tooltipRect.right > window.innerWidth - 10) {
        tooltipEl.style.left = `${window.innerWidth - tooltipRect.width - 10}px`;
      }
      if (tooltipRect.left < 10) {
        tooltipEl.style.left = '10px';
      }
    };

    element.onmouseleave = () => {
      if (tooltipEl) {
        tooltipEl.remove();
        tooltipEl = null;
      }
    };
  }

  /**
   * Create a console badge for error/warning counts
   */
  private createConsoleBadge(
    type: 'error' | 'warn',
    count: number,
    color: string
  ): HTMLSpanElement {
    const label = type === 'error' ? 'error' : 'warning';
    const isActive = this.consoleFilter === type;

    const badge = document.createElement('span');
    badge.className = this.tooltipClass('right', 'devbar-badge');
    badge.setAttribute(
      'data-tooltip',
      `${count} console ${label}${count === 1 ? '' : 's'} (click to view)`
    );
    Object.assign(badge.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: '18px',
      height: '18px',
      padding: '0 5px',
      borderRadius: '9999px',
      backgroundColor: isActive ? color : `${color}E6`,
      color: '#fff',
      fontSize: '0.625rem',
      fontWeight: '600',
      cursor: 'pointer',
      boxShadow: isActive ? `0 0 8px ${color}CC` : 'none',
    });
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.onclick = () => {
      this.consoleFilter = this.consoleFilter === type ? null : type;
      this.showOutlineModal = false;
      this.showSchemaModal = false;
      this.render();
    };

    return badge;
  }

  private createScreenshotButton(accentColor: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = this.tooltipClass('right');

    const hasSuccessState = this.copiedToClipboard || this.copiedPath || this.lastScreenshot;

    const tooltip = this.getScreenshotTooltip();
    btn.setAttribute('data-tooltip', tooltip);

    Object.assign(btn.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '22px',
      height: '22px',
      minWidth: '22px',
      minHeight: '22px',
      flexShrink: '0',
      borderRadius: '50%',
      border: '1px solid',
      borderColor: hasSuccessState ? accentColor : `${accentColor}80`,
      backgroundColor: hasSuccessState ? `${accentColor}33` : 'transparent',
      color: hasSuccessState ? accentColor : `${accentColor}99`,
      cursor: !this.capturing ? 'pointer' : 'not-allowed',
      opacity: '1',
      transition: 'all 150ms',
    });

    btn.disabled = this.capturing;
    btn.onclick = (e) => {
      // If we have a saved screenshot path, clicking copies the path
      if (this.lastScreenshot && !e.shiftKey) {
        this.copyPathToClipboard(this.lastScreenshot);
      } else {
        this.handleScreenshot(e.shiftKey);
      }
    };

    // Button content
    if (this.copiedToClipboard || this.copiedPath || this.lastScreenshot) {
      btn.textContent = '✓';
      btn.style.fontSize = '0.6rem';
    } else if (this.capturing) {
      btn.textContent = '...';
      btn.style.fontSize = '0.5rem';
    } else {
      // Camera icon SVG
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '12');
      svg.setAttribute('height', '12');
      svg.setAttribute('viewBox', '0 0 50.8 50.8');
      svg.style.stroke = 'currentColor';
      svg.style.fill = 'none';

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('stroke-linecap', 'round');
      g.setAttribute('stroke-linejoin', 'round');
      g.setAttribute('stroke-width', '4');

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute(
        'd',
        'M19.844 7.938H7.938v11.905m0 11.113v11.906h11.905m23.019-11.906v11.906H30.956m11.906-23.018V7.938H30.956'
      );

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '25.4');
      circle.setAttribute('cy', '25.4');
      circle.setAttribute('r', '8.731');

      g.appendChild(path);
      g.appendChild(circle);
      svg.appendChild(g);
      btn.appendChild(svg);
    }

    return btn;
  }

  /**
   * Get the tooltip text for the screenshot button based on current state
   */
  private getScreenshotTooltip(): string {
    if (this.copiedToClipboard) {
      return 'Copied to clipboard!';
    }
    if (this.copiedPath) {
      return 'Path copied to clipboard!';
    }
    if (this.lastScreenshot) {
      return `Screenshot saved!\n${this.lastScreenshot}\n\nClick to copy path`;
    }

    const baseTooltip = `Screenshot\n\nClick: Save to file\nShift+Click: Copy to clipboard\n\nKeyboard:\nCmd/Ctrl+Shift+S: Save\nCmd/Ctrl+Shift+C: Copy`;
    return this.sweetlinkConnected
      ? baseTooltip
      : `${baseTooltip}\n\nWarning: Sweetlink not connected`;
  }

  /**
   * Get the tooltip text for the AI review button based on current state
   */
  private getAIReviewTooltip(): string {
    if (this.designReviewInProgress) {
      return 'AI Design Review in progress...';
    }
    if (this.designReviewError) {
      return `Design review failed:\n${this.designReviewError}`;
    }
    if (this.lastDesignReview) {
      return `Design review saved to:\n${this.lastDesignReview}`;
    }

    const baseTooltip = `AI Design Review\n\nCaptures screenshot and sends to\nClaude for design analysis.\n\nRequires ANTHROPIC_API_KEY.`;
    return this.sweetlinkConnected
      ? baseTooltip
      : `${baseTooltip}\n\nWarning: Sweetlink not connected`;
  }

  private createAIReviewButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = this.tooltipClass('right');

    const tooltip = this.getAIReviewTooltip();
    btn.setAttribute('data-tooltip', tooltip);

    const hasError = !!this.designReviewError;
    const isActive = this.designReviewInProgress || !!this.lastDesignReview || hasError;
    const isDisabled = this.designReviewInProgress || !this.sweetlinkConnected;

    // Use error color (red) when there's an error, otherwise normal review color
    const buttonColor = hasError ? '#ef4444' : BUTTON_COLORS.review;
    Object.assign(btn.style, getButtonStyles(buttonColor, isActive, isDisabled));
    if (!this.sweetlinkConnected) btn.style.opacity = '0.5';

    btn.disabled = isDisabled;
    btn.onclick = () => this.showDesignReviewConfirmation();

    if (this.designReviewInProgress) {
      btn.textContent = '~';
      btn.style.fontSize = '0.5rem';
      btn.style.animation = 'pulse 1s infinite';
    } else if (this.designReviewError) {
      // Show 'x' for error state
      btn.textContent = '×';
      btn.style.fontSize = '0.875rem';
      btn.style.fontWeight = 'bold';
    } else if (this.lastDesignReview) {
      btn.textContent = 'v';
      btn.style.fontSize = '0.5rem';
    } else {
      btn.appendChild(
        createSvgIcon(
          'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z',
          { fill: true }
        )
      );
    }

    return btn;
  }

  private createOutlineButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = this.tooltipClass('right');

    const tooltip = this.lastOutline
      ? `Outline saved to:\n${this.lastOutline}`
      : `Document Outline\n\nView page heading structure and\nsave as markdown.`;
    btn.setAttribute('data-tooltip', tooltip);

    const isActive = this.showOutlineModal || !!this.lastOutline;
    Object.assign(btn.style, getButtonStyles(BUTTON_COLORS.outline, isActive, false));
    btn.onclick = () => this.handleDocumentOutline();

    if (this.lastOutline) {
      btn.textContent = 'v';
      btn.style.fontSize = '0.5rem';
    } else {
      btn.appendChild(
        createSvgIcon('M3 4h18v2H3V4zm0 7h12v2H3v-2zm0 7h18v2H3v-2z', { fill: true })
      );
    }

    return btn;
  }

  private createSchemaButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = this.tooltipClass('right');

    const tooltip = this.lastSchema
      ? `Schema saved to:\n${this.lastSchema}`
      : `Page Schema\n\nView JSON-LD, Open Graph, and\nother structured data.`;
    btn.setAttribute('data-tooltip', tooltip);

    const isActive = this.showSchemaModal || !!this.lastSchema;
    Object.assign(btn.style, getButtonStyles(BUTTON_COLORS.schema, isActive, false));
    btn.onclick = () => this.handlePageSchema();

    if (this.lastSchema) {
      btn.textContent = 'v';
      btn.style.fontSize = '0.5rem';
    } else {
      btn.appendChild(
        createSvgIcon(
          'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
          { fill: true }
        )
      );
    }

    return btn;
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

// Re-export console capture for external use
export { earlyConsoleCapture };
