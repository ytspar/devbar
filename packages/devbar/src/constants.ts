/**
 * devbar Constants
 *
 * Shared constants used by the devbar components.
 */

import { DEPARTURE_MONO_WOFF2_BASE64 } from './font-data.js';
import type { ThemeMode } from './types.js';

// Re-export shared constants from sweetlink's browser modules to avoid pulling in Node.js-only code
export { MAX_CONSOLE_LOGS } from '@ytspar/sweetlink/browser/consoleCapture';

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

// Re-export port constants from sweetlink
export {
  DEFAULT_WS_PORT as WS_PORT,
  MAX_PORT_RETRIES,
  PORT_RETRY_DELAY_MS,
  WS_PORT_OFFSET,
} from '@ytspar/sweetlink/types';

/** Delay before restarting port scan from base after all ports fail (ms) */
export const PORT_SCAN_RESTART_DELAY_MS = 3000;

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
export const PALETTE = {
  emerald: '#10b981',
  emeraldHover: '#059669',
  emeraldGlow: 'rgba(16, 185, 129, 0.4)',
  emeraldDark: '#047857',
  red: '#ef4444',
  redDark: '#dc2626',
  orange: '#f97316',
  amber: '#f59e0b',
  amberDark: '#92400e',
  blue: '#3b82f6',
  blueDark: '#2563eb',
  purple: '#a855f7',
  cyan: '#06b6d4',
  pink: '#ec4899',
  lime: '#84cc16',
  gray: '#6b7280',
  white: '#ffffff',
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
  a11y: PALETTE.pink,
  ruler: PALETTE.lime,
  error: PALETTE.redDark,
  warning: PALETTE.amberDark,
  info: PALETTE.blueDark,
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

/** LocalStorage keys for devbar persistence */
export const STORAGE_KEYS = {
  /** Theme mode preference: 'dark' | 'light' | 'system' */
  themeMode: 'devbar-theme-mode',
  /** Compact mode preference: 'true' | 'false' */
  compactMode: 'devbar-compact-mode',
} as const;

// ============================================================================
// Design System Theme
// ============================================================================

/** Complete devbar design system theme */
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

  // Typography scale (matches devbar UI)
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
    dropSm: '0 4px 12px rgba(0, 0, 0, 0.4)',
    dropLg: '0 8px 32px rgba(0, 0, 0, 0.5)',
    dropToolbar: '0 4px 12px rgba(0, 0, 0, 0.3)',
    dropXl: '0 20px 60px rgba(0, 0, 0, 0.6)',
  },

  transitions: {
    fast: '150ms',
  },
} as const;

export type DevBarTheme = typeof DEVBAR_THEME;

/** Light theme variant - terminal aesthetic with light green tones */
export const DEVBAR_THEME_LIGHT = {
  colors: {
    // Primary accent (darker emerald for contrast)
    primary: '#047857', // darker emerald for better contrast
    primaryHover: '#065f46',
    primaryGlow: 'rgba(4, 120, 87, 0.25)',

    // Semantic colors (adjusted for light bg)
    error: '#dc2626',
    warning: '#d97706',
    info: '#2563eb',

    // Extended palette (darker for light mode)
    purple: '#7c3aed',
    cyan: '#0891b2',
    pink: '#db2777',
    lime: '#65a30d',

    // Backgrounds - terminal light green aesthetic
    bg: '#ecfdf5', // very light mint/green
    bgCard: 'rgba(255, 255, 255, 0.85)',
    bgElevated: 'rgba(255, 255, 255, 0.95)',
    bgInput: 'rgba(236, 253, 245, 0.9)', // light mint input

    // Text (dark on light)
    text: '#064e3b', // dark emerald text
    textSecondary: '#065f46',
    textMuted: '#047857',

    // Borders (emerald-tinted)
    border: 'rgba(4, 120, 87, 0.3)',
    borderSubtle: 'rgba(4, 120, 87, 0.1)',
  },

  // Other properties same as dark theme
  fonts: DEVBAR_THEME.fonts,
  typography: DEVBAR_THEME.typography,
  radius: DEVBAR_THEME.radius,

  shadows: {
    sm: '0 1px 2px rgba(4, 120, 87, 0.1)',
    md: '0 4px 12px rgba(4, 120, 87, 0.12), 0 0 0 1px rgba(4, 120, 87, 0.15)',
    lg: '0 8px 32px rgba(4, 120, 87, 0.15), 0 0 0 1px rgba(4, 120, 87, 0.2)',
    glow: '0 0 20px rgba(4, 120, 87, 0.15)',
    dropSm: '0 4px 12px rgba(0, 0, 0, 0.4)',
    dropLg: '0 8px 32px rgba(0, 0, 0, 0.5)',
    dropToolbar: '0 4px 12px rgba(0, 0, 0, 0.3)',
    dropXl: '0 20px 60px rgba(0, 0, 0, 0.6)',
  },

  transitions: DEVBAR_THEME.transitions,
} as const;

type DevBarThemeLight = typeof DEVBAR_THEME_LIGHT;

// ============================================================================
// Shorthand Exports (for cleaner imports)
// ============================================================================

/** Shorthand for font stack */
export const FONT_MONO = DEVBAR_THEME.fonts.mono;

/**
 * CSS variable references for dynamic theming.
 * Use these instead of COLORS for inline styles that should respond to theme changes.
 */
export const CSS_COLORS = {
  // Primary accent
  primary: 'var(--devbar-color-primary)',
  primaryHover: 'var(--devbar-color-primary-hover)',
  primaryGlow: 'var(--devbar-color-primary-glow)',

  // Semantic colors
  error: 'var(--devbar-color-error)',
  warning: 'var(--devbar-color-warning)',
  info: 'var(--devbar-color-info)',

  // Extended palette
  purple: 'var(--devbar-color-purple)',
  cyan: 'var(--devbar-color-cyan)',
  pink: 'var(--devbar-color-pink)',
  lime: 'var(--devbar-color-lime)',

  // Backgrounds
  bg: 'var(--devbar-color-bg)',
  bgCard: 'var(--devbar-color-bg-card)',
  bgElevated: 'var(--devbar-color-bg-elevated)',
  bgInput: 'var(--devbar-color-bg-input)',

  // Text
  text: 'var(--devbar-color-text)',
  textSecondary: 'var(--devbar-color-text-secondary)',
  textMuted: 'var(--devbar-color-text-muted)',

  // Borders
  border: 'var(--devbar-color-border)',
  borderSubtle: 'var(--devbar-color-border-subtle)',
} as const;

/**
 * Mix a CSS color with transparent to produce a translucent variant.
 * Uses color-mix() which, unlike hex alpha suffixes, works with var() values.
 *
 * @param color  Any CSS color value, including `var()` references
 * @param percent  Opacity level (0 = fully transparent, 100 = fully opaque)
 */
export function withAlpha(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

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

/**
 * Safely get item from localStorage with error handling
 */
function safeGetItem(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch (error) {
    // Handle SecurityError in private browsing or iframe contexts
    console.warn('[devbar] localStorage access failed:', error);
    return null;
  }
}

/**
 * Safely set item in localStorage with error handling
 */
function safeSetItem(key: string, value: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    // Handle QuotaExceededError or SecurityError
    if (error instanceof Error) {
      if (error.name === 'QuotaExceededError') {
        console.warn('[devbar] localStorage quota exceeded');
      } else {
        console.warn('[devbar] localStorage access failed:', error.message);
      }
    }
    return false;
  }
}

/**
 * Get the stored theme mode preference
 */
export function getStoredThemeMode(): ThemeMode {
  const stored = safeGetItem(STORAGE_KEYS.themeMode);
  if (stored === 'dark' || stored === 'light' || stored === 'system') {
    return stored;
  }
  return 'system';
}

/**
 * Store the theme mode preference
 */
export function setStoredThemeMode(mode: ThemeMode): void {
  safeSetItem(STORAGE_KEYS.themeMode, mode);
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
  src: url(data:font/woff2;base64,${DEPARTURE_MONO_WOFF2_BASE64}) format('woff2');
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
  --devbar-shadow-drop-sm: ${theme.shadows.dropSm};
  --devbar-shadow-drop-lg: ${theme.shadows.dropLg};
  --devbar-shadow-drop-toolbar: ${theme.shadows.dropToolbar};
  --devbar-shadow-drop-xl: ${theme.shadows.dropXl};

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
  width: '24px',
  height: '24px',
  minWidth: '24px',
  minHeight: '24px',
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
  backgroundColor: 'rgba(0, 0, 0, 0.3)',
  zIndex: '10002',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  paddingBottom: '60px',
};

/** Common modal box styles (uses CSS variables for theming) */
export const MODAL_BOX_BASE_STYLES: Record<string, string> = {
  backgroundColor: 'var(--devbar-color-bg-elevated)',
  borderRadius: '12px',
  width: 'calc(100% - 32px)',
  maxWidth: '700px',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: FONT_MONO,
};

// ============================================================================
// CSS Styles
// ============================================================================

/** Animation and utility CSS styles (uses CSS variables for theming) */
export const DEVBAR_STYLES = `
.devbar-item {
  transition: opacity 150ms ease-out, color 150ms ease-out;
}
.devbar-item:hover {
  opacity: 1 !important;
  color: var(--devbar-color-primary);
}
.devbar-clickable {
  transition: transform 150ms ease-out, background-color 150ms ease-out, box-shadow 150ms ease-out;
}
.devbar-clickable:hover {
  transform: scale(1.1);
  background-color: var(--devbar-color-primary-glow);
  box-shadow: 0 0 8px var(--devbar-color-primary-glow);
}
[data-devbar] button:focus-visible,
[data-devbar] [role="button"]:focus-visible,
[data-devbar] [tabindex]:focus-visible,
[data-devbar-overlay] button:focus-visible,
[data-devbar-overlay] [role="button"]:focus-visible,
[data-devbar-overlay] [tabindex]:focus-visible {
  outline: 2px solid var(--devbar-color-primary);
  outline-offset: 3px;
  box-shadow: 0 0 0 4px var(--devbar-color-primary-glow);
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
  background-color: var(--devbar-color-primary-glow);
  box-shadow: 0 0 12px var(--devbar-color-primary-glow);
  border-color: var(--devbar-color-primary);
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
@keyframes devbar-collapse {
  0% { transform: scale(0.8); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes devbar-collapsed-pulse {
  0%, 100% { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(16, 185, 129, 0.1); }
  50% { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 8px rgba(16, 185, 129, 0.4); }
}
/* Modal scrollbars */
[data-devbar-overlay] * {
  scrollbar-width: thin;
  scrollbar-color: var(--devbar-color-primary-glow) transparent;
}
[data-devbar-overlay] *::-webkit-scrollbar {
  width: 6px;
}
[data-devbar-overlay] *::-webkit-scrollbar-track {
  background: transparent;
}
[data-devbar-overlay] *::-webkit-scrollbar-thumb {
  background: var(--devbar-color-primary-glow);
  border-radius: 3px;
}
[data-devbar-overlay] *::-webkit-scrollbar-thumb:hover {
  background: var(--devbar-color-primary);
}
/* Main row - dense single row by default; metrics collapse before controls wrap. */
.devbar-main {
  flex-wrap: nowrap;
  max-width: 100%;
  overflow: visible;
}
.devbar-status {
  min-width: 0;
  flex: 1 1 auto;
}
/* Info section - truncates if needed to fit single row */
.devbar-info {
  white-space: nowrap;
  min-width: 0;
  max-width: 100%;
  overflow: hidden !important;
}
.devbar-info > span {
  flex-shrink: 0;
}
/* Actions container - stays on the same row until compact widths. */
.devbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-basis: auto;
  flex-shrink: 0;
  flex-wrap: nowrap;
  justify-content: flex-end;
  min-width: 0;
  max-width: 100%;
}
.devbar-actions::before {
  content: "agent tools";
  color: var(--devbar-color-text-muted);
  font-size: 0.5625rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
  opacity: 0.78;
}
[data-devbar-custom-controls="true"] .devbar-main {
  flex-wrap: nowrap;
  align-items: center;
  overflow: visible;
}
[data-devbar-custom-controls="true"] .devbar-status {
  flex: 1 1 auto;
  max-width: 100%;
  overflow: hidden;
}
[data-devbar-custom-controls="true"] .devbar-actions {
  flex: 0 0 auto;
  flex-wrap: nowrap;
  min-width: 0;
  max-width: 100%;
  row-gap: 0.375rem;
}
.devbar-custom-controls {
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: visible;
}
.devbar-custom-controls-inline {
  flex-wrap: nowrap !important;
  flex-shrink: 1;
  overflow: hidden;
}
.devbar-custom-controls-row {
  width: 100%;
}
.devbar-custom-control {
  max-width: min(16rem, 100%);
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.devbar-custom-group-label {
  box-sizing: border-box;
}
@media (max-width: 1120px) {
  [data-devbar-custom-controls="true"] .devbar-main {
    flex-direction: column;
    flex-wrap: nowrap !important;
    align-items: center !important;
    justify-content: center !important;
    row-gap: 0.5rem;
    width: fit-content !important;
    max-width: 100%;
  }
  [data-devbar-custom-controls="true"] .devbar-status,
  [data-devbar-custom-controls="true"] .devbar-custom-controls-inline,
  [data-devbar-custom-controls="true"] .devbar-actions {
    flex: 0 1 auto !important;
    width: fit-content !important;
    max-width: 100%;
  }
  [data-devbar-custom-controls="true"] .devbar-status {
    justify-content: center !important;
  }
  [data-devbar-custom-controls="true"] .devbar-custom-controls-inline {
    justify-content: center !important;
  }
  [data-devbar-custom-controls="true"] .devbar-actions {
    justify-content: center !important;
    flex-wrap: wrap !important;
  }
}
@media (max-width: 860px) {
  .devbar-main {
    flex-wrap: wrap;
    row-gap: 0.5rem;
    overflow: visible;
  }
  .devbar-status {
    flex: 1 1 100%;
    max-width: 100%;
    justify-content: center;
  }
  .devbar-actions {
    flex: 1 1 100%;
    justify-content: center;
    flex-wrap: wrap;
    column-gap: 0.5rem;
    row-gap: 0.375rem;
    min-width: 0;
  }
  .devbar-custom-controls {
    justify-content: center !important;
  }
}
/* BASE only (< 640px): fit content, centered horizontally */
@media (max-width: 639px) {
  /* Expanded state: center and constrain width (exclude overlays and tooltips) */
  [data-devbar]:not(.devbar-collapse):not([data-devbar-overlay]):not([data-devbar-tooltip]) {
    width: auto !important;
    min-width: auto !important;
    max-width: calc(100vw - 24px) !important;
    bottom: calc(env(safe-area-inset-bottom) + 12px) !important;
    left: 50% !important;
    right: auto !important;
    transform: translateX(-50%) !important;
  }
  /* Collapsed state: JS handles positioning based on captured dot location */
  .devbar-main {
    flex-wrap: wrap;
    justify-content: center;
    overflow: visible;
    max-width: calc(100vw - 24px);
    gap: 0.375rem !important;
    padding: 0.375rem 0.5rem !important;
  }
  /* Keep status row (connection dot + info) on same line */
  .devbar-status {
    flex-wrap: nowrap !important;
    justify-content: center;
    flex: 1 1 100%;
    gap: 0.375rem !important;
  }
  .devbar-info {
    justify-content: center;
    flex-wrap: nowrap;
    gap: 0.375rem !important;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap !important;
  }
  .devbar-actions {
    display: grid;
    grid-template-columns: repeat(5, 32px);
    justify-content: center;
    justify-items: center;
    align-items: center;
    column-gap: 0.25rem;
    row-gap: 0.25rem;
    margin-top: 0;
    flex-wrap: nowrap;
    width: auto;
    flex-shrink: 1;
  }
  .devbar-actions::before {
    content: none;
    display: none;
  }
  .devbar-actions button {
    width: 32px !important;
    height: 32px !important;
    min-width: 32px !important;
    min-height: 32px !important;
  }
  .devbar-actions button svg {
    width: 14px;
    height: 14px;
  }
  .devbar-custom-controls {
    justify-content: center !important;
    gap: 0.25rem !important;
    padding: 0.375rem !important;
  }
  .devbar-custom-controls-inline {
    padding: 0 !important;
  }
  .devbar-custom-control {
    min-height: 0 !important;
    max-width: 100% !important;
    padding: 0.25rem 0.5rem !important;
    font-size: 0.5625rem !important;
    line-height: 1rem !important;
  }
  .devbar-custom-group-label {
    flex-basis: 100% !important;
    margin-left: 0 !important;
    text-align: center;
  }
  .devbar-settings-grid {
    grid-template-columns: 1fr !important;
  }
  .devbar-settings-grid > div {
    border-right: none !important;
  }
}
`;
