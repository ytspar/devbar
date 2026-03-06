#!/usr/bin/env node

/**
 * Sweetlink CLI Tool
 *
 * Command-line interface for interacting with the Sweetlink WebSocket server.
 * Allows taking screenshots, querying DOM, getting console logs, and executing JavaScript.
 */

import * as fs from 'fs';
import * as path from 'path';
import { WebSocket } from 'ws';
import { detectCDP, getNetworkRequestsViaCDP } from '../cdp.js';
import { screenshotViaPlaywright } from '../playwright.js';
import { getCardHeaderPreset, getNavigationPreset, measureViaPlaywright } from '../ruler.js';
import { DEFAULT_WS_PORT, MAX_PORT_RETRIES, WS_PORT_OFFSET } from '../types.js';
import { SCREENSHOT_DIR } from '../urlUtils.js';
import type {
  A11yData,
  CleanupData,
  ClickData,
  ExecData,
  LogsData,
  NetworkData,
  OutlineData,
  QueryData,
  RefreshData,
  RulerData,
  SchemaData,
  ScreenshotData,
  StatusData,
  VitalsData,
  WaitData,
} from './outputSchemas.js';
import { emitJson, printOutputSchema } from './outputSchemas.js';

const COMMON_APP_PORTS = [3000, 3001, 4000, 5173, 5174, 8000, 8080];

/**
 * Find the project root that has @ytspar/sweetlink installed
 * This ensures screenshots go to the correct project regardless of cwd
 *
 * PRIORITY ORDER:
 * 1. process.cwd() - The user's actual working directory (most reliable)
 * 2. Script location - Fallback for edge cases
 * 3. cwd as final fallback
 */
function findProjectRoot(): string {
  const debug = process.env.SWEETLINK_DEBUG === '1';
  const root = path.parse(process.cwd()).root;
  const cwd = process.cwd();

  if (debug) {
    console.error('[Sweetlink Debug] process.cwd():', cwd);
    console.error('[Sweetlink Debug] import.meta.url:', import.meta.url);
  }

  // FIRST: Try process.cwd() - this is where the user actually is
  // Walk up from cwd looking for package.json with sweetlink dependency
  let dir = cwd;
  while (dir !== root) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps['@ytspar/sweetlink']) {
          if (debug) console.error('[Sweetlink Debug] Found via cwd:', dir);
          return dir;
        }
        if (debug) console.error('[Sweetlink Debug] Checked', dir, '- no sweetlink dep');
      } catch {
        // Invalid package.json, continue searching
      }
    }
    dir = path.dirname(dir);
  }

  if (debug) console.error('[Sweetlink Debug] cwd search exhausted, trying script location');

  // FALLBACK: Try the script location (for edge cases with pnpm/symlinks)
  // This can be unreliable with pnpm's shared store, so it's secondary
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  dir = scriptDir;
  while (dir !== root) {
    if (dir.includes('node_modules')) {
      const nodeModulesIndex = dir.indexOf('node_modules');
      const projectRoot = dir.substring(0, nodeModulesIndex - 1);
      if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
        if (debug) console.error('[Sweetlink Debug] Found via script location:', projectRoot);
        return projectRoot;
      }
    }
    dir = path.dirname(dir);
  }

  // Final fallback to cwd
  if (debug) console.error('[Sweetlink Debug] Using final fallback cwd:', cwd);
  return cwd;
}

/**
 * Ensure the directory for a file path exists
 */
function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get the default screenshot output path (relative to project root)
 */
function getDefaultScreenshotPath(): string {
  const projectRoot = findProjectRoot();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(projectRoot, SCREENSHOT_DIR, `screenshot-${timestamp}.png`);
}

/**
 * Get relative path from project root for display
 */
function getRelativePath(absolutePath: string): string {
  const projectRoot = findProjectRoot();
  if (absolutePath.startsWith(projectRoot)) {
    return path.relative(projectRoot, absolutePath) || absolutePath;
  }
  return absolutePath;
}

/**
 * Report screenshot success to console
 */
function reportScreenshotSuccess(
  outputPath: string,
  width: number,
  height: number,
  method: string,
  selector?: string
): void {
  console.log(`[Sweetlink] ✓ Screenshot saved to: ${getRelativePath(outputPath)}`);
  console.log(`[Sweetlink] Dimensions: ${width}x${height}`);
  if (selector) console.log(`[Sweetlink] Selector: ${selector}`);
  console.log(`[Sweetlink] Method: ${method}`);
}

import type { SweetlinkCommand } from '../types.js';

interface SweetlinkResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  timestamp: number;
}

let resolvedWsUrl: string | null = null;
const DEFAULT_WS_URL = process.env.SWEETLINK_WS_URL || 'ws://localhost:9223';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const SERVER_READY_TIMEOUT = 30000; // 30 seconds to wait for server
const SERVER_POLL_INTERVAL = 500; // Poll every 500ms

/** Port range to scan when looking for Sweetlink servers */
const SCAN_PORT_START = 9223;
const SCAN_PORT_END = 9233;

interface ServerIdentity {
  port: number;
  appPort: number | null;
  gitBranch: string | null;
  appName: string | null;
}

/**
 * Query a single port for Sweetlink server identity info.
 * Returns null if no Sweetlink server is running on that port.
 */
async function probeServerIdentity(port: number): Promise<ServerIdentity | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(`http://localhost:${port}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.name !== '@ytspar/sweetlink') return null;
    return {
      port,
      appPort: data.appPort ?? null,
      gitBranch: data.gitBranch ?? null,
      appName: data.appName ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Discover a Sweetlink server matching the given app target.
 * Target can be a branch name, app name, or partial match.
 * Scans the default port range and returns the WS URL of the first match.
 */
async function discoverServer(target: string): Promise<string> {
  const probes = [];
  for (let port = SCAN_PORT_START; port <= SCAN_PORT_END; port++) {
    probes.push(probeServerIdentity(port));
  }
  // Also probe common offset ports (appPort + 6223)
  for (const appPort of COMMON_APP_PORTS) {
    const wsPort = appPort + WS_PORT_OFFSET;
    if (wsPort < SCAN_PORT_START || wsPort > SCAN_PORT_END) {
      probes.push(probeServerIdentity(wsPort));
    }
  }

  const results = (await Promise.all(probes)).filter(
    (r): r is ServerIdentity => r !== null
  );

  if (results.length === 0) {
    throw new Error('No Sweetlink servers found. Is a dev server running?');
  }

  const lowerTarget = target.toLowerCase();

  // Exact match on branch or app name
  const exact = results.find(
    (r) =>
      r.gitBranch?.toLowerCase() === lowerTarget ||
      r.appName?.toLowerCase() === lowerTarget
  );
  if (exact) return `ws://localhost:${exact.port}`;

  // Partial match (branch contains target)
  const partial = results.find(
    (r) =>
      r.gitBranch?.toLowerCase().includes(lowerTarget) ||
      r.appName?.toLowerCase().includes(lowerTarget)
  );
  if (partial) return `ws://localhost:${partial.port}`;

  // List available servers for a helpful error
  const available = results
    .map((r) => `  port ${r.port}: branch=${r.gitBranch ?? '?'} app=${r.appName ?? '?'}`)
    .join('\n');
  throw new Error(
    `No server matching "${target}" found.\nAvailable servers:\n${available}`
  );
}

/**
 * Resolve the WebSocket URL to use. If --app was provided, scan for
 * a matching server. Otherwise use the default/env URL.
 */
async function getWsUrl(): Promise<string> {
  if (resolvedWsUrl) return resolvedWsUrl;
  resolvedWsUrl = DEFAULT_WS_URL;
  return resolvedWsUrl;
}

/**
 * Check if the Sweetlink WebSocket server is alive.
 * Uses the HTTP info endpoint (same port as WS) for a fast, non-blocking check.
 * Returns true if the server responds with its package info, false otherwise.
 */
async function checkSweetlinkAlive(wsUrl?: string): Promise<boolean> {
  const effectiveUrl = wsUrl ?? (await getWsUrl());
  try {
    // Convert ws:// URL to http:// for the health check
    const httpUrl = effectiveUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(httpUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return false;
    const data = await response.json();
    return data?.name === '@ytspar/sweetlink';
  } catch {
    return false;
  }
}

/**
 * Wait for a server to be ready by polling the URL
 * @param url Target URL to check
 * @param timeout Maximum time to wait in ms
 * @returns true if server is ready, throws if timeout
 */
async function waitForServer(
  url: string,
  timeout: number = SERVER_READY_TIMEOUT
): Promise<boolean> {
  const startTime = Date.now();
  let lastError: Error | null = null;

  // Parse URL to get just the origin for health check
  const parsedUrl = new URL(url);
  const healthCheckUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

  console.log(`[Sweetlink] Waiting for server at ${healthCheckUrl}...`);

  while (Date.now() - startTime < timeout) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(healthCheckUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok || response.status === 304) {
        console.log(`[Sweetlink] Server ready (${Date.now() - startTime}ms)`);
        return true;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Server not ready yet, wait and retry
    }

    await new Promise((resolve) => setTimeout(resolve, SERVER_POLL_INTERVAL));
  }

  throw new Error(
    `Server not ready after ${timeout}ms: ${lastError?.message || 'Connection refused'}`
  );
}

async function sendCommand(
  command: SweetlinkCommand,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<SweetlinkResponse> {
  const wsUrl = await getWsUrl();
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);

    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('Command timeout - is the dev server running?'));
    }, timeoutMs);

    ws.on('open', () => {
      ws.send(JSON.stringify(command));
    });

    ws.on('message', (data: Buffer) => {
      clearTimeout(timer);
      const response = JSON.parse(data.toString()) as SweetlinkResponse;
      ws.close();
      resolve(response);
    });

    ws.on('error', (error) => {
      clearTimeout(timer);
      ws.close();
      reject(error);
    });
  });
}

/**
 * Compare two URLs ignoring trailing slashes.
 * Exported-style name for testability (re-implemented in tests).
 */
function urlsMatch(a: string, b: string): boolean {
  return a.replace(/\/+$/, '') === b.replace(/\/+$/, '');
}

const NAVIGATE_POLL_INTERVAL = 500; // ms between reconnection polls
const NAVIGATE_DEFAULT_TIMEOUT = 10000; // 10s default

/**
 * Navigate the connected browser to a URL via WebSocket exec-js.
 * After navigation the page reloads, dropping the WS connection.
 * We poll with short-timeout exec-js commands until devbar reconnects.
 *
 * @returns true if the browser is on the target URL, false if no browser
 *          is connected or reconnection timed out.
 */
async function navigateBrowser(
  url: string,
  timeout: number = NAVIGATE_DEFAULT_TIMEOUT
): Promise<boolean> {
  // 1. Check current URL
  try {
    const response = await sendCommand({ type: 'exec-js', code: 'window.location.href' }, 3000);
    if (response.success && response.data != null) {
      const currentUrl = String((response.data as { result?: unknown }).result ?? response.data);
      if (urlsMatch(currentUrl, url)) {
        console.log(`[Sweetlink] Browser already on ${url}`);
        return true;
      }
    }
  } catch {
    // No browser connected — caller should escalate
    return false;
  }

  // 2. Navigate
  console.log(`[Sweetlink] Navigating browser to ${url}`);
  try {
    // Fire-and-forget: the page will unload, so the response may never arrive
    await sendCommand(
      { type: 'exec-js', code: `window.location.href = ${JSON.stringify(url)}` },
      3000
    ).catch(() => {});
  } catch {
    // Expected — page unloaded before response
  }

  // 3. Poll for reconnection
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    await new Promise((resolve) => setTimeout(resolve, NAVIGATE_POLL_INTERVAL));
    try {
      const response = await sendCommand({ type: 'exec-js', code: 'window.location.href' }, 3000);
      if (response.success) {
        // Give devbar time to fully initialize after page load
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log(`[Sweetlink] Browser reconnected on new page`);
        return true;
      }
    } catch {
      // Still reconnecting — keep polling
    }
  }

  console.warn(`[Sweetlink] Browser did not reconnect within ${timeout}ms`);
  return false;
}

const WAIT_FOR_POLL_INTERVAL = 200; // ms between DOM polls
const WAIT_FOR_DEFAULT_TIMEOUT = 10000; // 10s default

/**
 * Poll the DOM via WebSocket until a selector matches at least one element.
 * Used by --wait-for to handle hydration timing issues with frameworks like Next.js.
 */
async function waitForSelector(
  selector: string,
  timeout: number = WAIT_FOR_DEFAULT_TIMEOUT
): Promise<void> {
  const startTime = Date.now();
  console.log(`[Sweetlink] Waiting for selector: ${selector}`);

  while (Date.now() - startTime < timeout) {
    try {
      const response = await sendCommand({
        type: 'query-dom',
        selector,
      });

      if (response.success) {
        const data = response.data as Record<string, unknown>;
        const count = data.count as number;
        if (count > 0) {
          console.log(
            `[Sweetlink] ✓ Selector found (${count} element${count > 1 ? 's' : ''}, ${Date.now() - startTime}ms)`
          );
          return;
        }
      }
    } catch {
      // Server not ready yet, keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_POLL_INTERVAL));
  }

  throw new Error(`Timeout: selector "${selector}" not found after ${timeout}ms`);
}

/**
 * Run Playwright screenshot, report success, and return a ScreenshotData result.
 * Consolidates the repeated ensureDir + screenshotViaPlaywright + reportSuccess + return pattern.
 */
async function takePlaywrightScreenshot(
  options: {
    selector?: string;
    output?: string;
    fullPage?: boolean;
    viewport?: string;
    hover?: boolean;
    url?: string;
  },
  method: string
): Promise<ScreenshotData> {
  const outputPath = options.output || getDefaultScreenshotPath();
  ensureDir(outputPath);
  const result = await screenshotViaPlaywright({
    selector: options.selector,
    output: outputPath,
    fullPage: options.fullPage,
    viewport: options.viewport,
    hover: options.hover,
    url: options.url,
  });
  reportScreenshotSuccess(outputPath, result.width, result.height, method, options.selector);
  return {
    path: getRelativePath(outputPath),
    width: result.width,
    height: result.height,
    method,
    selector: options.selector,
  };
}

async function screenshot(options: {
  selector?: string;
  output?: string;
  fullPage?: boolean;
  forceCDP?: boolean;
  forceWS?: boolean;
  a11y?: boolean;
  viewport?: string;
  width?: number;
  height?: number;
  hover?: boolean;
  url?: string;
  wait?: boolean;
  waitTimeout?: number;
}): Promise<ScreenshotData> {
  // Convert --width/--height to viewport format if provided
  if (options.width && !options.viewport) {
    const height = options.height || Math.round(options.width * 1.5); // Default aspect ratio
    options.viewport = `${options.width}x${height}`;
  }

  const targetUrl = options.url || 'http://localhost:3000';

  // Auto-wait for server if --wait flag is set or if URL is provided
  // This eliminates the need for external sleep workarounds
  if (options.wait !== false) {
    try {
      await waitForServer(targetUrl, options.waitTimeout || SERVER_READY_TIMEOUT);
    } catch (error) {
      console.error(
        '[Sweetlink] Server not available:',
        error instanceof Error ? error.message : error
      );
      console.error(
        '[Sweetlink] Hint: Start your dev server with "pnpm run dev" or use --no-wait to skip'
      );
      process.exit(1);
    }
  }

  console.log('[Sweetlink] Taking screenshot...');

  // Warn if using /tmp/ instead of .tmp/ (project-relative path is preferred)
  if (options.output?.startsWith('/tmp/')) {
    console.warn(
      '[Sweetlink] ⚠️  Warning: Using /tmp/ for output. Consider using .tmp/screenshots/ instead for project-relative paths.'
    );
    console.warn('[Sweetlink]    Example: --output .tmp/screenshots/my-screenshot.png');
  }

  // Pre-flight: verify Sweetlink server is alive before launching expensive Playwright
  // This prevents launching a headless browser only to discover the dev server is dead.
  const serverAlive = await checkSweetlinkAlive();
  if (!serverAlive && !options.forceCDP) {
    console.warn('[Sweetlink] Sweetlink server not responding — will use Playwright standalone');
  }

  // Check if CDP is available (unless force WS is specified)
  // Hover requires CDP/Playwright
  const requiresCDP = options.forceCDP || options.hover;

  const playwrightOpts = {
    selector: options.selector,
    output: options.output,
    fullPage: options.fullPage,
    viewport: options.viewport,
    hover: options.hover,
    url: options.url,
  };

  // If we need CDP/Playwright (for hover or force-cdp), or if CDP is available, use Playwright
  // Playwright will auto-launch if CDP is not available
  const shouldTryPlaywright = requiresCDP || (!options.forceWS && (await detectCDP()));

  if (shouldTryPlaywright) {
    console.log('[Sweetlink] Using Playwright for screenshot');

    try {
      return await takePlaywrightScreenshot(playwrightOpts, 'Playwright (Auto-launch/CDP)');
    } catch (error) {
      if (options.forceCDP) {
        console.error(
          '[Sweetlink] CDP screenshot failed:',
          error instanceof Error ? error.message : error
        );
        process.exit(1);
      }

      console.warn('[Sweetlink] CDP failed, falling back to WebSocket method');
      console.warn(`[Sweetlink] Error: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Fall back to WebSocket method
  // Navigate the connected browser if --url is provided
  if (options.url) {
    const navigated = await navigateBrowser(options.url);
    if (!navigated) {
      if (options.forceWS) {
        console.error('[Sweetlink] Could not navigate browser to', options.url);
        process.exit(1);
      }
      // Auto-escalate to Playwright (opens browser, navigates, screenshots)
      console.log('[Sweetlink] No browser for navigation — escalating to Playwright');
      return await takePlaywrightScreenshot(playwrightOpts, 'Playwright (auto-escalation)');
    }
  }

  console.log('[Sweetlink] Using WebSocket for screenshot');

  const command: SweetlinkCommand = {
    type: 'screenshot',
    selector: options.selector,
    options: {
      fullPage: options.fullPage,
      a11y: options.a11y,
      scale: 0.5,
    },
  };

  try {
    const response = await sendCommand(command);

    if (!response.success) {
      // Auto-escalate to Playwright when no browser client is connected
      // This happens after dev server restart when browser page hasn't been refreshed
      if (response.error?.includes('No browser client connected')) {
        console.log('[Sweetlink] No browser client - auto-escalating to Playwright');

        try {
          return await takePlaywrightScreenshot(playwrightOpts, 'Playwright (auto-escalation)');
        } catch (playwrightError) {
          console.error(
            '[Sweetlink] Playwright fallback also failed:',
            playwrightError instanceof Error ? playwrightError.message : playwrightError
          );
          process.exit(1);
        }
      }

      console.error('[Sweetlink] Screenshot failed:', response.error);
      process.exit(1);
    }

    // Save screenshot
    const outputPath = options.output || getDefaultScreenshotPath();
    ensureDir(outputPath);
    const data = response.data as Record<string, unknown>;
    const base64Data = (data.screenshot as string).replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));

    reportScreenshotSuccess(
      outputPath,
      data.width as number,
      data.height as number,
      'WebSocket (html2canvas)',
      data.selector as string | undefined
    );

    return {
      path: getRelativePath(outputPath),
      width: data.width as number,
      height: data.height as number,
      method: 'WebSocket (html2canvas)',
      selector: data.selector as string | undefined,
    };
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function queryDOM(options: {
  selector: string;
  property?: string;
  waitFor?: string;
  waitTimeout?: number;
}): Promise<QueryData> {
  // Wait for selector if requested (handles hydration timing)
  if (options.waitFor) {
    await waitForSelector(options.waitFor, options.waitTimeout);
    // If --wait-for matches --selector and no --property, the poll already found elements — skip redundant query
    if (options.waitFor === options.selector && !options.property) {
      return { count: 1, results: [], property: undefined };
    }
  }

  console.log(`[Sweetlink] Querying DOM: ${options.selector}`);

  const command: SweetlinkCommand = {
    type: 'query-dom',
    selector: options.selector,
    property: options.property,
  };

  try {
    const response = await sendCommand(command);

    if (!response.success) {
      // If CSP blocked, fall back to Playwright
      if (isCspError(response.error)) {
        console.log('[Sweetlink] CSP blocked query, falling back to Playwright...');
        const escapedSelector = JSON.stringify(options.selector);
        const queryCode = options.property
          ? `Array.from(document.querySelectorAll(${escapedSelector})).map(el => el[${JSON.stringify(options.property)}])`
          : `Array.from(document.querySelectorAll(${escapedSelector})).map((el, i) => ({ index: i, tagName: el.tagName, id: el.id, className: el.className, textContent: (el.textContent || '').substring(0, 100) }))`;

        const results = (await execViaPlaywrightOrExit(queryCode)) as unknown[];
        console.log(`[Sweetlink] ✓ Found ${results.length} elements (via Playwright)`);
        if (options.property) {
          console.log('\nValues:');
          results.forEach((value: unknown, index: number) => {
            console.log(`  [${index}] ${JSON.stringify(value)}`);
          });
        } else {
          console.log('\nElements:');
          console.log(JSON.stringify(results, null, 2));
        }
        return { count: results.length, results, property: options.property };
      }

      console.error('[Sweetlink] Query failed:', response.error);
      process.exit(1);
    }

    const data = response.data as Record<string, unknown>;
    console.log(`[Sweetlink] ✓ Found ${data.count} elements`);

    if (options.property) {
      // If querying a property, show the values
      console.log('\nValues:');
      (data.results as unknown[]).forEach((value: unknown, index: number) => {
        console.log(`  [${index}] ${JSON.stringify(value)}`);
      });
    } else {
      // Show element info
      console.log('\nElements:');
      console.log(JSON.stringify(data.results, null, 2));
    }

    return {
      count: data.count as number,
      results: data.results as unknown[],
      property: options.property,
    };
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

interface LogEntry {
  level: string;
  message: string;
  timestamp: number;
}

interface DedupedLog {
  level: string;
  message: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

function deduplicateLogs(logs: LogEntry[]): DedupedLog[] {
  const seen = new Map<string, DedupedLog>();

  for (const log of logs) {
    // Create a key from level + first 200 chars of message (to group similar errors)
    const msgKey = log.message.substring(0, 200);
    const key = `${log.level}:${msgKey}`;

    const existing = seen.get(key);
    if (existing) {
      existing.count++;
      existing.lastSeen = Math.max(existing.lastSeen, log.timestamp);
    } else {
      seen.set(key, {
        level: log.level,
        message: log.message,
        count: 1,
        firstSeen: log.timestamp,
        lastSeen: log.timestamp,
      });
    }
  }

  // Sort by level (errors first) then by count
  return Array.from(seen.values()).sort((a, b) => {
    const levelOrder = { error: 0, warn: 1, info: 2, log: 3 };
    const aOrder = levelOrder[a.level as keyof typeof levelOrder] ?? 4;
    const bOrder = levelOrder[b.level as keyof typeof levelOrder] ?? 4;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.count - a.count;
  });
}

/**
 * Render console logs to stdout in human-readable text format with ANSI colors.
 */
function renderLogsAsText(logs: LogEntry[], dedupedLogs: DedupedLog[] | null): void {
  const LEVEL_COLORS: Record<string, string> = {
    error: '\x1b[31m',
    warn: '\x1b[33m',
    info: '\x1b[36m',
    log: '\x1b[37m',
  };
  const reset = '\x1b[0m';

  console.log(
    `[Sweetlink] ✓ Found ${logs.length} log entries${dedupedLogs ? ` (${dedupedLogs.length} unique)` : ''}`
  );

  if (logs.length === 0) {
    console.log('  No logs found');
    return;
  }

  console.log('\nConsole Logs:');

  if (dedupedLogs) {
    dedupedLogs.forEach((log) => {
      const levelColor = LEVEL_COLORS[log.level] || '\x1b[37m';
      const countStr = log.count > 1 ? ` (×${log.count})` : '';
      console.log(
        `  ${levelColor}[${log.level.toUpperCase()}]${reset}${countStr} - ${log.message}`
      );
    });
  } else {
    logs.forEach((log) => {
      const levelColor = LEVEL_COLORS[log.level] || '\x1b[37m';
      const time = new Date(log.timestamp).toLocaleTimeString();
      console.log(`  ${levelColor}[${log.level.toUpperCase()}]${reset} ${time} - ${log.message}`);
    });
  }
}

async function getLogs(options: {
  filter?: string;
  format?: 'text' | 'json' | 'summary';
  dedupe?: boolean;
  output?: string;
}): Promise<LogsData> {
  if (options.format === 'text') {
    console.log('[Sweetlink] Getting console logs...');
  }

  const command: SweetlinkCommand = {
    type: 'get-logs',
    filter: options.filter,
  };

  try {
    const response = await sendCommand(command);

    if (!response.success) {
      console.error('[Sweetlink] Get logs failed:', response.error);
      process.exit(1);
    }

    const logs = response.data as LogEntry[];

    // JSON format - compact, parseable output
    if (options.format === 'json') {
      const processedLogs = options.dedupe ? deduplicateLogs(logs) : logs;
      const jsonData = options.dedupe
        ? { deduped: true, logs: processedLogs }
        : { deduped: false, logs: processedLogs };
      const jsonStr = JSON.stringify(jsonData, null, 2);
      if (options.output) {
        ensureDir(options.output);
        fs.writeFileSync(options.output, jsonStr);
        console.log(`[Sweetlink] ✓ Logs saved to: ${getRelativePath(options.output)}`);
      } else {
        console.log(jsonStr);
      }
      return {
        total: logs.length,
        format: 'json',
        deduped: !!options.dedupe,
        logs: processedLogs,
        outputPath: options.output,
      };
    }

    // Summary format - deduplicated with counts, optimized for LLM context
    if (options.format === 'summary') {
      const deduped = deduplicateLogs(logs);
      const summary = {
        total: logs.length,
        unique: deduped.length,
        byLevel: {
          error: deduped.filter((l) => l.level === 'error').length,
          warn: deduped.filter((l) => l.level === 'warn').length,
          info: deduped.filter((l) => l.level === 'info').length,
          log: deduped.filter((l) => l.level === 'log').length,
        },
        entries: deduped.map((l) => ({
          level: l.level,
          count: l.count,
          message: l.message.length > 500 ? `${l.message.substring(0, 500)}...` : l.message,
        })),
      };
      const summaryStr = JSON.stringify(summary, null, 2);
      if (options.output) {
        ensureDir(options.output);
        fs.writeFileSync(options.output, summaryStr);
        console.log(`[Sweetlink] ✓ Logs saved to: ${getRelativePath(options.output)}`);
      } else {
        console.log(summaryStr);
      }
      return {
        total: logs.length,
        format: 'summary',
        deduped: true,
        logs: deduped,
        outputPath: options.output,
      };
    }

    // Default text format
    const displayLogs = options.dedupe ? deduplicateLogs(logs) : null;
    renderLogsAsText(logs, displayLogs);

    return {
      total: logs.length,
      format: 'text',
      deduped: !!options.dedupe,
      logs: displayLogs || logs,
      outputPath: undefined,
    };
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Check if a response error is a CSP eval block
 */
function isCspError(error?: string): boolean {
  if (!error) return false;
  return error.includes('unsafe-eval') || error.includes('Content Security Policy');
}

/**
 * Execute JavaScript via Playwright (bypasses CSP).
 * Playwright's page.evaluate runs via DevTools protocol, which is not subject to CSP.
 */
async function execViaPlaywright(code: string): Promise<unknown> {
  let playwrightModule: typeof import('playwright');
  try {
    playwrightModule = await import('playwright');
  } catch {
    throw new Error(
      'Playwright is not installed. Install it to use CSP-bypassing fallback:\n  pnpm add playwright'
    );
  }

  const CDP_URL = process.env.CHROME_CDP_URL || 'http://localhost:9222';
  let browser: Awaited<ReturnType<typeof playwrightModule.chromium.connectOverCDP>>;

  // Try connecting to existing Chrome CDP first (reuse browser, don't close it)
  try {
    browser = await playwrightModule.chromium.connectOverCDP(CDP_URL);
  } catch {
    // No CDP available — launch a headless browser
    browser = await playwrightModule.chromium.launch({ headless: true });
  }

  try {
    const contexts = browser.contexts();
    let page: Awaited<ReturnType<typeof browser.newPage>> | undefined;

    if (contexts.length > 0) {
      const pages = contexts[0]!.pages();
      const devUrl = new URL(process.env.SWEETLINK_DEV_URL || 'http://localhost:3000');
      const devHost = devUrl.hostname;
      const devPort = devUrl.port || (devUrl.protocol === 'https:' ? '443' : '80');
      page = pages.find(
        (p: { url: () => string }) =>
          p.url().includes(`${devHost}:${devPort}`) || p.url().includes(`127.0.0.1:${devPort}`)
      );
      if (!page && pages.length > 0) {
        page = pages[0];
      }
    }

    if (!page) {
      const context = contexts[0] || (await browser.newContext());
      page = await context.newPage();
      await page.goto(process.env.SWEETLINK_DEV_URL || 'http://localhost:3000', {
        waitUntil: 'domcontentloaded',
      });
    }

    // page.evaluate bypasses CSP since it runs via DevTools protocol
    const result = await page.evaluate((jsCode: string) => {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      return Function(`"use strict"; return (${jsCode})`)();
    }, code);

    return result;
  } finally {
    // For CDP connections this disconnects; for launched browsers this closes.
    // Playwright's .close() handles both cases correctly.
    await browser.close();
  }
}

/**
 * Run code via Playwright with standardized error handling.
 * On failure, logs the error and exits the process.
 */
async function execViaPlaywrightOrExit(code: string): Promise<unknown> {
  try {
    return await execViaPlaywright(code);
  } catch (error) {
    console.error(
      '[Sweetlink] Playwright fallback also failed:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

async function execJS(options: {
  code: string;
  waitFor?: string;
  waitTimeout?: number;
}): Promise<ExecData> {
  // Wait for selector if requested (handles hydration timing)
  if (options.waitFor) {
    await waitForSelector(options.waitFor, options.waitTimeout);
  }

  console.log('[Sweetlink] Executing JavaScript...');

  const command: SweetlinkCommand = {
    type: 'exec-js',
    code: options.code,
  };

  try {
    const response = await sendCommand(command);

    if (!response.success) {
      // If CSP blocked execution, fall back to Playwright which bypasses CSP
      if (isCspError(response.error)) {
        console.log('[Sweetlink] CSP blocked eval, falling back to Playwright...');
        const result = await execViaPlaywrightOrExit(options.code);
        console.log('[Sweetlink] ✓ Result (via Playwright):');
        console.log(JSON.stringify({ result, type: typeof result }, null, 2));
        return { result };
      }

      console.error('[Sweetlink] Execution failed:', response.error);
      process.exit(1);
    }

    console.log('[Sweetlink] ✓ Result:');
    console.log(JSON.stringify(response.data, null, 2));

    return { result: response.data };
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Generate JavaScript code that finds elements and clicks the one at the given index.
 * Parameterized by the element-finding strategy: text content search or CSS selector.
 */
function generateClickCode(
  strategy:
    | { type: 'text'; text: string; selector: string }
    | { type: 'selector'; selector: string },
  index: number
): string {
  // The element-finding expression differs, but the bounds-check + click + return is shared
  const escapedSelector = JSON.stringify(strategy.selector);
  let findExpression: string;
  let notFoundMsg: string;

  if (strategy.type === 'text') {
    const escapedText = JSON.stringify(strategy.text);
    findExpression = `Array.from(document.querySelectorAll(${escapedSelector})).filter(el => el.textContent?.includes(${escapedText}))`;
    notFoundMsg = `"No element found with text: " + ${escapedText}`;
  } else {
    findExpression = `Array.from(document.querySelectorAll(${escapedSelector}))`;
    notFoundMsg = `"No element found matching: " + ${escapedSelector}`;
  }

  return `
      (() => {
        const elements = ${findExpression};
        if (elements.length === 0) {
          return { success: false, error: ${notFoundMsg} };
        }
        const target = elements[${index}];
        if (!target) {
          return { success: false, error: "Index ${index} out of bounds, found " + elements.length + " elements" };
        }
        target.click();
        return { success: true, clicked: target.tagName + (target.className ? "." + target.className.split(" ")[0] : ""), found: elements.length };
      })()
    `;
}

async function click(options: {
  selector?: string;
  text?: string;
  index?: number;
}): Promise<ClickData> {
  const { selector, text, index = 0 } = options;

  if (!selector && !text) {
    console.error('[Sweetlink] Error: Either --selector or --text is required');
    process.exit(1);
  }

  let clickCode: string;
  let description: string;

  if (text) {
    const baseSelector = selector || '*';
    description = selector ? `"${text}" within ${selector}` : `"${text}"`;
    clickCode = generateClickCode({ type: 'text', text, selector: baseSelector }, index);
  } else {
    description = `${selector}${index > 0 ? ` [${index}]` : ''}`;
    clickCode = generateClickCode({ type: 'selector', selector: selector! }, index);
  }

  console.log(`[Sweetlink] Clicking: ${description}`);

  // Debug: log the generated code
  if (process.env.DEBUG) {
    console.log('[Sweetlink] Generated code:', clickCode);
  }

  const command: SweetlinkCommand = {
    type: 'exec-js',
    code: clickCode.trim(),
  };

  try {
    const response = await sendCommand(command);

    if (!response.success) {
      // If CSP blocked execution, fall back to Playwright
      if (isCspError(response.error)) {
        console.log('[Sweetlink] CSP blocked eval, falling back to Playwright...');
        const playwrightResult = await execViaPlaywrightOrExit(clickCode.trim());
        const result = playwrightResult as {
          success?: boolean;
          clicked?: string;
          found?: number;
          error?: string;
        } | null;
        if (result && typeof result === 'object' && 'success' in result) {
          if (!result.success) {
            console.error(`[Sweetlink] ✗ ${result.error}`);
            process.exit(1);
          }
          console.log(
            `[Sweetlink] ✓ Clicked (via Playwright): ${result.clicked}${result.found && result.found > 1 ? ` (${result.found} matches, used index ${index})` : ''}`
          );
          return { clicked: result.clicked || 'unknown', found: result.found || 1, index };
        } else {
          console.log('[Sweetlink] ✓ Click executed (via Playwright)');
          return { clicked: 'unknown', found: 1, index };
        }
      }

      console.error('[Sweetlink] Click failed:', response.error);
      process.exit(1);
    }

    const result = response.data;
    if (result === undefined || result === null) {
      // This shouldn't happen with trimmed code, but handle gracefully
      console.log('[Sweetlink] ✓ Click executed');
      return { clicked: 'unknown', found: 1, index };
    }

    if (typeof result === 'object' && 'success' in result) {
      const clickResult = result as {
        success?: boolean;
        clicked?: string;
        found?: number;
        error?: string;
      };
      if (!clickResult.success) {
        console.error(`[Sweetlink] ✗ ${clickResult.error}`);
        process.exit(1);
      }
      console.log(
        `[Sweetlink] ✓ Clicked: ${clickResult.clicked}${clickResult.found && clickResult.found > 1 ? ` (${clickResult.found} matches, used index ${index})` : ''}`
      );
      return { clicked: clickResult.clicked || 'unknown', found: clickResult.found || 1, index };
    } else {
      // Result is just a value, not our expected object
      console.log(`[Sweetlink] ✓ Click executed`);
      return { clicked: 'unknown', found: 1, index };
    }
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function refresh(options: { hard?: boolean }): Promise<RefreshData> {
  console.log('[Sweetlink] Refreshing page...');

  const command: SweetlinkCommand = {
    type: 'refresh',
    options: {
      hard: options.hard,
    },
  };

  try {
    const response = await sendCommand(command);

    if (!response.success) {
      console.error('[Sweetlink] Refresh failed:', response.error);
      process.exit(1);
    }

    console.log(`[Sweetlink] ✓ Page refreshed${options.hard ? ' (hard reload)' : ''}`);

    return { hard: !!options.hard };
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function ruler(options: {
  selectors?: string[];
  preset?: 'card-header' | 'navigation';
  output?: string;
  url?: string;
  showCenterLines?: boolean;
  showDimensions?: boolean;
  showPosition?: boolean;
  showAlignment?: boolean;
  limit?: number;
  format?: 'text' | 'json';
}): Promise<RulerData> {
  console.log('[Sweetlink] Pixel Ruler - Measuring elements...');

  // Determine selectors from preset or explicit
  let selectors = options.selectors || [];

  if (options.preset === 'card-header') {
    const preset = getCardHeaderPreset();
    selectors = preset.selectors;
    console.log('[Sweetlink] Using card-header preset');
  } else if (options.preset === 'navigation') {
    const preset = getNavigationPreset();
    selectors = preset.selectors;
    console.log('[Sweetlink] Using navigation preset');
  }

  if (selectors.length === 0) {
    console.error('[Sweetlink] Error: At least one --selector is required, or use --preset');
    process.exit(1);
  }

  try {
    const result = await measureViaPlaywright({
      selectors,
      url: options.url,
      output: options.output,
      showCenterLines: options.showCenterLines ?? true,
      showDimensions: options.showDimensions ?? true,
      showPosition: options.showPosition ?? false,
      showAlignment: options.showAlignment ?? true,
      limit: options.limit ?? 5,
    });

    if (options.format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n[Sweetlink Ruler] Results:`);
      console.log(`  Summary: ${result.summary}`);

      if (result.alignment) {
        const { verticalOffset, horizontalOffset, aligned } = result.alignment;
        const status = aligned ? '\x1b[32m✓ ALIGNED\x1b[0m' : '\x1b[31m✗ NOT ALIGNED\x1b[0m';
        console.log(`  Alignment: Δy=${verticalOffset}px, Δx=${horizontalOffset}px ${status}`);
      }

      result.results.forEach((r, i) => {
        console.log(`\n  [${i + 1}] ${r.selector}:`);
        r.elements.forEach((el) => {
          console.log(
            `      Element ${el.index}: ${Math.round(el.rect.width)}×${Math.round(el.rect.height)} @ (${Math.round(el.rect.left)}, ${Math.round(el.rect.top)})`
          );
          console.log(`        Center: (${Math.round(el.centerX)}, ${Math.round(el.centerY)})`);
        });
      });

      if (result.screenshotPath) {
        console.log(`\n[Sweetlink Ruler] ✓ Screenshot with overlay: ${result.screenshotPath}`);
      }
    }

    return {
      summary: result.summary,
      alignment: result.alignment,
      results: result.results,
      screenshotPath: result.screenshotPath,
    };
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function getNetwork(options: { filter?: string }): Promise<NetworkData> {
  console.log('[Sweetlink] Getting network requests (requires CDP)...');

  // Check if CDP is available
  const hasCDP = await detectCDP();

  if (!hasCDP) {
    console.error(
      '[Sweetlink] CDP not available. Network inspection requires Chrome DevTools Protocol.'
    );
    console.error(
      '[Sweetlink] Start Chrome with: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222'
    );
    process.exit(1);
  }

  try {
    const requests = await getNetworkRequestsViaCDP({ filter: options.filter });

    console.log(`[Sweetlink] ✓ Found ${requests.length} network requests`);

    if (requests.length > 0) {
      console.log('\nNetwork Requests:');
      requests.forEach((req, index) => {
        const statusColor = req.status
          ? req.status >= 200 && req.status < 300
            ? '\x1b[32m'
            : req.status >= 400
              ? '\x1b[31m'
              : '\x1b[33m'
          : '\x1b[37m';

        const reset = '\x1b[0m';

        console.log(`\n  ${index + 1}. ${req.method} ${req.url}`);
        if (req.status) {
          console.log(`     Status: ${statusColor}${req.status}${reset} ${req.statusText || ''}`);
        }
        if (req.resourceType) {
          console.log(`     Type: ${req.resourceType}`);
        }
      });
    } else {
      console.log('  No requests found');
    }

    return { total: requests.length, requests };
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

interface SweetlinkServerInfo {
  port: number;
  name?: string;
  version?: string;
  appPort?: number;
  connectedClients?: number;
  status?: string;
}

/**
 * Check if a port has a Sweetlink server running
 */
async function checkPort(port: number): Promise<SweetlinkServerInfo | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);

    const response = await fetch(`http://localhost:${port}`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      // Check if it's a Sweetlink server by looking for our package name
      if (data.name === '@ytspar/sweetlink') {
        return { port, ...data };
      }
    }
  } catch {
    // Port not responding or not a Sweetlink server
  }
  return null;
}

/**
 * Get list of ports to scan for Sweetlink servers
 */
function getPortsToScan(): number[] {
  const ports = new Set<number>();

  // Default port range (9223-9233)
  for (let i = 0; i <= MAX_PORT_RETRIES; i++) {
    ports.add(DEFAULT_WS_PORT + i);
  }

  // Common app ports + offset (e.g., 3000 -> 9223, 5173 -> 11396)
  for (const appPort of COMMON_APP_PORTS) {
    const wsPort = appPort + WS_PORT_OFFSET;
    for (let i = 0; i <= MAX_PORT_RETRIES; i++) {
      ports.add(wsPort + i);
    }
  }

  return Array.from(ports).sort((a, b) => a - b);
}

/**
 * Attempt to gracefully close a Sweetlink server via WebSocket
 */
async function closeServerGracefully(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const timeout = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 2000);

    ws.on('open', () => {
      // Send a shutdown command (server should handle this)
      ws.send(JSON.stringify({ type: 'shutdown' }));
      // Give it time to process
      setTimeout(() => {
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      }, 500);
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * Find a working lsof path across different systems
 */
async function findLsofPath(): Promise<string> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  // macOS: /usr/sbin/lsof, Linux: /usr/bin/lsof, fallback: PATH lookup
  const candidates = ['/usr/sbin/lsof', '/usr/bin/lsof', 'lsof'];

  for (const path of candidates) {
    try {
      await execAsync(`${path} -v`);
      return path;
    } catch {
      // Try next path
    }
  }

  return 'lsof'; // Fallback to PATH lookup
}

/**
 * Find and kill process using a specific port (fallback method)
 */
async function killProcessOnPort(port: number): Promise<boolean> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  const lsofPath = await findLsofPath();

  try {
    const { stdout } = await execFileAsync(lsofPath, ['-ti', `:${port}`]);
    const pids = stdout.trim().split('\n').filter(Boolean);

    if (pids.length === 0) {
      return false;
    }

    for (const pid of pids) {
      if (!/^\d+$/.test(pid)) continue;
      try {
        await execFileAsync('/bin/kill', ['-9', pid]);
        console.log(`  Killed process ${pid} on port ${port}`);
      } catch {
        // Process may have already exited
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Cleanup stale Sweetlink servers
 */
async function cleanup(options: { force?: boolean; verbose?: boolean }): Promise<CleanupData> {
  console.log('[Sweetlink] Scanning for stale servers...\n');

  const portsToScan = getPortsToScan();

  // Scan all ports in parallel and filter to found servers
  const scanResults = await Promise.all(portsToScan.map(checkPort));
  const foundServers = scanResults.filter((info): info is SweetlinkServerInfo => info !== null);

  if (foundServers.length === 0) {
    console.log('[Sweetlink] No stale servers found.');
    return { found: 0, closed: 0, failed: 0 };
  }

  console.log(`[Sweetlink] Found ${foundServers.length} server(s):\n`);

  for (const server of foundServers) {
    const appInfo = server.appPort ? ` (app port: ${server.appPort})` : '';
    const clientInfo =
      server.connectedClients !== undefined ? `, ${server.connectedClients} clients` : '';
    console.log(`  Port ${server.port}${appInfo}${clientInfo}`);
  }

  console.log('');

  // Attempt to close each server
  let closedCount = 0;
  let failedCount = 0;

  for (const server of foundServers) {
    process.stdout.write(`  Closing server on port ${server.port}... `);

    // Try graceful shutdown first
    const graceful = await closeServerGracefully(server.port);

    if (graceful) {
      // Wait a moment for the port to be released
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify it's actually closed
      const stillRunning = await checkPort(server.port);
      if (!stillRunning) {
        console.log('\x1b[32m✓ closed\x1b[0m');
        closedCount++;
        continue;
      }
    }

    // Graceful shutdown failed or server still running, try force kill
    if (options.force) {
      const killed = await killProcessOnPort(server.port);
      if (killed) {
        console.log('\x1b[33m✓ force killed\x1b[0m');
        closedCount++;
      } else {
        console.log('\x1b[31m✗ failed\x1b[0m');
        failedCount++;
      }
    } else {
      console.log('\x1b[33m⚠ still running (use --force to kill)\x1b[0m');
      failedCount++;
    }
  }

  console.log('');
  if (closedCount > 0) {
    console.log(`[Sweetlink] ✓ Closed ${closedCount} server(s)`);
  }
  if (failedCount > 0) {
    console.log(`[Sweetlink] ⚠ ${failedCount} server(s) could not be closed`);
    if (!options.force) {
      console.log('[Sweetlink] Hint: Use --force to forcefully kill stale processes');
    }
    process.exit(1);
  }

  return { found: foundServers.length, closed: closedCount, failed: failedCount };
}

async function getSchema(options: {
  format?: 'text' | 'json';
  output?: string;
}): Promise<SchemaData> {
  console.log('[Sweetlink] Extracting page schema...');

  try {
    const response = await sendCommand({ type: 'get-schema' });

    if (!response.success) {
      console.error('[Sweetlink] Schema extraction failed:', response.error);
      process.exit(1);
    }

    const { schema, markdown } = response.data as Record<string, unknown>;

    if (options.format === 'json') {
      const output = JSON.stringify(schema, null, 2);
      if (options.output) {
        ensureDir(options.output);
        fs.writeFileSync(options.output, output);
        console.log(`[Sweetlink] ✓ Schema saved to: ${getRelativePath(options.output)}`);
      } else {
        console.log(output);
      }
    } else {
      if (options.output) {
        ensureDir(options.output);
        fs.writeFileSync(options.output, markdown as string);
        console.log(`[Sweetlink] ✓ Schema saved to: ${getRelativePath(options.output)}`);
      } else {
        console.log(markdown);
      }
    }

    return { schema, markdown: markdown as string, outputPath: options.output };
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function getOutline(options: {
  format?: 'text' | 'json' | 'markdown';
  output?: string;
}): Promise<OutlineData> {
  console.log('[Sweetlink] Extracting document outline...');

  try {
    const response = await sendCommand({ type: 'get-outline' });

    if (!response.success) {
      console.error('[Sweetlink] Outline extraction failed:', response.error);
      process.exit(1);
    }

    const { outline, markdown } = response.data as Record<string, unknown>;

    if (options.format === 'json') {
      const output = JSON.stringify(outline, null, 2);
      if (options.output) {
        ensureDir(options.output);
        fs.writeFileSync(options.output, output);
        console.log(`[Sweetlink] ✓ Outline saved to: ${getRelativePath(options.output)}`);
      } else {
        console.log(output);
      }
    } else {
      // Both 'text' and 'markdown' use the markdown format
      if (options.output) {
        ensureDir(options.output);
        fs.writeFileSync(options.output, markdown as string);
        console.log(`[Sweetlink] ✓ Outline saved to: ${getRelativePath(options.output)}`);
      } else {
        console.log(markdown);
      }
    }

    return { outline, markdown: markdown as string, outputPath: options.output };
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function getA11y(options: { format?: 'text' | 'json'; output?: string }): Promise<A11yData> {
  console.log('[Sweetlink] Running accessibility audit...');

  try {
    const response = await sendCommand({ type: 'get-a11y' });

    if (!response.success) {
      console.error('[Sweetlink] Accessibility audit failed:', response.error);
      process.exit(1);
    }

    const data = response.data as Record<string, unknown>;
    const result = data.result as Record<string, unknown>;
    const summary = data.summary as Record<string, unknown>;

    if (options.format === 'json') {
      const output = JSON.stringify({ result, summary }, null, 2);
      if (options.output) {
        ensureDir(options.output);
        fs.writeFileSync(options.output, output);
        console.log(`[Sweetlink] ✓ A11y report saved to: ${getRelativePath(options.output)}`);
      } else {
        console.log(output);
      }
    } else {
      // Text format - human-readable output
      const byImpact = summary.byImpact as Record<string, number>;
      console.log(`\n[Sweetlink] Accessibility Audit Results`);
      console.log(`  URL: ${result.url}`);
      console.log(`  Violations: ${summary.totalViolations}`);
      console.log(`  Passes: ${summary.totalPasses}`);
      console.log(`  Incomplete: ${summary.totalIncomplete}`);
      console.log(
        `  By Impact: critical=${byImpact.critical}, serious=${byImpact.serious}, moderate=${byImpact.moderate}, minor=${byImpact.minor}`
      );

      const violations = result.violations as {
        impact: string;
        help: string;
        description: string;
        nodes: unknown[];
      }[];
      if (violations.length > 0) {
        console.log('\n  Violations:');
        const impactOrder = ['critical', 'serious', 'moderate', 'minor'];
        const impactColors: Record<string, string> = {
          critical: '\x1b[31m',
          serious: '\x1b[33m',
          moderate: '\x1b[33m',
          minor: '\x1b[36m',
        };
        const reset = '\x1b[0m';

        for (const impact of impactOrder) {
          const filtered = violations.filter((v) => v.impact === impact);
          if (filtered.length === 0) continue;

          for (const v of filtered) {
            const color = impactColors[v.impact] || '';
            console.log(`    ${color}[${v.impact.toUpperCase()}]${reset} ${v.help}`);
            console.log(`      ${v.description}`);
            console.log(`      ${v.nodes.length} element(s) affected`);
          }
        }
      } else {
        console.log('\n  ✓ No violations found');
      }

      if (options.output) {
        ensureDir(options.output);
        fs.writeFileSync(options.output, JSON.stringify({ result, summary }, null, 2));
        console.log(`\n[Sweetlink] ✓ A11y report saved to: ${getRelativePath(options.output)}`);
      }
    }

    return { result, summary, outputPath: options.output };
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function getVitals(options: { format?: 'text' | 'json' }): Promise<VitalsData> {
  console.log('[Sweetlink] Collecting web vitals...');

  try {
    const response = await sendCommand({ type: 'get-vitals' });

    if (!response.success) {
      console.error('[Sweetlink] Vitals collection failed:', response.error);
      process.exit(1);
    }

    const { vitals, summary } = response.data as Record<string, unknown>;
    const vitalsData = vitals as Record<string, unknown>;

    if (options.format === 'json') {
      console.log(JSON.stringify(vitals, null, 2));
    } else {
      console.log(`\n[Sweetlink] Web Vitals`);
      console.log(`  URL: ${vitalsData.url}`);
      console.log(`  ${summary}`);

      // Detailed breakdown
      if (vitalsData.fcp !== null) {
        const fcp = vitalsData.fcp as number;
        const color = fcp <= 1800 ? '\x1b[32m' : fcp <= 3000 ? '\x1b[33m' : '\x1b[31m';
        console.log(`  FCP: ${color}${fcp}ms\x1b[0m`);
      }
      if (vitalsData.lcp !== null) {
        const lcp = vitalsData.lcp as number;
        const color = lcp <= 2500 ? '\x1b[32m' : lcp <= 4000 ? '\x1b[33m' : '\x1b[31m';
        console.log(`  LCP: ${color}${lcp}ms\x1b[0m`);
      }
      if (vitalsData.cls !== null) {
        const cls = vitalsData.cls as number;
        const color = cls <= 0.1 ? '\x1b[32m' : cls <= 0.25 ? '\x1b[33m' : '\x1b[31m';
        console.log(`  CLS: ${color}${cls}\x1b[0m`);
      }
      if (vitalsData.inp !== null) {
        const inp = vitalsData.inp as number;
        const color = inp <= 200 ? '\x1b[32m' : inp <= 500 ? '\x1b[33m' : '\x1b[31m';
        console.log(`  INP: ${color}${inp}ms\x1b[0m`);
      }
      if (vitalsData.pageSize !== null) {
        const sizeKB = Math.round((vitalsData.pageSize as number) / 1024);
        console.log(`  Page size: ${sizeKB}KB`);
      }
    }

    return { vitals, summary: summary as string };
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Per-command help text, keyed by canonical command name
const COMMAND_HELP: Record<string, string> = {
  screenshot: `  screenshot [options]
    Take a screenshot of the current page or element

    TWO-TIER STRATEGY:
      Tier 1 (Default): html2canvas via WebSocket
        - Captures viewport at 0.5x scale (PNG, typically 50-300KB)
        - Zero setup, works with any devbar-enabled page
        - Use --full-page to capture the entire scrollable page (larger files)

      Tier 2 (Escalation): Playwright/CDP
        - Pixel-perfect native Chrome rendering
        - Respects --viewport/--width/--height for custom dimensions
        - Use --force-cdp to force this method, or it auto-activates for --hover
        - Auto-launches headless browser if no browser connected

    Options:
      --url <url>                 Navigate browser to URL before capturing (default: http://localhost:3000)
                                  Navigates connected browser via WS; if none connected, opens one via Playwright
      --selector <css-selector>   CSS selector of element to screenshot
      --output <path>             Output file path (default: screenshot-<timestamp>.png)
      --full-page                 Capture full scrollable page (default: viewport only)
      --width <pixels>            Viewport width for Playwright (e.g., 768 for tablet, 375 for mobile)
      --height <pixels>           Viewport height for Playwright (default: width * 1.5)
      --viewport <preset|WxH>     Viewport preset for Playwright (mobile, tablet, desktop) or WIDTHxHEIGHT
      --force-cdp                 Force Playwright/CDP method
      --force-ws                  Force WebSocket/html2canvas method (default)
      --no-wait                   Skip server readiness check (use if server is already running)
      --wait-timeout <ms>         Max time to wait for server (default: 30000ms)

    Size comparison:
      Tier 1 (WS, viewport):     ~50-300KB PNG at 0.5x scale
      Tier 1 (WS, --full-page):  ~1-5MB PNG (entire page)
      Tier 2 (Playwright):       ~200-800KB PNG at native resolution

    Examples:
      pnpm sweetlink screenshot                                            # Viewport screenshot (small)
      pnpm sweetlink screenshot --url "http://localhost:3000/company/foo"  # Navigate then capture
      pnpm sweetlink screenshot --selector ".company-card"                 # Element screenshot
      pnpm sweetlink screenshot --full-page                                # Full scrollable page
      pnpm sweetlink screenshot --force-cdp --viewport tablet              # Playwright at 768x1024
      pnpm sweetlink screenshot --force-cdp --width 375 --height 667       # Playwright at iPhone SE`,

  query: `  query --selector <css-selector> [options]
    Query DOM elements and return data

    Options:
      --selector <css-selector>   CSS selector to query (required)
      --property <name>           Property to get from elements
      --url <url>                 Navigate browser to URL before querying
      --wait-for <css-selector>   Wait for selector to exist before querying (handles hydration)
      --wait-timeout <ms>         Max wait time for --wait-for (default: 10000ms)

    Examples:
      pnpm sweetlink query --selector "h1"
      pnpm sweetlink query --selector ".card" --property "offsetWidth"
      pnpm sweetlink query --selector "h1" --url "http://localhost:3000/about"
      pnpm sweetlink query --selector "img" --wait-for "img[src*='hero']"`,

  logs: `  logs [options]
    Get console logs from the browser

    Options:
      --filter <text>             Filter logs by level or content
      --format <type>             Output format: text (default), json, or summary
      --output <path>             Save output to file
      --dedupe                    Remove duplicate log entries

    Output Formats:
      text      Human-readable colored output (default)
      json      Full JSON array, parseable by tools
      summary   Compact JSON summary optimized for LLM context
                (deduped, counted, messages truncated to 500 chars)

    Examples:
      pnpm sweetlink logs
      pnpm sweetlink logs --filter "error"
      pnpm sweetlink logs --dedupe                    # Remove duplicates
      pnpm sweetlink logs --format json               # Full JSON output
      pnpm sweetlink logs --format summary            # LLM-optimized summary
      pnpm sweetlink logs --format json --dedupe      # JSON with deduplication`,

  exec: `  exec --code <javascript>
    Execute JavaScript in the browser context

    Code is evaluated as an expression. Bare \`return\` statements are auto-wrapped in an IIFE.
    Promises (e.g. fetch().then(...)) are automatically awaited with a 10s timeout.

    Options:
      --code <javascript>         JavaScript code to execute (required)
      --url <url>                 Navigate browser to URL before executing
      --wait-for <css-selector>   Wait for selector to exist before executing (handles hydration)
      --wait-timeout <ms>         Max wait time for --wait-for (default: 10000ms)

    Examples:
      pnpm sweetlink exec --code "document.title"
      pnpm sweetlink exec --code "document.querySelectorAll('.card').length"
      pnpm sweetlink exec --code "document.title" --url "http://localhost:3000/about"
      pnpm sweetlink exec --code "const x = 1 + 2; return x;"
      pnpm sweetlink exec --code "fetch('/api/health').then(r => r.status)"
      pnpm sweetlink exec --code "document.querySelectorAll('img').length" --wait-for "img[src*='hero']"`,

  click: `  click [options]
    Click an element in the browser

    Options:
      --selector <css>            CSS selector to find element
      --text <string>             Find element by text content
      --index <number>            Index when multiple matches (default: 0)

    Note: Requires either --selector or --text (or both)
    When both are provided, finds elements matching selector that contain the text.

    Examples:
      pnpm sweetlink click --selector "button.submit"
      pnpm sweetlink click --text "Submit"
      pnpm sweetlink click --selector "th" --text "Rank"
      pnpm sweetlink click --selector ".tab" --index 2`,

  network: `  network [options] (requires CDP)
    Get network requests from the browser

    Options:
      --filter <text>             Filter requests by URL

    Examples:
      pnpm sweetlink network
      pnpm sweetlink network --filter "/api/"`,

  refresh: `  refresh [options]
    Refresh the browser page

    Options:
      --hard                      Force hard reload (clear cache)

    Examples:
      pnpm sweetlink refresh
      pnpm sweetlink refresh --hard`,

  schema: `  schema [options]
    Extract page schema (JSON-LD, Open Graph, Twitter, meta tags, microdata)

    Options:
      --format <type>             Output format: text (default), json
      --output <path>             Save output to file

    Examples:
      pnpm sweetlink schema
      pnpm sweetlink schema --format json
      pnpm sweetlink schema --output .tmp/schema.json --format json`,

  outline: `  outline [options]
    Extract document outline (headings, sections, landmarks)

    Options:
      --format <type>             Output format: text (default), json, markdown
      --output <path>             Save output to file

    Examples:
      pnpm sweetlink outline
      pnpm sweetlink outline --format json
      pnpm sweetlink outline --output .tmp/outline.md`,

  a11y: `  a11y [options]
    Run accessibility audit (requires axe-core via devbar)

    Options:
      --format <type>             Output format: text (default), json
      --output <path>             Save report to file

    Examples:
      pnpm sweetlink a11y
      pnpm sweetlink a11y --format json
      pnpm sweetlink a11y --output .tmp/a11y-report.json --format json`,

  vitals: `  vitals [options]
    Collect Core Web Vitals (FCP, LCP, CLS, INP, page size)

    Options:
      --format <type>             Output format: text (default), json

    Examples:
      pnpm sweetlink vitals
      pnpm sweetlink vitals --format json`,

  ruler: `  ruler [options]
    Measure elements and inject visual overlay for alignment verification.
    Shows bounding boxes, center lines, dimensions, and alignment offsets.

    Options:
      --selector <css-selector>   CSS selector to measure (can be used multiple times)
      --preset <name>             Use a preset: card-header, navigation
      --url <url>                 Target URL (default: http://localhost:3000)
      --output <path>             Save screenshot with overlay
      --no-center-lines           Hide center lines
      --no-dimensions             Hide dimension labels
      --show-position             Show position labels (top, left)
      --no-alignment              Hide alignment comparison
      --limit <n>                 Max elements per selector (default: 5)
      --format <type>             Output format: text (default), json

    Presets:
      card-header   Measure article h2 and header wing alignment
      navigation    Measure nav links and buttons

    Examples:
      pnpm sweetlink ruler --preset card-header
      pnpm sweetlink ruler --selector "article h2" --selector "article header > div:first-child"
      pnpm sweetlink ruler --preset card-header --output .tmp/ruler.png
      pnpm sweetlink ruler --preset card-header --format json
      pnpm sweetlink ruler --selector ".logo" --selector ".nav-item" --show-position`,

  wait: `  wait [options]
    Wait for server to be ready (blocks until available or timeout)
    Eliminates need for external sleep commands in scripts.

    Options:
      --url <url>                 Server URL to check (default: http://localhost:3000)
      --timeout <ms>              Maximum wait time in ms (default: 30000)

    Examples:
      pnpm sweetlink wait
      pnpm sweetlink wait --url "http://localhost:3000"
      pnpm sweetlink wait --timeout 60000`,

  status: `  status [options]
    Quick server status check (non-blocking, instant)

    Options:
      --url <url>                 Server URL to check (default: http://localhost:3000)

    Examples:
      pnpm sweetlink status
      pnpm sweetlink status --url "http://localhost:8080"`,

  cleanup: `  cleanup [options]
    Find and close stale Sweetlink servers that weren't properly shut down.
    Useful when ports are stuck after crashes or forced process kills.

    Options:
      --force                     Force kill processes if graceful shutdown fails
      --verbose                   Show detailed scan progress

    What it does:
      1. Scans common Sweetlink port ranges (9223-9233, 11396-11406, etc.)
      2. Identifies running Sweetlink servers
      3. Attempts graceful WebSocket shutdown
      4. With --force: kills the process if graceful shutdown fails

    Examples:
      pnpm sweetlink cleanup                 # Graceful shutdown
      pnpm sweetlink cleanup --force         # Force kill if needed`,

  setup: `  setup
    Install Claude Code integration (screenshot skill and context files).
    Creates symlinks in your .claude/ directory so Claude can use the /screenshot
    skill and sweetlink agent guide automatically.

    Re-run after upgrading sweetlink to pick up any skill updates.

    Examples:
      pnpm sweetlink setup`,
};

// Aliases that map to canonical command names
const COMMAND_ALIASES: Record<string, string> = {
  measure: 'ruler',
  accessibility: 'a11y',
};

const GLOBAL_HELP = `
Global Flags:
  --json                  Output structured JSON (envelope with ok, command, data, duration)
  --output-schema         Print TypeScript types for --json output, then exit
  --app <name>            Target a specific app instance by branch or app name (scans ports)

Screenshot Strategy:
  Tier 1 (Default): html2canvas WebSocket - 131KB, always use first
  Tier 2 (Escalation): CDP - 2.0MB native Chrome, use to confirm visual discrepancies

  Only escalate to CDP when html2canvas shows something wrong but you're uncertain
  if it's a real bug or canvas artifact. This maximizes token efficiency (15x savings).

CDP Setup (for Tier 2):
  For native Chrome rendering and network inspection, start Chrome with:
    /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222

Environment Variables:
  SWEETLINK_WS_URL            WebSocket server URL (default: ws://localhost:9223)
  CHROME_CDP_PORT             Chrome DevTools Protocol port (default: 9222)

Documentation:
  Agent Guide:       .claude/context/sweetlink-agent-guide.md`;

function showHelp(): void {
  console.log(`
Sweetlink CLI - Autonomous Development Bridge

Usage:
  pnpm sweetlink <command> [options]

Commands:
`);
  for (const help of Object.values(COMMAND_HELP)) {
    console.log(help);
    console.log('');
  }
  console.log(GLOBAL_HELP);
}

function showCommandHelp(command: string): void {
  const canonical = COMMAND_ALIASES[command] || command;
  const help = COMMAND_HELP[canonical];
  if (!help) {
    console.error(`[Sweetlink] Unknown command: ${command}`);
    console.error(`Run "pnpm sweetlink --help" to see all available commands.`);
    process.exit(1);
  }
  console.log(`\nSweetlink CLI - ${canonical}\n`);
  console.log(help);
  console.log(GLOBAL_HELP);
}

// CLI argument parsing
const args = process.argv.slice(2);
// Skip global flags to find the actual command
const commandType = args.find((a) => !a.startsWith('--')) || args[0];

if (!commandType || commandType === '--help' || commandType === '-h') {
  showHelp();
  process.exit(0);
}

// Helper function to get argument value
function getArg(flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

// Per-command --help: `pnpm sweetlink screenshot --help`
if (hasFlag('--help') || hasFlag('-h')) {
  showCommandHelp(commandType);
  process.exit(0);
}

// Handle --output-schema before main switch
if (hasFlag('--output-schema')) {
  // If commandType is a known command, print just that schema; otherwise print all
  const knownCommands = [
    'screenshot',
    'query',
    'logs',
    'exec',
    'click',
    'refresh',
    'ruler',
    'measure',
    'network',
    'schema',
    'outline',
    'a11y',
    'accessibility',
    'vitals',
    'cleanup',
    'wait',
    'status',
  ];
  const schemaCommand = knownCommands.includes(commandType)
    ? commandType === 'measure'
      ? 'ruler'
      : commandType === 'accessibility'
        ? 'a11y'
        : commandType
    : undefined;
  printOutputSchema(schemaCommand);
  process.exit(0);
}

const jsonMode = hasFlag('--json');

/**
 * Set up JSON mode: suppress console.log/warn, capture errors, and intercept process.exit
 * to emit structured JSON envelopes on failure.
 */
function setupJsonMode(
  command: string,
  startTime: number
): { origExit: typeof process.exit; getLastError: () => string } {
  console.log = () => {};
  console.warn = () => {};

  let lastErrorMsg = '';
  const origError = console.error;
  console.error = (...errorArgs: unknown[]) => {
    lastErrorMsg = errorArgs.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    origError(...errorArgs);
  };

  const origExit = process.exit;
  process.exit = ((code?: number) => {
    if (code && code !== 0) {
      emitJson({
        ok: false,
        command,
        data: null,
        error: lastErrorMsg || `Process exited with code ${code}`,
        duration: Date.now() - startTime,
      });
    }
    origExit(code);
  }) as typeof process.exit;

  return { origExit, getLastError: () => lastErrorMsg };
}

/**
 * Handle the `wait` command: wait for a server to be ready.
 */
async function handleWaitCommand(): Promise<WaitData> {
  const waitUrl = getArg('--url') || 'http://localhost:3000';
  const waitTimeout = getArg('--timeout')
    ? parseInt(getArg('--timeout')!, 10)
    : SERVER_READY_TIMEOUT;
  const waitStart = Date.now();
  try {
    await waitForServer(waitUrl, waitTimeout);
    console.log('[Sweetlink] ✓ Server is ready');
    return { url: waitUrl, ready: true, elapsed: Date.now() - waitStart };
  } catch (error) {
    console.error(
      '[Sweetlink] ✗ Server not available:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

/**
 * Handle the `status` command: quick non-blocking server health check.
 */
async function handleStatusCommand(): Promise<StatusData> {
  const statusUrl = getArg('--url') || 'http://localhost:3000';
  try {
    const parsedUrl = new URL(statusUrl);
    const healthCheckUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(healthCheckUrl, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (response.ok || response.status === 304) {
      console.log(`[Sweetlink] ✓ Server at ${healthCheckUrl} is running`);
      return { url: statusUrl, running: true, statusCode: response.status };
    } else {
      console.log(`[Sweetlink] ⚠ Server responded with status ${response.status}`);
      process.exit(1);
    }
  } catch {
    console.log(`[Sweetlink] ✗ Server at ${statusUrl} is not responding`);
    process.exit(1);
  }
}

(async () => {
  const startTime = Date.now();

  // Resolve --app flag: discover the matching Sweetlink server by branch/app name
  const appTarget = getArg('--app');
  if (appTarget) {
    try {
      resolvedWsUrl = await discoverServer(appTarget);
      console.log(`[Sweetlink] Targeting server: ${resolvedWsUrl}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  let origExit = process.exit;
  if (jsonMode) {
    const jsonSetup = setupJsonMode(commandType, startTime);
    origExit = jsonSetup.origExit;
  }

  try {
    let result: unknown;

    switch (commandType) {
      case 'screenshot':
        result = await screenshot({
          selector: getArg('--selector'),
          output: getArg('--output'),
          fullPage: hasFlag('--full-page'),
          forceCDP: hasFlag('--force-cdp'),
          forceWS: hasFlag('--force-ws'),
          a11y: hasFlag('--a11y'),
          viewport: getArg('--viewport'),
          width: getArg('--width') ? parseInt(getArg('--width')!, 10) : undefined,
          height: getArg('--height') ? parseInt(getArg('--height')!, 10) : undefined,
          hover: hasFlag('--hover'),
          url: getArg('--url'),
          wait: !hasFlag('--no-wait'), // Wait by default, --no-wait to skip
          waitTimeout: getArg('--wait-timeout')
            ? parseInt(getArg('--wait-timeout')!, 10)
            : undefined,
        });
        break;

      case 'query': {
        const selector = getArg('--selector');
        if (!selector) {
          console.error('[Sweetlink] Error: --selector is required for query command');
          process.exit(1);
        }
        if (getArg('--url')) {
          const navigated = await navigateBrowser(getArg('--url')!);
          if (!navigated) {
            console.error('[Sweetlink] Could not navigate browser to', getArg('--url'));
            process.exit(1);
          }
        }
        result = await queryDOM({
          selector,
          property: getArg('--property'),
          waitFor: getArg('--wait-for'),
          waitTimeout: getArg('--wait-timeout')
            ? parseInt(getArg('--wait-timeout')!, 10)
            : undefined,
        });
        break;
      }

      case 'logs': {
        const format = getArg('--format') as 'text' | 'json' | 'summary' | undefined;
        result = await getLogs({
          filter: getArg('--filter'),
          format: format || 'text',
          dedupe: hasFlag('--dedupe'),
          output: getArg('--output'),
        });
        break;
      }

      case 'exec': {
        const code = getArg('--code');
        if (!code) {
          console.error('[Sweetlink] Error: --code is required for exec command');
          process.exit(1);
        }
        if (getArg('--url')) {
          const navigated = await navigateBrowser(getArg('--url')!);
          if (!navigated) {
            console.error('[Sweetlink] Could not navigate browser to', getArg('--url'));
            process.exit(1);
          }
        }
        result = await execJS({
          code,
          waitFor: getArg('--wait-for'),
          waitTimeout: getArg('--wait-timeout')
            ? parseInt(getArg('--wait-timeout')!, 10)
            : undefined,
        });
        break;
      }

      case 'click':
        result = await click({
          selector: getArg('--selector'),
          text: getArg('--text'),
          index: getArg('--index') ? parseInt(getArg('--index')!, 10) : undefined,
        });
        break;

      case 'network':
        result = await getNetwork({
          filter: getArg('--filter'),
        });
        break;

      case 'refresh':
        result = await refresh({
          hard: hasFlag('--hard'),
        });
        break;

      case 'ruler':
      case 'measure': {
        // Collect all --selector arguments
        const rulerSelectors: string[] = [];
        args.forEach((arg, i) => {
          if (arg === '--selector' && args[i + 1]) {
            rulerSelectors.push(args[i + 1]!);
          }
        });

        result = await ruler({
          selectors: rulerSelectors.length > 0 ? rulerSelectors : undefined,
          preset: getArg('--preset') as 'card-header' | 'navigation' | undefined,
          url: getArg('--url'),
          output: getArg('--output'),
          showCenterLines: !hasFlag('--no-center-lines'),
          showDimensions: !hasFlag('--no-dimensions'),
          showPosition: hasFlag('--show-position'),
          showAlignment: !hasFlag('--no-alignment'),
          limit: getArg('--limit') ? parseInt(getArg('--limit')!, 10) : undefined,
          format: getArg('--format') as 'text' | 'json' | undefined,
        });
        break;
      }

      case 'wait':
        result = await handleWaitCommand();
        break;

      case 'status':
        result = await handleStatusCommand();
        break;

      case 'schema':
        result = await getSchema({
          format: getArg('--format') as 'text' | 'json' | undefined,
          output: getArg('--output'),
        });
        break;

      case 'outline':
        result = await getOutline({
          format: getArg('--format') as 'text' | 'json' | 'markdown' | undefined,
          output: getArg('--output'),
        });
        break;

      case 'a11y':
      case 'accessibility':
        result = await getA11y({
          format: getArg('--format') as 'text' | 'json' | undefined,
          output: getArg('--output'),
        });
        break;

      case 'vitals':
        result = await getVitals({
          format: getArg('--format') as 'text' | 'json' | undefined,
        });
        break;

      case 'cleanup':
        result = await cleanup({
          force: hasFlag('--force'),
          verbose: hasFlag('--verbose'),
        });
        break;

      case 'setup': {
        // Run the setup script to symlink Claude context and skills
        const { execFileSync } = await import('child_process');
        const scriptDir = path.dirname(import.meta.url.replace('file://', ''));
        const setupScript = path.resolve(
          scriptDir,
          '..',
          '..',
          'scripts',
          'setup-claude-context.mjs'
        );
        execFileSync('node', [setupScript], { stdio: 'inherit' });
        break;
      }

      default:
        console.error(`[Sweetlink] Unknown command: ${commandType}`);
        console.log('Run "pnpm sweetlink --help" for usage information');
        process.exit(1);
    }

    if (jsonMode && result !== undefined) {
      emitJson({ ok: true, command: commandType, data: result, duration: Date.now() - startTime });
    }
  } catch (error) {
    if (jsonMode) {
      const msg = error instanceof Error ? error.message : String(error);
      emitJson({
        ok: false,
        command: commandType,
        data: null,
        error: msg,
        duration: Date.now() - startTime,
      });
      origExit(1);
    }
    console.error('[Sweetlink] Fatal error:', error);
    process.exit(1);
  }
})();
