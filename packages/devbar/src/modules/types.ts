/**
 * Shared types for GlobalDevBar modules.
 *
 * Defines the DevBarState interface that module functions receive
 * instead of importing the GlobalDevBar class directly, avoiding
 * circular dependencies.
 */

import type { DebugLogger } from '../debug.js';
import type { SettingsManager, DevBarSettings } from '../settings.js';
import type {
  ConsoleLog,
  GlobalDevBarOptions,
  SweetlinkCommand,
  ThemeMode,
} from '../types.js';

/** CSS positioning properties for devbar placement */
export type PositionStyle = {
  bottom?: string;
  left?: string;
  top?: string;
  right?: string;
  transform?: string;
};

/**
 * The state interface exposed to module functions.
 * This represents the subset of GlobalDevBar's private state
 * that modules need to read and write.
 */
export interface DevBarState {
  // Options
  options: Required<Omit<GlobalDevBarOptions, 'sizeOverrides' | 'debug'>> &
    Pick<GlobalDevBarOptions, 'sizeOverrides'>;
  debug: DebugLogger;

  // DOM
  container: HTMLDivElement | null;
  overlayElement: HTMLDivElement | null;

  // WebSocket
  ws: WebSocket | null;
  sweetlinkConnected: boolean;
  wsVerified: boolean;
  serverProjectDir: string | null;
  reconnectAttempts: number;
  readonly currentAppPort: number;
  readonly baseWsPort: number;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  destroyed: boolean;

  // Console
  consoleLogs: ConsoleLog[];
  consoleFilter: 'error' | 'warn' | 'info' | null;

  // Screenshot / Design Review
  capturing: boolean;
  copiedToClipboard: boolean;
  copiedPath: boolean;
  lastScreenshot: string | null;
  designReviewInProgress: boolean;
  lastDesignReview: string | null;
  designReviewError: string | null;
  showDesignReviewConfirm: boolean;
  apiKeyStatus: {
    configured: boolean;
    model?: string;
    pricing?: { input: number; output: number };
  } | null;

  // Outline / Schema
  lastOutline: string | null;
  lastSchema: string | null;
  savingOutline: boolean;
  savingSchema: boolean;
  showOutlineModal: boolean;
  showSchemaModal: boolean;

  // Accessibility
  showA11yModal: boolean;
  a11yLoading: boolean;
  lastA11yAudit: string | null;
  savingA11yAudit: boolean;
  a11yTimeout: ReturnType<typeof setTimeout> | null;

  // Console Logs save
  savingConsoleLogs: boolean;
  lastConsoleLogs: string | null;
  consoleLogsTimeout: ReturnType<typeof setTimeout> | undefined;

  // Timeouts
  screenshotTimeout: ReturnType<typeof setTimeout> | null;
  copiedPathTimeout: ReturnType<typeof setTimeout> | null;
  designReviewTimeout: ReturnType<typeof setTimeout> | null;
  designReviewErrorTimeout: ReturnType<typeof setTimeout> | null;
  outlineTimeout: ReturnType<typeof setTimeout> | null;
  schemaTimeout: ReturnType<typeof setTimeout> | null;

  // Performance / Breakpoints
  breakpointInfo: { tailwindBreakpoint: string; dimensions: string } | null;
  perfStats: {
    fcp: string;
    lcp: string;
    cls: string;
    inp: string;
    totalSize: string;
  } | null;
  lcpValue: number | null;
  clsValue: number;
  inpValue: number;
  resizeHandler: (() => void) | null;
  fcpObserver: PerformanceObserver | null;
  lcpObserver: PerformanceObserver | null;
  clsObserver: PerformanceObserver | null;
  inpObserver: PerformanceObserver | null;

  // Theme
  themeMode: ThemeMode;
  themeMediaQuery: MediaQueryList | null;
  themeMediaHandler: ((e: MediaQueryListEvent) => void) | null;

  // UI State
  collapsed: boolean;
  compactMode: boolean;
  showSettingsPopover: boolean;
  lastDotPosition: { left: number; top: number; bottom: number } | null;
  activeTooltips: Set<HTMLDivElement>;

  // Keyboard
  keydownHandler: ((e: KeyboardEvent) => void) | null;

  // Settings
  settingsManager: SettingsManager;

  // Methods that modules may call back into
  render: () => void;
  getLogCounts: () => { errorCount: number; warningCount: number; infoCount: number };
  resetPositionStyles: (element: HTMLElement) => void;
  createCollapsedBadge: (count: number, bgColor: string, rightPos: string) => HTMLSpanElement;
  handleScreenshot: (copyToClipboard: boolean) => Promise<void>;
  toggleCompactMode: () => void;
  connectWebSocket: (port?: number) => void;
  handleNotification: (
    type: 'screenshot' | 'designReview' | 'outline' | 'schema' | 'consoleLogs' | 'a11y',
    path: string | undefined,
    durationMs: number
  ) => void;
  applySettings: (settings: DevBarSettings) => void;
  clearConsoleLogs: () => void;
}
