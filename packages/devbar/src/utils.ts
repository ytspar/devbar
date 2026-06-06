/**
 * devbar Utility Functions
 *
 * Re-exports shared utilities from @ytspar/sweetlink for use by devbar components.
 * This avoids code duplication between packages.
 *
 * NOTE: We import from specific sub-paths to avoid pulling in Node.js-only modules
 * that would break browser/test environments.
 */

// Re-export console formatting utilities from sweetlink's browser module
export { formatArg, formatArgs } from '@ytspar/sweetlink/browser/consoleCapture';

// Re-export screenshot utilities from sweetlink's browser module
export {
  canvasToDataUrl,
  copyCanvasToClipboard,
  delay,
  prepareForCapture,
} from '@ytspar/sweetlink/browser/screenshotUtils';

/** Format bytes to human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Whether a URL is safe to navigate to (`location.href =` / `window.open`).
 * Allows http/https absolute URLs and same-origin relative paths; rejects
 * `javascript:`, `data:`, and other script-bearing schemes. Used to gate
 * viewer URLs that arrive over the (untrusted) Sweetlink WebSocket — a
 * `javascript:` URL would otherwise be DOM-XSS.
 */
export function isSafeNavigationUrl(url: string): boolean {
  if (typeof url !== 'string' || url.trim() === '') return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Trigger a browser file download from a string content. */
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Trigger a browser file download from a data URL (e.g. screenshot). */
export function downloadDataUrl(filename: string, dataUrl: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
