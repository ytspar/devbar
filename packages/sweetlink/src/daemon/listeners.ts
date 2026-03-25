/**
 * Page Event Listeners
 *
 * Sets up always-on capture of console, network, and dialog events
 * from the daemon's persistent Playwright page into ring buffers.
 */

type Page = import('playwright').Page;

import { RingBuffer } from './ringBuffer.js';

// ============================================================================
// Event Types
// ============================================================================

export interface ConsoleEntry {
  timestamp: number;
  level: string;
  message: string;
  location?: string;
}

export interface NetworkEntry {
  timestamp: number;
  method: string;
  url: string;
  status: number;
  duration: number;
  contentType?: string;
  size?: number;
}

export interface DialogEntry {
  timestamp: number;
  type: string; // alert, confirm, prompt, beforeunload
  message: string;
  defaultValue?: string;
}

// ============================================================================
// Buffers (50K entries each)
// ============================================================================

export const consoleBuffer = new RingBuffer<ConsoleEntry>(50_000);
export const networkBuffer = new RingBuffer<NetworkEntry>(50_000);
export const dialogBuffer = new RingBuffer<DialogEntry>(50_000);

// Track pending requests for duration calculation
const pendingRequests = new Map<string, { startTime: number; method: string; url: string }>();

// ============================================================================
// Setup
// ============================================================================

let listenersInstalled = false;

/**
 * Install event listeners on the daemon page.
 * Safe to call multiple times — only installs once.
 */
export function installListeners(page: Page): void {
  if (listenersInstalled) return;
  listenersInstalled = true;

  // Console events
  page.on('console', (msg) => {
    consoleBuffer.push({
      timestamp: Date.now(),
      level: msg.type(),
      message: msg.text(),
      location: msg.location()
        ? `${msg.location().url}:${msg.location().lineNumber}`
        : undefined,
    });
  });

  // Network events
  page.on('request', (request) => {
    pendingRequests.set(request.url(), {
      startTime: Date.now(),
      method: request.method(),
      url: request.url(),
    });
  });

  page.on('response', (response) => {
    const pending = pendingRequests.get(response.url());
    const startTime = pending?.startTime ?? Date.now();
    pendingRequests.delete(response.url());

    networkBuffer.push({
      timestamp: Date.now(),
      method: pending?.method ?? 'GET',
      url: response.url(),
      status: response.status(),
      duration: Date.now() - startTime,
      contentType: response.headers()['content-type'],
    });
  });

  page.on('requestfailed', (request) => {
    const pending = pendingRequests.get(request.url());
    const startTime = pending?.startTime ?? Date.now();
    pendingRequests.delete(request.url());

    networkBuffer.push({
      timestamp: Date.now(),
      method: pending?.method ?? request.method(),
      url: request.url(),
      status: 0,
      duration: Date.now() - startTime,
    });
  });

  // Dialog events (auto-dismiss)
  page.on('dialog', async (dialog) => {
    dialogBuffer.push({
      timestamp: Date.now(),
      type: dialog.type(),
      message: dialog.message(),
      defaultValue: dialog.defaultValue() || undefined,
    });
    // Auto-dismiss to prevent blocking
    await dialog.dismiss().catch(() => {});
  });

  console.error('[Daemon] Event listeners installed (console, network, dialog)');
}

/**
 * Get error count from console buffer.
 */
export function getErrorCount(): number {
  return consoleBuffer.filter((e) => e.level === 'error').length;
}

/**
 * Get warning count from console buffer.
 */
export function getWarningCount(): number {
  return consoleBuffer.filter((e) => e.level === 'warning').length;
}

/**
 * Format console entries as human-readable text.
 */
export function formatConsoleEntries(entries: ConsoleEntry[]): string {
  if (entries.length === 0) return '(no console messages)';

  return entries
    .map((e) => {
      const time = new Date(e.timestamp).toISOString().slice(11, 19);
      const levelTag = e.level.toUpperCase().padEnd(7);
      const location = e.location ? ` (${e.location})` : '';
      return `[${time}] ${levelTag} ${e.message}${location}`;
    })
    .join('\n');
}

/**
 * Format network entries as human-readable text.
 */
export function formatNetworkEntries(entries: NetworkEntry[]): string {
  if (entries.length === 0) return '(no network requests)';

  return entries
    .map((e) => {
      const time = new Date(e.timestamp).toISOString().slice(11, 19);
      const status = e.status === 0 ? 'FAIL' : String(e.status);
      const duration = `${e.duration}ms`;
      // Truncate long URLs
      const url = e.url.length > 80 ? e.url.substring(0, 77) + '...' : e.url;
      return `[${time}] ${status} ${e.method} ${url} ${duration}`;
    })
    .join('\n');
}
