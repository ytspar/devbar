// DevBar - Development toolbar and utilities
// Pure vanilla JavaScript - no framework dependencies

// Re-export constants and theme utilities
export {
  BUTTON_COLORS,
  CATEGORY_COLORS,
  COLORS,
  DEVBAR_THEME,
  DEVBAR_THEME_LIGHT,
  type DevBarTheme,
  type DevBarThemeInput,
  FONT_MONO,
  generateBreakpointCSS,
  generateThemeCSSVars,
  getEffectiveTheme,
  getStoredThemeMode,
  getTheme,
  getThemeColors,
  injectThemeCSS,
  setStoredThemeMode,
  STORAGE_KEYS,
  TAILWIND_BREAKPOINTS,
  type TailwindBreakpoint,
  type ThemeColors,
} from './constants.js';

// Debug utilities
export { DebugLogger, normalizeDebugConfig } from './debug.js';

// Early console capture script for injection
export { EARLY_CONSOLE_CAPTURE_SCRIPT } from './earlyConsoleCapture.js';

// Main vanilla JS devbar
export {
  destroyGlobalDevBar,
  earlyConsoleCapture,
  GlobalDevBar,
  getGlobalDevBar,
  initGlobalDevBar,
} from './GlobalDevBar.js';

// Configuration presets
export {
  initDebug,
  initFull,
  initMinimal,
  initPerformance,
  initResponsive,
  PRESET_DEBUG,
  PRESET_FULL,
  PRESET_MINIMAL,
  PRESET_PERFORMANCE,
  PRESET_RESPONSIVE,
} from './presets.js';

// Lazy loading utilities
export { getHtml2Canvas, isHtml2CanvasLoaded, preloadHtml2Canvas } from './lazy/index.js';

// Re-export outline/schema functions
export { extractDocumentOutline, outlineToMarkdown } from './outline.js';
export { extractPageSchema, schemaToMarkdown } from './schema.js';

// Network monitoring utilities
export {
  formatBytes as formatNetworkBytes,
  formatDuration,
  getInitiatorColor,
  NetworkMonitor,
  type NetworkEntry,
  type NetworkState,
} from './network.js';

// Storage inspection utilities
export {
  beautifyJson,
  clearLocalStorage,
  clearSessionStorage,
  deleteCookie,
  deleteLocalStorageItem,
  deleteSessionStorageItem,
  formatStorageSummary,
  getCookies,
  getLocalStorage,
  getSessionStorage,
  getStorageData,
  setLocalStorageItem,
  setSessionStorageItem,
  type CookieItem,
  type StorageData,
  type StorageItem,
} from './storage.js';

// Accessibility audit utilities
export {
  clearA11yCache,
  formatViolation,
  getBadgeColor,
  getCachedResult,
  getImpactColor,
  getViolationCounts,
  groupViolationsByImpact,
  isAxeLoaded,
  preloadAxe,
  runA11yAudit,
  type A11yState,
  type AxeResult,
  type AxeViolation,
} from './accessibility.js';

// Re-export types
export type {
  ConsoleLog,
  DebugConfig,
  DevBarControl,
  GlobalDevBarOptions,
  OutlineNode,
  PageSchema,
  SweetlinkCommand,
  ThemeMode,
} from './types.js';

// Re-export utilities for external use
export {
  canvasToDataUrl,
  copyCanvasToClipboard,
  delay,
  formatArg,
  formatArgs,
  prepareForCapture,
} from './utils.js';
