/**
 * DevBar Constants
 *
 * Shared constants used by the DevBar components.
 */

// Re-export shared constants from sweetlink's browser modules to avoid pulling in Node.js-only code
export { MAX_CONSOLE_LOGS } from '@ytspar/sweetlink/browser/consoleCapture';
export { DEVBAR_SCREENSHOT_QUALITY } from '@ytspar/sweetlink/browser/screenshotUtils';

// ============================================================================
// Reconnection Settings
// ============================================================================

/** Maximum reconnection attempts before giving up */
export const MAX_RECONNECT_ATTEMPTS = 10;

/** Base delay for exponential backoff (ms) */
export const BASE_RECONNECT_DELAY_MS = 1000;

/** Maximum delay between reconnection attempts (ms) */
export const MAX_RECONNECT_DELAY_MS = 30000;

// ============================================================================
// WebSocket Settings
// ============================================================================

/** Default WebSocket port for Sweetlink connection */
export const WS_PORT = 9223;

// ============================================================================
// Notification Durations
// ============================================================================

/** Duration to show screenshot notification (ms) */
export const SCREENSHOT_NOTIFICATION_MS = 3000;

/** Duration to show clipboard notification (ms) */
export const CLIPBOARD_NOTIFICATION_MS = 2000;

/** Duration to show design review notification (ms) */
export const DESIGN_REVIEW_NOTIFICATION_MS = 5000;

// ============================================================================
// Screenshot Capture Settings
// ============================================================================

/** Delay after blur before capturing screenshot (ms) */
export const SCREENSHOT_BLUR_DELAY_MS = 50;

/** Scale factor for screenshots (0.75 = 75% of original) */
export const SCREENSHOT_SCALE = 0.75;

// ============================================================================
// Tailwind Breakpoints
// ============================================================================

/** Tailwind CSS breakpoint definitions */
export const TAILWIND_BREAKPOINTS = {
  base: { min: 0, label: 'Tailwind base: <640px' },
  sm: { min: 640, label: 'Tailwind sm: >=640px' },
  md: { min: 768, label: 'Tailwind md: >=768px' },
  lg: { min: 1024, label: 'Tailwind lg: >=1024px' },
  xl: { min: 1280, label: 'Tailwind xl: >=1280px' },
  '2xl': { min: 1536, label: 'Tailwind 2xl: >=1536px' },
} as const;

export type TailwindBreakpoint = keyof typeof TAILWIND_BREAKPOINTS;

// ============================================================================
// Base Color Palette (single source of truth)
// ============================================================================

/** Core color palette - all other color constants reference these */
const PALETTE = {
  emerald: '#10b981',
  emeraldHover: '#059669',
  emeraldGlow: 'rgba(16, 185, 129, 0.4)',
  red: '#ef4444',
  amber: '#f59e0b',
  blue: '#3b82f6',
  purple: '#a855f7',
  cyan: '#06b6d4',
  pink: '#ec4899',
  lime: '#84cc16',
  gray: '#6b7280',
} as const;

// ============================================================================
// Button Colors
// ============================================================================

/** Button colors for devbar toolbar buttons */
export const BUTTON_COLORS = {
  screenshot: PALETTE.emerald,
  review: PALETTE.purple,
  outline: PALETTE.cyan,
  schema: PALETTE.amber,
  error: PALETTE.red,
  warning: PALETTE.amber,
} as const;

/** Category colors for outline display */
export const CATEGORY_COLORS: Record<string, string> = {
  heading: PALETTE.emerald,
  sectioning: PALETTE.blue,
  landmark: PALETTE.purple,
  grouping: PALETTE.cyan,
  form: PALETTE.amber,
  table: PALETTE.pink,
  list: PALETTE.lime,
  other: PALETTE.gray,
};

// ============================================================================
// Storage Keys
// ============================================================================

/** LocalStorage keys for DevBar persistence */
export const STORAGE_KEYS = {
  /** Theme mode preference: 'dark' | 'light' | 'system' */
  themeMode: 'devbar-theme-mode',
  /** Compact mode preference: 'true' | 'false' */
  compactMode: 'devbar-compact-mode',
} as const;

// ============================================================================
// Design System Theme
// ============================================================================

/** Complete DevBar design system theme */
export const DEVBAR_THEME = {
  colors: {
    // Primary accent
    primary: PALETTE.emerald,
    primaryHover: PALETTE.emeraldHover,
    primaryGlow: PALETTE.emeraldGlow,

    // Semantic colors
    error: PALETTE.red,
    warning: PALETTE.amber,
    info: PALETTE.blue,

    // Extended palette
    purple: PALETTE.purple,
    cyan: PALETTE.cyan,
    pink: PALETTE.pink,
    lime: PALETTE.lime,

    // Backgrounds
    bg: '#0a0f1a',
    bgCard: 'rgba(17, 24, 39, 0.95)',
    bgElevated: 'rgba(17, 24, 39, 0.98)',
    bgInput: 'rgba(10, 15, 26, 0.8)',

    // Text
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: PALETTE.gray,

    // Borders
    border: 'rgba(16, 185, 129, 0.2)',
    borderSubtle: 'rgba(255, 255, 255, 0.05)',
  },

  fonts: {
    // Departure Mono - retro pixel terminal font (https://departuremono.com)
    // Falls back to system monospace if not loaded
    mono: "'Departure Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },

  // Typography scale (matches DevBar UI)
  typography: {
    // Font sizes
    sizeXs: '0.625rem', // 10px - badges, tiny labels
    sizeSm: '0.6875rem', // 11px - main devbar text
    sizeBase: '0.75rem', // 12px - buttons, tooltips
    sizeMd: '0.8125rem', // 13px - section headers
    sizeLg: '0.875rem', // 14px - descriptions
    sizeXl: '1rem', // 16px - modal titles
    size2xl: '1.5rem', // 24px - page titles

    // Line heights
    leadingTight: '1rem',
    leadingNormal: '1.5',
    leadingRelaxed: '1.6',

    // Font weights
    weightNormal: '400',
    weightMedium: '500',
    weightSemibold: '600',

    // Letter spacing
    trackingTight: '-0.02em',
    trackingNormal: '0',
    trackingWide: '0.05em',
    trackingWider: '0.1em',
  },

  radius: {
    sm: '4px',
    md: '6px',
    lg: '12px',
  },

  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
    md: '0 4px 12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(16, 185, 129, 0.1)',
    lg: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(16, 185, 129, 0.15)',
    glow: '0 0 20px rgba(16, 185, 129, 0.15)',
  },

  transitions: {
    fast: '150ms',
  },
} as const;

export type DevBarTheme = typeof DEVBAR_THEME;

/** Light theme variant - same structure, different colors */
export const DEVBAR_THEME_LIGHT = {
  colors: {
    // Primary accent (darker for light mode)
    primary: '#059669', // darker emerald
    primaryHover: '#047857',
    primaryGlow: 'rgba(5, 150, 105, 0.2)',

    // Semantic colors (same)
    error: PALETTE.red,
    warning: '#d97706', // darker amber
    info: '#2563eb', // darker blue

    // Extended palette (darker variants)
    purple: '#9333ea',
    cyan: '#0891b2',
    pink: '#db2777',
    lime: '#65a30d',

    // Backgrounds (light)
    bg: '#f8fafc',
    bgCard: 'rgba(255, 255, 255, 0.98)',
    bgElevated: 'rgba(255, 255, 255, 0.99)',
    bgInput: 'rgba(241, 245, 249, 0.9)',

    // Text (dark on light)
    text: '#1e293b',
    textSecondary: '#475569',
    textMuted: '#64748b',

    // Borders (green-tinted)
    border: 'rgba(5, 150, 105, 0.25)',
    borderSubtle: 'rgba(0, 0, 0, 0.06)',
  },

  // Other properties same as dark theme
  fonts: DEVBAR_THEME.fonts,
  typography: DEVBAR_THEME.typography,
  radius: DEVBAR_THEME.radius,

  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.08)',
    md: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(5, 150, 105, 0.1)',
    lg: '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(5, 150, 105, 0.12)',
    glow: '0 0 20px rgba(5, 150, 105, 0.1)',
  },

  transitions: DEVBAR_THEME.transitions,
} as const;

export type DevBarThemeLight = typeof DEVBAR_THEME_LIGHT;

// ============================================================================
// Shorthand Exports (for cleaner imports)
// ============================================================================

/** Shorthand for common colors */
export const COLORS = DEVBAR_THEME.colors;

/** Shorthand for font stack */
export const FONT_MONO = DEVBAR_THEME.fonts.mono;

/** Flexible input type for theme customization */
export type DevBarThemeInput = {
  colors: { [K in keyof DevBarTheme['colors']]: string };
  fonts: { [K in keyof DevBarTheme['fonts']]: string };
  typography: { [K in keyof DevBarTheme['typography']]: string };
  radius: { [K in keyof DevBarTheme['radius']]: string };
  shadows: { [K in keyof DevBarTheme['shadows']]: string };
  transitions: { [K in keyof DevBarTheme['transitions']]: string };
};

// ============================================================================
// Theme Mode Utilities
// ============================================================================

import type { ThemeMode } from './types.js';

/**
 * Get the stored theme mode preference
 */
export function getStoredThemeMode(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'system';
  const stored = localStorage.getItem(STORAGE_KEYS.themeMode);
  if (stored === 'dark' || stored === 'light' || stored === 'system') {
    return stored;
  }
  return 'system';
}

/**
 * Store the theme mode preference
 */
export function setStoredThemeMode(mode: ThemeMode): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.themeMode, mode);
}

/**
 * Get the effective theme (resolves 'system' to 'dark' or 'light')
 */
export function getEffectiveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

/** Union type for both theme color variants */
export type ThemeColors = DevBarTheme['colors'] | DevBarThemeLight['colors'];

/**
 * Get theme colors based on the current effective theme
 */
export function getThemeColors(mode: ThemeMode): ThemeColors {
  const effectiveTheme = getEffectiveTheme(mode);
  return effectiveTheme === 'light' ? DEVBAR_THEME_LIGHT.colors : DEVBAR_THEME.colors;
}

/**
 * Get full theme based on the current effective theme
 */
export function getTheme(mode: ThemeMode): typeof DEVBAR_THEME | typeof DEVBAR_THEME_LIGHT {
  const effectiveTheme = getEffectiveTheme(mode);
  return effectiveTheme === 'light' ? DEVBAR_THEME_LIGHT : DEVBAR_THEME;
}

/**
 * Generate CSS custom properties from the theme
 */
export function generateThemeCSSVars(theme: DevBarThemeInput = DEVBAR_THEME): string {
  return `
/* Departure Mono - retro pixel terminal font */
/* https://departuremono.com - SIL Open Font License */
@font-face {
  font-family: 'Departure Mono';
  src: url('/fonts/DepartureMono-Regular.woff2') format('woff2'),
       url('/fonts/DepartureMono-Regular.woff') format('woff'),
       url('https://github.com/rektdeckard/departure-mono/raw/main/fonts/DepartureMono-Regular.woff2') format('woff2');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

:root {
  /* Colors - Primary */
  --devbar-color-primary: ${theme.colors.primary};
  --devbar-color-primary-hover: ${theme.colors.primaryHover};
  --devbar-color-primary-glow: ${theme.colors.primaryGlow};

  /* Colors - Semantic */
  --devbar-color-error: ${theme.colors.error};
  --devbar-color-warning: ${theme.colors.warning};
  --devbar-color-info: ${theme.colors.info};

  /* Colors - Extended */
  --devbar-color-purple: ${theme.colors.purple};
  --devbar-color-cyan: ${theme.colors.cyan};
  --devbar-color-pink: ${theme.colors.pink};
  --devbar-color-lime: ${theme.colors.lime};

  /* Colors - Backgrounds */
  --devbar-color-bg: ${theme.colors.bg};
  --devbar-color-bg-card: ${theme.colors.bgCard};
  --devbar-color-bg-elevated: ${theme.colors.bgElevated};
  --devbar-color-bg-input: ${theme.colors.bgInput};

  /* Colors - Text */
  --devbar-color-text: ${theme.colors.text};
  --devbar-color-text-secondary: ${theme.colors.textSecondary};
  --devbar-color-text-muted: ${theme.colors.textMuted};

  /* Colors - Borders */
  --devbar-color-border: ${theme.colors.border};
  --devbar-color-border-subtle: ${theme.colors.borderSubtle};

  /* Typography - Font */
  --devbar-font-mono: ${theme.fonts.mono};

  /* Typography - Font Sizes */
  --devbar-text-xs: ${theme.typography.sizeXs};
  --devbar-text-sm: ${theme.typography.sizeSm};
  --devbar-text-base: ${theme.typography.sizeBase};
  --devbar-text-md: ${theme.typography.sizeMd};
  --devbar-text-lg: ${theme.typography.sizeLg};
  --devbar-text-xl: ${theme.typography.sizeXl};
  --devbar-text-2xl: ${theme.typography.size2xl};

  /* Typography - Line Heights */
  --devbar-leading-tight: ${theme.typography.leadingTight};
  --devbar-leading-normal: ${theme.typography.leadingNormal};
  --devbar-leading-relaxed: ${theme.typography.leadingRelaxed};

  /* Typography - Font Weights */
  --devbar-font-normal: ${theme.typography.weightNormal};
  --devbar-font-medium: ${theme.typography.weightMedium};
  --devbar-font-semibold: ${theme.typography.weightSemibold};

  /* Typography - Letter Spacing */
  --devbar-tracking-tight: ${theme.typography.trackingTight};
  --devbar-tracking-normal: ${theme.typography.trackingNormal};
  --devbar-tracking-wide: ${theme.typography.trackingWide};
  --devbar-tracking-wider: ${theme.typography.trackingWider};

  /* Radius */
  --devbar-radius-sm: ${theme.radius.sm};
  --devbar-radius-md: ${theme.radius.md};
  --devbar-radius-lg: ${theme.radius.lg};

  /* Shadows */
  --devbar-shadow-sm: ${theme.shadows.sm};
  --devbar-shadow-md: ${theme.shadows.md};
  --devbar-shadow-lg: ${theme.shadows.lg};
  --devbar-shadow-glow: ${theme.shadows.glow};

  /* Transitions */
  --devbar-transition-fast: ${theme.transitions.fast};
}
`.trim();
}

/**
 * Inject theme CSS variables into the document
 */
export function injectThemeCSS(theme: DevBarThemeInput = DEVBAR_THEME): void {
  if (typeof document === 'undefined') return;

  const styleId = 'devbar-theme-vars';
  let style = document.getElementById(styleId) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.appendChild(style);
  }

  style.textContent = generateThemeCSSVars(theme);
}

/**
 * Generate CSS for breakpoint media queries
 */
export function generateBreakpointCSS(
  selector: string,
  property: string,
  values: Record<TailwindBreakpoint, string>
): string {
  const breakpoints = Object.entries(TAILWIND_BREAKPOINTS) as [
    TailwindBreakpoint,
    { min: number },
  ][];

  return breakpoints
    .map(([bp, { min }]) => {
      const value = values[bp];
      if (!value) return '';

      if (bp === 'base') {
        return `${selector} { ${property}: ${value}; }`;
      }
      return `@media (min-width: ${min}px) { ${selector} { ${property}: ${value}; } }`;
    })
    .filter(Boolean)
    .join('\n');
}

// ============================================================================
// Button Styles
// ============================================================================

/** Base styles for toolbar action buttons */
export const ACTION_BUTTON_BASE_STYLES = {
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
  transition: 'all 150ms',
} as const;

// ============================================================================
// Modal Styles
// ============================================================================

/** Common modal overlay styles */
export const MODAL_OVERLAY_STYLES: Record<string, string> = {
  position: 'fixed',
  top: '0',
  left: '0',
  right: '0',
  bottom: '0',
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  zIndex: '10002',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/** Common modal box styles */
export const MODAL_BOX_BASE_STYLES: Record<string, string> = {
  backgroundColor: COLORS.bgElevated,
  borderRadius: '12px',
  width: '90%',
  maxWidth: '700px',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: FONT_MONO,
};

// ============================================================================
// CSS Styles
// ============================================================================

/** Tooltip and animation CSS styles */
export const TOOLTIP_STYLES = `
.devbar-tooltip {
  position: relative;
}
/* Invisible bridge to keep tooltip open when moving mouse to it */
.devbar-tooltip::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  height: 16px;
  pointer-events: none;
}
.devbar-tooltip:hover::before {
  pointer-events: auto;
}
/* Extend bridge for right-aligned tooltips (tooltip extends left) */
.devbar-tooltip-right::before {
  left: -400px;
  right: 0;
}
/* Extend bridge for left-aligned tooltips (tooltip extends right) */
.devbar-tooltip-left::before {
  left: 0;
  right: -400px;
}
.devbar-tooltip::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) scale(0.95);
  padding: 0.625rem 1rem;
  background: ${COLORS.bgElevated};
  color: ${COLORS.primary};
  font-family: ${FONT_MONO};
  font-size: 0.75rem;
  line-height: 1.5;
  border-radius: 6px;
  border: 1px solid ${COLORS.border};
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(16, 185, 129, 0.1);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  min-width: min(200px, calc(100vw - 32px));
  max-width: min(400px, calc(100vw - 32px));
  white-space: pre-wrap;
  z-index: 10001;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  will-change: opacity, transform;
  transition: opacity 150ms ease-out, transform 150ms ease-out, visibility 150ms;
  user-select: text;
  cursor: text;
}
.devbar-tooltip:hover::after {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) scale(1);
  pointer-events: auto;
}
.devbar-tooltip-left::after {
  left: 8px !important;
  right: auto !important;
  transform: translateX(0) scale(0.95) !important;
}
.devbar-tooltip-left:hover::after {
  transform: translateX(0) scale(1) !important;
}
.devbar-tooltip-right::after {
  left: auto !important;
  right: 8px !important;
  transform: translateX(0) scale(0.95) !important;
}
.devbar-tooltip-right:hover::after {
  transform: translateX(0) scale(1) !important;
}
.devbar-capturing .devbar-tooltip::after,
.devbar-capturing .devbar-tooltip:hover::after {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
}
.devbar-item {
  transition: opacity 150ms ease-out, color 150ms ease-out;
}
.devbar-item:hover {
  opacity: 1 !important;
  color: ${COLORS.primary};
}
.devbar-clickable {
  transition: transform 150ms ease-out, background-color 150ms ease-out, box-shadow 150ms ease-out;
}
.devbar-clickable:hover {
  transform: scale(1.1);
  background-color: rgba(16, 185, 129, 0.15);
  box-shadow: 0 0 8px ${COLORS.primaryGlow};
}
.devbar-badge {
  transition: transform 150ms ease-out, box-shadow 150ms ease-out;
}
.devbar-badge:hover {
  transform: scale(1.1);
  box-shadow: 0 0 8px currentColor;
}
.devbar-collapse {
  transition: transform 150ms ease-out, background-color 150ms ease-out, box-shadow 150ms ease-out, border-color 150ms ease-out;
}
.devbar-collapse:hover {
  transform: scale(1.08);
  background-color: rgba(16, 185, 129, 0.15);
  box-shadow: 0 0 12px ${COLORS.primaryGlow};
  border-color: ${COLORS.primary};
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
@keyframes devbar-collapse {
  0% { transform: scale(0.8); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
/* Main row - single row by default (SM, MD, LG, XL) */
.devbar-main {
  flex-wrap: nowrap;
}
/* Info section - truncates if needed to fit single row */
.devbar-info {
  white-space: nowrap;
}
.devbar-info > span {
  flex-shrink: 0;
}
/* Actions container - stays on same row by default */
.devbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-basis: auto;
  flex-shrink: 0;
}
/* BASE only (< 640px): fit content, centered horizontally */
@media (max-width: 639px) {
  /* Expanded state: center and constrain width */
  [data-devbar]:not(.devbar-collapse) {
    width: auto !important;
    min-width: auto !important;
    max-width: calc(100vw - 32px) !important;
    left: 50% !important;
    right: auto !important;
    transform: translateX(-50%) !important;
  }
  /* Collapsed state: JS handles positioning based on captured dot location */
  .devbar-main {
    flex-wrap: wrap;
    justify-content: center;
  }
  /* Keep status row (connection dot + info) on same line */
  .devbar-status {
    flex-wrap: nowrap !important;
    justify-content: center;
  }
  .devbar-info {
    justify-content: center;
    flex-wrap: nowrap;
    white-space: nowrap !important;
  }
  .devbar-actions {
    justify-content: space-evenly;
    margin-top: 0.25rem;
    flex-wrap: nowrap;
    width: 100%;
  }
  /* Constrain tooltips to viewport on mobile */
  .devbar-tooltip::after {
    left: auto !important;
    right: 0 !important;
    transform: translateX(0) scale(0.95) !important;
    max-width: calc(100vw - 24px) !important;
  }
  .devbar-tooltip:hover::after {
    transform: translateX(0) scale(1) !important;
  }
  .devbar-tooltip-left::after {
    left: 0 !important;
    right: auto !important;
  }
}
`;
