/**
 * Lazy Loading for html2canvas
 *
 * Defers html2canvas-pro loading until first screenshot capture,
 * reducing initial bundle size and page load time.
 */

// Type for the html2canvas function
type Html2CanvasFunc = (
  element: HTMLElement,
  options?: {
    logging?: boolean;
    useCORS?: boolean;
    allowTaint?: boolean;
    scale?: number;
    width?: number;
    height?: number;
    windowWidth?: number;
    windowHeight?: number;
    scrollX?: number;
    scrollY?: number;
  }
) => Promise<HTMLCanvasElement>;

// Cached promise for the html2canvas module
let html2canvasPromise: Promise<Html2CanvasFunc> | null = null;

/**
 * Get html2canvas function, lazily loading it on first call.
 * Subsequent calls return the same cached promise.
 */
export async function getHtml2Canvas(): Promise<Html2CanvasFunc> {
  if (!html2canvasPromise) {
    html2canvasPromise = import('html2canvas-pro').then((module) => {
      // Handle ESM/CJS interop
      const html2canvas = (module as unknown as { default: Html2CanvasFunc }).default ?? module;
      return html2canvas as Html2CanvasFunc;
    });
  }
  return html2canvasPromise;
}

/**
 * Check if html2canvas has been loaded
 */
export function isHtml2CanvasLoaded(): boolean {
  return html2canvasPromise !== null;
}

/**
 * Preload html2canvas without waiting for result.
 * Useful for warming up the cache before user interaction.
 */
export function preloadHtml2Canvas(): void {
  getHtml2Canvas().catch(() => {
    // Silently ignore preload errors
  });
}
