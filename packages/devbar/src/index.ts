// devbar - Development toolbar and utilities
// Pure vanilla JavaScript - no framework dependencies

// Accessibility audit utilities
export {
  type A11yState,
  type AxeResult,
  type AxeViolation,
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
} from './accessibility.js';
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
  STORAGE_KEYS,
  setStoredThemeMode,
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

// Lazy loading utilities
export { getHtml2Canvas, isHtml2CanvasLoaded, preloadHtml2Canvas } from './lazy/index.js';
// Network monitoring utilities
export {
  formatBytes as formatNetworkBytes,
  formatDuration,
  getInitiatorColor,
  type NetworkEntry,
  NetworkMonitor,
  type NetworkState,
} from './network.js';
// Re-export outline/schema functions
export { extractDocumentOutline, outlineToMarkdown } from './outline.js';
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
export { extractPageSchema, schemaToMarkdown } from './schema.js';
// Settings management
export {
  ACCENT_COLOR_PRESETS,
  DEFAULT_SETTINGS,
  type DevBarPosition,
  type DevBarSettings,
  getSettingsManager,
  type MetricsVisibility,
  resolveSaveLocation,
  type SaveLocation,
  type SettingsChangeCallback,
} from './settings.js';

// Storage inspection utilities
export {
  beautifyJson,
  type CookieItem,
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
  type StorageData,
  type StorageItem,
  setLocalStorageItem,
  setSessionStorageItem,
} from './storage.js';

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

// Logo exports for library branding
export {
  type CreateLogoOptions,
  createDevBarLogo,
  DEVBAR_LOGO_COLORS,
  DEVBAR_LOGO_PATHS,
  DEVBAR_LOGO_SHAPES,
  DEVBAR_LOGO_VIEWBOX,
  getDevBarLogoSvg,
} from './ui/icons.js';

// Re-export utilities for external use
export {
  canvasToDataUrl,
  copyCanvasToClipboard,
  delay,
  formatArg,
  formatArgs,
  prepareForCapture,
} from './utils.js';
