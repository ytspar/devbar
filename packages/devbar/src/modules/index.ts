/**
 * Module exports for GlobalDevBar.
 *
 * Each module contains functions extracted from the monolithic GlobalDevBar class.
 * Functions receive DevBarState (or specific parameters) rather than using `this`.
 */

export type { DevBarState, PositionStyle } from './types.js';

export { setupKeyboardShortcuts } from './keyboard.js';
export {
  getResponsiveMetricVisibility,
  setupBreakpointDetection,
  setupPerformanceMonitoring,
} from './performance.js';
export { render } from './rendering.js';
export {
  calculateCostEstimate,
  closeDesignReviewConfirm,
  copyPathToClipboard,
  handleDesignReview,
  handleDocumentOutline,
  handlePageSchema,
  handleSaveOutline,
  handleSaveSchema,
  handleScreenshot,
  proceedWithDesignReview,
  showDesignReviewConfirmation,
} from './screenshot.js';
export {
  loadCompactMode,
  setThemeMode,
  setupTheme,
} from './theme.js';
export {
  clearAllTooltips,
} from './tooltips.js';
export {
  connectWebSocket,
  handleNotification,
} from './websocket.js';
