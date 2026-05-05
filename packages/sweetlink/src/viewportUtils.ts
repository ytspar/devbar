/**
 * Viewport Utilities
 *
 * Shared viewport parsing and configuration used by CDP and Playwright integrations.
 */

// ============================================================================
// Constants
// ============================================================================

/** Default viewport dimensions */
export const DEFAULT_VIEWPORT = { width: 1512, height: 982 };

/** Preset viewport configurations */
export const VIEWPORT_PRESETS = {
  default: { width: 1512, height: 3000 },
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
} as const;

// ============================================================================
// Types
// ============================================================================

export interface ViewportConfig {
  width: number;
  height: number;
  isMobile: boolean;
}

/**
 * Accepted viewport input shapes:
 *   - 'mobile' | 'tablet' | 'desktop' — named preset
 *   - `${number}x${number}` — explicit pixel dimensions, e.g. '1920x1080'
 * The bare `string` fallback stays for back-compat (parseViewport still
 * tolerates unknown values by falling back to the default), but new code
 * should use this narrower union to surface bad inputs at compile time.
 */
export type ViewportName = 'mobile' | 'tablet' | 'desktop' | `${number}x${number}`;

// ============================================================================
// Functions
// ============================================================================

/**
 * Parse a viewport string into width, height, and mobile flag.
 *
 * Accepts:
 * - Named presets: 'mobile', 'tablet', 'desktop'
 * - Custom dimensions: '1920x1080'
 * - undefined/null: returns default viewport
 *
 * @param viewportName - The viewport preset name or dimensions string
 * @param defaultViewport - Optional default viewport to use (defaults to VIEWPORT_PRESETS.default)
 * @returns Parsed viewport configuration
 */
export function parseViewport(
  viewportName?: ViewportName | string,
  defaultViewport: { width: number; height: number } = VIEWPORT_PRESETS.default
): ViewportConfig {
  if (!viewportName) {
    return { width: defaultViewport.width, height: defaultViewport.height, isMobile: false };
  }

  const name = viewportName.toLowerCase();

  switch (name) {
    case 'mobile':
      return {
        width: VIEWPORT_PRESETS.mobile.width,
        height: VIEWPORT_PRESETS.mobile.height,
        isMobile: true,
      };
    case 'tablet':
      return {
        width: VIEWPORT_PRESETS.tablet.width,
        height: VIEWPORT_PRESETS.tablet.height,
        isMobile: true,
      };
    case 'desktop':
      return {
        width: VIEWPORT_PRESETS.desktop.width,
        height: VIEWPORT_PRESETS.desktop.height,
        isMobile: false,
      };
  }

  // Try to parse "widthxheight" format
  const parts = viewportName.split('x');
  if (parts.length === 2) {
    const width = parseInt(parts[0]!, 10);
    const height = parseInt(parts[1]!, 10);
    if (!Number.isNaN(width) && !Number.isNaN(height)) {
      return { width, height, isMobile: false };
    }
  }

  // Fallback to default
  return { width: defaultViewport.width, height: defaultViewport.height, isMobile: false };
}
