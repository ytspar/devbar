/**
 * DevBar Constants
 *
 * Shared constants used by the DevBar components.
 */

// ============================================================================
// Console Settings
// ============================================================================

/** Maximum number of console logs to retain */
export const MAX_CONSOLE_LOGS = 100;

/** Higher quality JPEG for devbar screenshots */
export const DEVBAR_SCREENSHOT_QUALITY = 0.8;

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
  'base': { min: 0, label: 'Tailwind base: <640px' },
  'sm': { min: 640, label: 'Tailwind sm: >=640px' },
  'md': { min: 768, label: 'Tailwind md: >=768px' },
  'lg': { min: 1024, label: 'Tailwind lg: >=1024px' },
  'xl': { min: 1280, label: 'Tailwind xl: >=1280px' },
  '2xl': { min: 1536, label: 'Tailwind 2xl: >=1536px' },
} as const;

export type TailwindBreakpoint = keyof typeof TAILWIND_BREAKPOINTS;

// ============================================================================
// Button Colors
// ============================================================================

/** Button colors for devbar toolbar buttons */
export const BUTTON_COLORS = {
  screenshot: '#10b981', // emerald - matches accent color
  review: '#a855f7',     // purple
  outline: '#06b6d4',    // cyan
  schema: '#f59e0b',     // amber
  error: '#ef4444',      // red
  warning: '#f59e0b',    // amber
} as const;

/** Category colors for outline display */
export const CATEGORY_COLORS: Record<string, string> = {
  heading: '#10b981',    // emerald
  sectioning: '#3b82f6', // blue
  landmark: '#a855f7',   // purple
  grouping: '#06b6d4',   // cyan
  form: '#f59e0b',       // amber
  table: '#ec4899',      // pink
  list: '#84cc16',       // lime
  other: '#6b7280',      // gray
};

// ============================================================================
// Design System Theme
// ============================================================================

/** Complete DevBar design system theme */
export const DEVBAR_THEME = {
  colors: {
    // Primary accent
    primary: '#10b981',
    primaryHover: '#059669',
    primaryGlow: 'rgba(16, 185, 129, 0.4)',

    // Semantic colors
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',

    // Extended palette
    purple: '#a855f7',
    cyan: '#06b6d4',
    pink: '#ec4899',
    lime: '#84cc16',

    // Backgrounds
    bg: '#0a0f1a',
    bgCard: 'rgba(17, 24, 39, 0.95)',
    bgElevated: 'rgba(17, 24, 39, 0.98)',
    bgInput: 'rgba(10, 15, 26, 0.8)',

    // Text
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: '#6b7280',

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
    sizeXs: '0.625rem',    // 10px - badges, tiny labels
    sizeSm: '0.6875rem',   // 11px - main devbar text
    sizeBase: '0.75rem',   // 12px - buttons, tooltips
    sizeMd: '0.8125rem',   // 13px - section headers
    sizeLg: '0.875rem',    // 14px - descriptions
    sizeXl: '1rem',        // 16px - modal titles
    size2xl: '1.5rem',     // 24px - page titles

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

/** Flexible input type for theme customization */
export type DevBarThemeInput = {
  colors: { [K in keyof DevBarTheme['colors']]: string };
  fonts: { [K in keyof DevBarTheme['fonts']]: string };
  typography: { [K in keyof DevBarTheme['typography']]: string };
  radius: { [K in keyof DevBarTheme['radius']]: string };
  shadows: { [K in keyof DevBarTheme['shadows']]: string };
  transitions: { [K in keyof DevBarTheme['transitions']]: string };
};

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
  const breakpoints = Object.entries(TAILWIND_BREAKPOINTS) as [TailwindBreakpoint, { min: number }][];

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
  backgroundColor: 'rgba(17, 24, 39, 0.98)',
  borderRadius: '12px',
  width: '90%',
  maxWidth: '700px',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "'Departure Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
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
  height: 12px;
  pointer-events: none;
}
.devbar-tooltip:hover::before {
  pointer-events: auto;
}
.devbar-tooltip::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) scale(0.95);
  padding: 0.625rem 1rem;
  background: rgba(17, 24, 39, 0.98);
  color: #10b981;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  line-height: 1.5;
  border-radius: 6px;
  border: 1px solid rgba(16, 185, 129, 0.3);
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
  color: #10b981;
}
.devbar-clickable {
  transition: transform 150ms ease-out, background-color 150ms ease-out, box-shadow 150ms ease-out;
}
.devbar-clickable:hover {
  transform: scale(1.1);
  background-color: rgba(16, 185, 129, 0.15);
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
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
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
  border-color: #10b981;
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
/* BASE only (< 640px): flexible width, centered, icons wrap to second row */
@media (max-width: 639px) {
  [data-devbar] {
    width: auto !important;
    min-width: auto !important;
    max-width: calc(100vw - 100px) !important;
    left: 50% !important;
    right: auto !important;
    transform: translateX(-50%) !important;
  }
  .devbar-main {
    flex-wrap: wrap;
    justify-content: center;
  }
  .devbar-info {
    justify-content: center;
    flex-wrap: wrap;
  }
  .devbar-actions {
    width: 100%;
    justify-content: center;
    margin-top: 0.25rem;
    flex-wrap: nowrap;
  }
}
`;
