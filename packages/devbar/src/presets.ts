/**
 * devbar Configuration Presets
 *
 * Pre-configured options for common devbar use cases.
 */

import { type GlobalDevBar, initGlobalDevBar } from './GlobalDevBar.js';
import type { GlobalDevBarOptions } from './types.js';

// ============================================================================
// Preset Configurations
// ============================================================================

/**
 * Minimal preset - shows only essential features
 * Good for production debugging with minimal visual footprint
 */
export const PRESET_MINIMAL: GlobalDevBarOptions = {
  showMetrics: {
    breakpoint: false,
    fcp: false,
    lcp: false,
    cls: false,
    inp: false,
    pageSize: false,
  },
  showScreenshot: false,
  showConsoleBadges: true,
  showTooltips: false,
};

/**
 * Full preset - shows all features
 * Good for comprehensive development monitoring
 */
export const PRESET_FULL: GlobalDevBarOptions = {
  showMetrics: {
    breakpoint: true,
    fcp: true,
    lcp: true,
    cls: true,
    inp: true,
    pageSize: true,
  },
  showScreenshot: true,
  showConsoleBadges: true,
  showTooltips: true,
};

/**
 * Performance preset - focuses on Core Web Vitals
 * Good for performance optimization work
 */
export const PRESET_PERFORMANCE: GlobalDevBarOptions = {
  showMetrics: {
    breakpoint: false,
    fcp: true,
    lcp: true,
    cls: true,
    inp: true,
    pageSize: true,
  },
  showScreenshot: false,
  showConsoleBadges: false,
  showTooltips: true,
};

/**
 * Responsive preset - focuses on responsive design
 * Good for layout and breakpoint work
 */
export const PRESET_RESPONSIVE: GlobalDevBarOptions = {
  showMetrics: {
    breakpoint: true,
    fcp: false,
    lcp: false,
    cls: false,
    inp: false,
    pageSize: false,
  },
  showScreenshot: true,
  showConsoleBadges: false,
  showTooltips: true,
};

/**
 * Debug preset - full features with debug logging
 * Good for troubleshooting devbar itself
 */
export const PRESET_DEBUG: GlobalDevBarOptions = {
  showMetrics: {
    breakpoint: true,
    fcp: true,
    lcp: true,
    cls: true,
    inp: true,
    pageSize: true,
  },
  showScreenshot: true,
  showConsoleBadges: true,
  showTooltips: true,
  debug: true,
};

// ============================================================================
// Convenience Initialization Functions
// ============================================================================

/**
 * Initialize devbar with minimal preset
 * @param options Additional options to merge with preset
 */
export function initMinimal(options?: Partial<GlobalDevBarOptions>): GlobalDevBar {
  return initGlobalDevBar({ ...PRESET_MINIMAL, ...options });
}

/**
 * Initialize devbar with full preset
 * @param options Additional options to merge with preset
 */
export function initFull(options?: Partial<GlobalDevBarOptions>): GlobalDevBar {
  return initGlobalDevBar({ ...PRESET_FULL, ...options });
}

/**
 * Initialize devbar with performance preset
 * @param options Additional options to merge with preset
 */
export function initPerformance(options?: Partial<GlobalDevBarOptions>): GlobalDevBar {
  return initGlobalDevBar({ ...PRESET_PERFORMANCE, ...options });
}

/**
 * Initialize devbar with responsive preset
 * @param options Additional options to merge with preset
 */
export function initResponsive(options?: Partial<GlobalDevBarOptions>): GlobalDevBar {
  return initGlobalDevBar({ ...PRESET_RESPONSIVE, ...options });
}

/**
 * Initialize devbar with debug preset
 * @param options Additional options to merge with preset
 */
export function initDebug(options?: Partial<GlobalDevBarOptions>): GlobalDevBar {
  return initGlobalDevBar({ ...PRESET_DEBUG, ...options });
}
