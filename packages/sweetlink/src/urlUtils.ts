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

/** Last-resort dev server URL when nothing else identifies the target. */
export const FALLBACK_DEV_URL = 'http://localhost:3000';

/**
 * The dev server URL to target when the caller passes no explicit `--url`.
 *
 * Port 3000 stopped being a safe assumption once apps moved behind Portless,
 * which gives every app a stable `https://<name>.localhost` route and assigns
 * the underlying port dynamically. Portless exports `PORTLESS_URL` into the
 * process it runs, so when we are running under it that value — not 3000 — is
 * the app the user means. Defaulting to 3000 there means `sweetlink status`
 * reports on a port nothing is listening to, and every URL-less command aims at
 * the wrong app.
 *
 * Precedence: an explicit `SWEETLINK_DEV_URL` override wins (the pre-existing
 * escape hatch, and it may point somewhere Portless doesn't know about), then
 * the Portless-provided route, then the historical default so projects not
 * using Portless are unaffected.
 */
export function defaultDevUrl(env: Record<string, string | undefined> = process.env): string {
  return env.SWEETLINK_DEV_URL || env.PORTLESS_URL || FALLBACK_DEV_URL;
}

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
// URL Comparison
// ============================================================================

/**
 * Normalize a page URL for navigation comparisons: drop the hash and any
 * trailing slash on the path, keep the query string significant. Falls back
 * to a plain-string normalization when the input isn't an absolute URL.
 */
export function normalizeUrlForComparison(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${pathname}${parsed.search}`;
  } catch {
    return url.replace(/#.*$/, '').replace(/\/+$/, '');
  }
}

/**
 * Whether two URLs point at the same page for navigation purposes
 * (ignoring trailing slashes and hash fragments).
 */
export function urlsEquivalent(a: string, b: string): boolean {
  return normalizeUrlForComparison(a) === normalizeUrlForComparison(b);
}

// ============================================================================
// Browser Client Selection
// ============================================================================

/** Location info tracked per connected browser client. */
export interface BrowserClientLocation {
  /** Last URL the client reported (browser-client-ready / response metadata). */
  url?: string | null;
  /** Origin header captured at the WebSocket handshake. */
  origin?: string | null;
}

export type BrowserClientMatch = 'exact' | 'origin' | 'unknown-location' | 'none';

function safeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Pick the browser client a command targeting `targetUrl` should dispatch to.
 *
 * Ranking: a client whose reported location matches exactly
 * (`urlsEquivalent`) wins, then one on the same origin, then one that never
 * reported a location or origin (old builds — callers should warn). Clients
 * that reported a DIFFERENT page or origin are never eligible: multiple
 * projects' pages can be attached to one server, and dispatching to a
 * foreign page silently executes commands against the wrong app.
 *
 * Returns `index: -1, match: 'none'` when no client is eligible.
 */
export function selectClientForTargetUrl(
  clients: readonly BrowserClientLocation[],
  targetUrl: string
): { index: number; match: BrowserClientMatch } {
  const targetOrigin = safeOrigin(targetUrl);
  let originIndex = -1;
  let unknownIndex = -1;

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i]!;
    if (client.url) {
      if (urlsEquivalent(client.url, targetUrl)) return { index: i, match: 'exact' };
      if (originIndex === -1 && targetOrigin && safeOrigin(client.url) === targetOrigin) {
        originIndex = i;
      }
      continue;
    }
    const clientOrigin = safeOrigin(client.origin);
    if (clientOrigin) {
      if (originIndex === -1 && targetOrigin && clientOrigin === targetOrigin) {
        originIndex = i;
      }
      continue; // known origin that doesn't match — never a blind fallback
    }
    if (unknownIndex === -1) unknownIndex = i;
  }

  if (originIndex !== -1) return { index: originIndex, match: 'origin' };
  if (unknownIndex !== -1) return { index: unknownIndex, match: 'unknown-location' };
  return { index: -1, match: 'none' };
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
