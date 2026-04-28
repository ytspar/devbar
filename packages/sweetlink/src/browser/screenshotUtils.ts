/**
 * Screenshot Utilities
 *
 * Shared canvas and screenshot helper functions used by both
 * GlobalDevBar and SweetlinkBridge for capturing and processing screenshots.
 */

// ============================================================================
// Constants
// ============================================================================

/** Default screenshot scale factor */
export const DEFAULT_SCREENSHOT_SCALE = 0.25;

/** Default JPEG quality */
export const DEFAULT_SCREENSHOT_QUALITY = 0.7;

const HIDE_DEVBAR_STYLE_ID = 'sweetlink-hide-devbar-for-capture';
const HIDE_DEVBAR_CSS = `
[data-devbar],
[data-devbar-overlay],
[data-devbar-tooltip] {
  visibility: hidden !important;
  pointer-events: none !important;
}
`;

// ============================================================================
// Canvas Scaling
// ============================================================================

/**
 * Options for canvas scaling
 */
export interface ScaleCanvasOptions {
  scale: number;
  smoothing?: boolean;
  smoothingQuality?: ImageSmoothingQuality;
}

/**
 * Scale a canvas down to a smaller size
 *
 * @param originalCanvas - The source canvas to scale
 * @param options - Scaling options
 * @returns A new scaled canvas
 */
export function scaleCanvas(
  originalCanvas: HTMLCanvasElement,
  options: ScaleCanvasOptions
): HTMLCanvasElement {
  const { scale, smoothing = true, smoothingQuality = 'high' } = options;

  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = Math.floor(originalCanvas.width * scale);
  scaledCanvas.height = Math.floor(originalCanvas.height * scale);

  const ctx = scaledCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas 2D context');
  }

  ctx.imageSmoothingEnabled = smoothing;
  ctx.imageSmoothingQuality = smoothingQuality;
  ctx.drawImage(originalCanvas, 0, 0, scaledCanvas.width, scaledCanvas.height);

  return scaledCanvas;
}

// ============================================================================
// Data URL Conversion
// ============================================================================

/**
 * Options for converting canvas to data URL
 */
export interface ToDataUrlOptions {
  format?: 'jpeg' | 'png';
  quality?: number;
}

/**
 * Convert a canvas to a data URL
 *
 * @param canvas - The canvas to convert
 * @param options - Conversion options
 * @returns Data URL string
 */
export function canvasToDataUrl(canvas: HTMLCanvasElement, options: ToDataUrlOptions = {}): string {
  const { format = 'jpeg', quality = DEFAULT_SCREENSHOT_QUALITY } = options;

  if (format === 'png') {
    return canvas.toDataURL('image/png');
  }
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Extract base64 data from a data URL
 *
 * @param dataUrl - The data URL to extract from
 * @returns Base64 encoded string without the prefix
 */
export function extractBase64FromDataUrl(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/(png|jpeg);base64,/, '');
}

/**
 * Get the media type from a data URL
 *
 * @param dataUrl - The data URL to check
 * @returns The media type ('image/png' or 'image/jpeg')
 */
export function getMediaTypeFromDataUrl(dataUrl: string): 'image/png' | 'image/jpeg' {
  return dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
}

// ============================================================================
// Screenshot Capture Helpers
// ============================================================================

export interface PrepareForCaptureOptions {
  /** Temporarily hide devbar UI chrome from the captured image. */
  hideDevbar?: boolean;
}

/**
 * Temporarily hide DevBar chrome for screenshot capture.
 *
 * @returns Cleanup function to restore state
 */
export function hideDevbarForCapture(): () => void {
  const existing = document.getElementById(HIDE_DEVBAR_STYLE_ID);
  if (existing) {
    return () => {};
  }

  const style = document.createElement('style');
  style.id = HIDE_DEVBAR_STYLE_ID;
  style.textContent = HIDE_DEVBAR_CSS;
  document.head.appendChild(style);

  return () => {
    style.remove();
  };
}

/**
 * Prepare the page for screenshot capture.
 * Blurs active element, adds capturing class to body, and optionally hides DevBar chrome.
 *
 * @returns Cleanup function to restore state
 */
export function prepareForCapture(options: PrepareForCaptureOptions = {}): () => void {
  document.body.classList.add('devbar-capturing');

  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  const cleanupDevbar = options.hideDevbar ? hideDevbarForCapture() : null;

  return () => {
    cleanupDevbar?.();
    document.body.classList.remove('devbar-capturing');
  };
}

/**
 * Wait for a specified delay (useful for letting UI settle)
 *
 * @param ms - Milliseconds to wait
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Clipboard Utilities
// ============================================================================

/**
 * Copy a canvas to the clipboard as a PNG image
 *
 * @param canvas - The canvas to copy
 * @returns Promise that resolves when copy is complete
 */
export async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Failed to create blob from canvas'));
        return;
      }

      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 'image/png');
  });
}
