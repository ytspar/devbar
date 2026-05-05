/**
 * URL and Path Utilities
 *
 * Shared utilities for URL slug generation and path manipulation
 * used by server.ts for generating filenames.
 */

// ============================================================================
// Constants
// ============================================================================

/** Maximum length for generated slugs */
export const MAX_SLUG_LENGTH = 50;

/** Maximum length for log messages in summaries */
export const MAX_LOG_MESSAGE_LENGTH = 200;

// ============================================================================
// Slug Generation
// ============================================================================

/**
 * Generate a URL-safe slug from a URL path or title
 *
 * @param url - The URL to generate a slug from
 * @param title - Optional title to use as fallback
 * @returns A URL-safe slug string
 *
 * @example
 * ```ts
 * generateSlugFromUrl('https://example.com/company/acme-corp')
 * // Returns: 'company-acme-corp'
 *
 * generateSlugFromUrl('https://example.com/', 'Home Page')
 * // Returns: 'index'
 * ```
 */
export function generateSlugFromUrl(url: string, title?: string): string {
  let slug = '';

  try {
    const urlObj = new URL(url);
    // Use pathname, remove leading/trailing slashes, replace slashes with dashes
    slug = urlObj.pathname
      .replace(/^\/|\/$/g, '')
      .replace(/\//g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .slice(0, MAX_SLUG_LENGTH);
  } catch {
    // Fallback to title if URL parsing fails
    slug = (title || 'page')
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, MAX_SLUG_LENGTH);
  }

  // Use 'index' for root path
  return slug || 'index';
}

// ============================================================================
// Timestamp Formatting
// ============================================================================

/**
 * Format a timestamp for use in filenames
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns ISO date string with colons and periods replaced by dashes
 *
 * @example
 * ```ts
 * formatTimestampForFilename(Date.now())
 * // Returns: '2024-01-15T10-30-45-123Z'
 * ```
 */
export function formatTimestampForFilename(timestamp: number): string {
  return new Date(timestamp).toISOString().replace(/[:.]/g, '-');
}

/**
 * Generate a base filename with type prefix and timestamp
 *
 * @param type - The type prefix (e.g., 'screenshot', 'design-review', 'outline')
 * @param timestamp - Unix timestamp in milliseconds
 * @param slug - Optional slug to include in the filename
 * @returns A formatted filename without extension
 *
 * @example
 * ```ts
 * generateBaseFilename('screenshot', Date.now())
 * // Returns: 'screenshot-2024-01-15T10-30-45-123Z'
 *
 * generateBaseFilename('outline', Date.now(), 'company-page')
 * // Returns: 'outline-company-page-2024-01-15T10-30-45-123Z'
 * ```
 */
export function generateBaseFilename(type: string, timestamp: number, slug?: string): string {
  const dateStr = formatTimestampForFilename(timestamp);
  const safeType = sanitizeFilenamePart(type);

  if (slug) {
    const safeSlug = sanitizeFilenamePart(slug);
    if (safeSlug) {
      return `${safeType}-${safeSlug}-${dateStr}`;
    }
  }
  return `${safeType}-${dateStr}`;
}

// Drop any character that could escape the filename — slashes, dots, and
// non-printable bytes — so a browser-supplied slug or trigger cannot push
// the path outside the intended directory. Matches the existing regex used
// by generateSlugFromUrl above.
function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, MAX_SLUG_LENGTH);
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Default screenshot directory path
 */
export const SCREENSHOT_DIR = '.tmp/sweetlink-screenshots';

/**
 * Default HMR screenshot directory path
 */
export const HMR_SCREENSHOT_DIR = '.tmp/hmr-screenshots';

/**
 * Truncate a message to a maximum length
 *
 * @param message - The message to truncate
 * @param maxLength - Maximum length (default: MAX_LOG_MESSAGE_LENGTH)
 * @returns Truncated message
 */
export function truncateMessage(
  message: string,
  maxLength: number = MAX_LOG_MESSAGE_LENGTH
): string {
  if (message.length <= maxLength) {
    return message;
  }
  return message.slice(0, maxLength);
}
