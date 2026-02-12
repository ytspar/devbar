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
  data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- shape varies per command
  error?: string;
  timestamp: number;
}

const WS_URL = process.env.SWEETLINK_WS_URL || 'ws://localhost:9223';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const SERVER_READY_TIMEOUT = 30000; // 30 seconds to wait for server
const SERVER_POLL_INTERVAL = 500; // Poll every 500ms

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

async function sendCommand(command: SweetlinkCommand): Promise<SweetlinkResponse> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Command timeout - is the dev server running?'));
    }, DEFAULT_TIMEOUT);

    ws.on('open', () => {
      ws.send(JSON.stringify(command));
    });

    ws.on('message', (data: Buffer) => {
      clearTimeout(timeout);
      const response = JSON.parse(data.toString()) as SweetlinkResponse;
      ws.close();
      resolve(response);
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      ws.close();
      reject(error);
    });
  });
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
}) {
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

  // Check if CDP is available (unless force WS is specified)
  // Hover requires CDP/Playwright
  const requiresCDP = options.forceCDP || options.hover;

  // If we need CDP/Playwright (for hover or force-cdp), or if CDP is available, use Playwright
  // Playwright will auto-launch if CDP is not available
  const shouldTryPlaywright = requiresCDP || (!options.forceWS && (await detectCDP()));

  if (shouldTryPlaywright) {
    console.log('[Sweetlink] Using Playwright for screenshot');

    // Determine output path - use default if not specified
    const outputPath = options.output || getDefaultScreenshotPath();
    ensureDir(outputPath);

    try {
      // Use Playwright (which handles CDP connection OR launches new browser)
      const result = await screenshotViaPlaywright({
        selector: options.selector,
        output: outputPath,
        fullPage: options.fullPage,
        viewport: options.viewport,
        hover: options.hover,
        url: options.url,
      });

      reportScreenshotSuccess(outputPath, result.width, result.height, 'Playwright (Auto-launch/CDP)', options.selector);

      return;
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
  console.log('[Sweetlink] Using WebSocket for screenshot');

  const command: SweetlinkCommand = {
    type: 'screenshot',
    selector: options.selector,
    options: {
      fullPage: options.fullPage,
      a11y: options.a11y,
    },
  };

  try {
    const response = await sendCommand(command);

    if (!response.success) {
      // Auto-escalate to Playwright when no browser client is connected
      // This happens after dev server restart when browser page hasn't been refreshed
      if (response.error?.includes('No browser client connected')) {
        console.log('[Sweetlink] No browser client - auto-escalating to Playwright');

        const outputPath = options.output || getDefaultScreenshotPath();
        ensureDir(outputPath);

        try {
          const result = await screenshotViaPlaywright({
            selector: options.selector,
            output: outputPath,
            fullPage: options.fullPage,
            viewport: options.viewport,
            hover: options.hover,
            url: options.url,
          });

          reportScreenshotSuccess(outputPath, result.width, result.height, 'Playwright (auto-escalation from WebSocket failure)', options.selector);
          return;
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
    const base64Data = response.data.screenshot.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));

    reportScreenshotSuccess(outputPath, response.data.width, response.data.height, 'WebSocket (html2canvas)', response.data.selector);
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function queryDOM(options: { selector: string; property?: string }) {
  console.log(`[Sweetlink] Querying DOM: ${options.selector}`);

  const command: SweetlinkCommand = {
    type: 'query-dom',
    selector: options.selector,
    property: options.property,
  };

  try {
    const response = await sendCommand(command);

    if (!response.success) {
      console.error('[Sweetlink] Query failed:', response.error);
      process.exit(1);
    }

    console.log(`[Sweetlink] ✓ Found ${response.data.count} elements`);

    if (options.property) {
      // If querying a property, show the values
      console.log('\nValues:');
      response.data.results.forEach((value: unknown, index: number) => {
        console.log(`  [${index}] ${JSON.stringify(value)}`);
      });
    } else {
      // Show element info
      console.log('\nElements:');
      console.log(JSON.stringify(response.data.results, null, 2));
    }
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

async function getLogs(options: {
  filter?: string;
  format?: 'text' | 'json' | 'summary';
  dedupe?: boolean;
  output?: string;
}) {
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
      const jsonData = options.dedupe
        ? { deduped: true, logs: deduplicateLogs(logs) }
        : { deduped: false, logs };
      const jsonStr = JSON.stringify(jsonData, null, 2);
      if (options.output) {
        ensureDir(options.output);
        fs.writeFileSync(options.output, jsonStr);
        console.log(`[Sweetlink] ✓ Logs saved to: ${getRelativePath(options.output)}`);
      } else {
        console.log(jsonStr);
      }
      return;
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
      return;
    }

    // Default text format
    const displayLogs = options.dedupe ? deduplicateLogs(logs) : null;

    console.log(
      `[Sweetlink] ✓ Found ${logs.length} log entries${options.dedupe ? ` (${displayLogs!.length} unique)` : ''}`
    );

    if (logs.length > 0) {
      console.log('\nConsole Logs:');

      if (options.dedupe && displayLogs) {
        displayLogs.forEach((log) => {
          const levelColor =
            {
              error: '\x1b[31m',
              warn: '\x1b[33m',
              info: '\x1b[36m',
              log: '\x1b[37m',
            }[log.level] || '\x1b[37m';

          const reset = '\x1b[0m';
          const countStr = log.count > 1 ? ` (×${log.count})` : '';

          console.log(
            `  ${levelColor}[${log.level.toUpperCase()}]${reset}${countStr} - ${log.message}`
          );
        });
      } else {
        logs.forEach((log) => {
          const levelColor =
            {
              error: '\x1b[31m',
              warn: '\x1b[33m',
              info: '\x1b[36m',
              log: '\x1b[37m',
            }[log.level] || '\x1b[37m';

          const reset = '\x1b[0m';
          const time = new Date(log.timestamp).toLocaleTimeString();

          console.log(
            `  ${levelColor}[${log.level.toUpperCase()}]${reset} ${time} - ${log.message}`
          );
        });
      }
    } else {
      console.log('  No logs found');
    }
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function execJS(options: { code: string }) {
  console.log('[Sweetlink] Executing JavaScript...');

  const command: SweetlinkCommand = {
    type: 'exec-js',
    code: options.code,
  };

  try {
    const response = await sendCommand(command);

    if (!response.success) {
      console.error('[Sweetlink] Execution failed:', response.error);
      process.exit(1);
    }

    console.log('[Sweetlink] ✓ Result:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function click(options: { selector?: string; text?: string; index?: number }) {
  const { selector, text, index = 0 } = options;

  if (!selector && !text) {
    console.error('[Sweetlink] Error: Either --selector or --text is required');
    process.exit(1);
  }

  let clickCode: string;
  let description: string;

  if (text) {
    // Find element by text content
    const baseSelector = selector || '*';
    // Escape for JSON to safely embed in JavaScript
    const escapedText = JSON.stringify(text);
    const escapedSelector = JSON.stringify(baseSelector);
    description = selector ? `"${text}" within ${selector}` : `"${text}"`;
    clickCode = `
      (() => {
        const searchText = ${escapedText};
        const elements = Array.from(document.querySelectorAll(${escapedSelector}))
          .filter(el => el.textContent?.includes(searchText));
        if (elements.length === 0) {
          return { success: false, error: "No element found with text: " + searchText };
        }
        const target = elements[${index}];
        if (!target) {
          return { success: false, error: "Index ${index} out of bounds, found " + elements.length + " elements" };
        }
        target.click();
        return { success: true, clicked: target.tagName + (target.className ? "." + target.className.split(" ")[0] : ""), found: elements.length };
      })()
    `;
  } else {
    // Find element by selector
    const escapedSelector = JSON.stringify(selector);
    description = `${selector}${index > 0 ? ` [${index}]` : ''}`;
    clickCode = `
      (() => {
        const elements = document.querySelectorAll(${escapedSelector});
        if (elements.length === 0) {
          return { success: false, error: "No element found matching: " + ${escapedSelector} };
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
      console.error('[Sweetlink] Click failed:', response.error);
      process.exit(1);
    }

    const result = response.data;
    if (result === undefined || result === null) {
      // This shouldn't happen with trimmed code, but handle gracefully
      console.log('[Sweetlink] ✓ Click executed');
      return;
    }

    if (typeof result === 'object' && 'success' in result) {
      if (!result.success) {
        console.error(`[Sweetlink] ✗ ${result.error}`);
        process.exit(1);
      }
      console.log(
        `[Sweetlink] ✓ Clicked: ${result.clicked}${result.found > 1 ? ` (${result.found} matches, used index ${index})` : ''}`
      );
    } else {
      // Result is just a value, not our expected object
      console.log(`[Sweetlink] ✓ Click executed`);
    }
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function refresh(options: { hard?: boolean }) {
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
}) {
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
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function getNetwork(options: { filter?: string }) {
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
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  const lsofPath = await findLsofPath();

  try {
    const { stdout } = await execAsync(`${lsofPath} -ti :${port}`);
    const pids = stdout.trim().split('\n').filter(Boolean);

    if (pids.length === 0) {
      return false;
    }

    for (const pid of pids) {
      try {
        await execAsync(`/bin/kill -9 ${pid}`);
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
async function cleanup(options: { force?: boolean; verbose?: boolean }) {
  console.log('[Sweetlink] Scanning for stale servers...\n');

  const portsToScan = getPortsToScan();

  // Scan all ports in parallel and filter to found servers
  const scanResults = await Promise.all(portsToScan.map(checkPort));
  const foundServers = scanResults.filter((info): info is SweetlinkServerInfo => info !== null);

  if (foundServers.length === 0) {
    console.log('[Sweetlink] No stale servers found.');
    return;
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
}

async function getSchema(options: { format?: 'text' | 'json'; output?: string }) {
  console.log('[Sweetlink] Extracting page schema...');

  try {
    const response = await sendCommand({ type: 'get-schema' });

    if (!response.success) {
      console.error('[Sweetlink] Schema extraction failed:', response.error);
      process.exit(1);
    }

    const { schema, markdown } = response.data;

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
        fs.writeFileSync(options.output, markdown);
        console.log(`[Sweetlink] ✓ Schema saved to: ${getRelativePath(options.output)}`);
      } else {
        console.log(markdown);
      }
    }
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function getOutline(options: { format?: 'text' | 'json' | 'markdown'; output?: string }) {
  console.log('[Sweetlink] Extracting document outline...');

  try {
    const response = await sendCommand({ type: 'get-outline' });

    if (!response.success) {
      console.error('[Sweetlink] Outline extraction failed:', response.error);
      process.exit(1);
    }

    const { outline, markdown } = response.data;

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
        fs.writeFileSync(options.output, markdown);
        console.log(`[Sweetlink] ✓ Outline saved to: ${getRelativePath(options.output)}`);
      } else {
        console.log(markdown);
      }
    }
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function getA11y(options: { format?: 'text' | 'json'; output?: string }) {
  console.log('[Sweetlink] Running accessibility audit...');

  try {
    const response = await sendCommand({ type: 'get-a11y' });

    if (!response.success) {
      console.error('[Sweetlink] Accessibility audit failed:', response.error);
      process.exit(1);
    }

    const { result, summary } = response.data;

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
      console.log(`\n[Sweetlink] Accessibility Audit Results`);
      console.log(`  URL: ${result.url}`);
      console.log(`  Violations: ${summary.totalViolations}`);
      console.log(`  Passes: ${summary.totalPasses}`);
      console.log(`  Incomplete: ${summary.totalIncomplete}`);
      console.log(`  By Impact: critical=${summary.byImpact.critical}, serious=${summary.byImpact.serious}, moderate=${summary.byImpact.moderate}, minor=${summary.byImpact.minor}`);

      if (result.violations.length > 0) {
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
          const violations = result.violations.filter(
            (v: { impact: string }) => v.impact === impact
          );
          if (violations.length === 0) continue;

          for (const v of violations) {
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
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function getVitals(options: { format?: 'text' | 'json' }) {
  console.log('[Sweetlink] Collecting web vitals...');

  try {
    const response = await sendCommand({ type: 'get-vitals' });

    if (!response.success) {
      console.error('[Sweetlink] Vitals collection failed:', response.error);
      process.exit(1);
    }

    const { vitals, summary } = response.data;

    if (options.format === 'json') {
      console.log(JSON.stringify(vitals, null, 2));
    } else {
      console.log(`\n[Sweetlink] Web Vitals`);
      console.log(`  URL: ${vitals.url}`);
      console.log(`  ${summary}`);

      // Detailed breakdown
      if (vitals.fcp !== null) {
        const color = vitals.fcp <= 1800 ? '\x1b[32m' : vitals.fcp <= 3000 ? '\x1b[33m' : '\x1b[31m';
        console.log(`  FCP: ${color}${vitals.fcp}ms\x1b[0m`);
      }
      if (vitals.lcp !== null) {
        const color = vitals.lcp <= 2500 ? '\x1b[32m' : vitals.lcp <= 4000 ? '\x1b[33m' : '\x1b[31m';
        console.log(`  LCP: ${color}${vitals.lcp}ms\x1b[0m`);
      }
      if (vitals.cls !== null) {
        const color = vitals.cls <= 0.1 ? '\x1b[32m' : vitals.cls <= 0.25 ? '\x1b[33m' : '\x1b[31m';
        console.log(`  CLS: ${color}${vitals.cls}\x1b[0m`);
      }
      if (vitals.inp !== null) {
        const color = vitals.inp <= 200 ? '\x1b[32m' : vitals.inp <= 500 ? '\x1b[33m' : '\x1b[31m';
        console.log(`  INP: ${color}${vitals.inp}ms\x1b[0m`);
      }
      if (vitals.pageSize !== null) {
        const sizeKB = Math.round(vitals.pageSize / 1024);
        console.log(`  Page size: ${sizeKB}KB`);
      }
    }
  } catch (error) {
    console.error('[Sweetlink] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
Sweetlink CLI - Autonomous Development Bridge

Usage:
  pnpm sweetlink <command> [options]

Commands:

  screenshot [options]
    Take a screenshot of the current page or element

    TWO-TIER STRATEGY (see .claude/context/sweetlink-screenshot-workflow.md):
      Tier 1 (Default): html2canvas WebSocket - 131KB, zero setup, use 95% of time
      Tier 2 (Escalation): CDP - 2.0MB native Chrome, use only to confirm discrepancies

    Options:
      --url <url>                 Target URL to navigate to (default: http://localhost:3000)
      --selector <css-selector>   CSS selector of element to screenshot
      --output <path>             Output file path (default: screenshot-<timestamp>.png)
      --full-page                 Capture full page (not just viewport)
      --width <pixels>            Viewport width (e.g., 768 for tablet, 375 for mobile)
      --height <pixels>           Viewport height (default: width * 1.5)
      --viewport <preset|WxH>     Viewport preset (mobile, tablet, desktop) or WIDTHxHEIGHT
      --force-cdp                 Force CDP method (requires Chrome debugging)
      --force-ws                  Force WebSocket method (default)
      --no-wait                   Skip server readiness check (use if server is already running)
      --wait-timeout <ms>         Max time to wait for server (default: 30000ms)

    Examples:
      pnpm sweetlink screenshot                                            # Tier 1 (default)
      pnpm sweetlink screenshot --url "http://localhost:3000/company/foo"  # Navigate to specific page
      pnpm sweetlink screenshot --selector ".company-card"                 # Tier 1 with selector
      pnpm sweetlink screenshot --width 768                                # Tablet viewport (768x1152)
      pnpm sweetlink screenshot --width 375 --height 667                   # iPhone SE viewport
      pnpm sweetlink screenshot --viewport tablet                          # Preset: 768x1024
      pnpm sweetlink screenshot --force-cdp --full-page                    # Tier 2 (escalation)

  query --selector <css-selector> [options]
    Query DOM elements and return data

    Options:
      --selector <css-selector>   CSS selector to query (required)
      --property <name>           Property to get from elements

    Examples:
      pnpm sweetlink query --selector "h1"
      pnpm sweetlink query --selector ".card" --property "offsetWidth"

  logs [options]
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
      pnpm sweetlink logs --format json --dedupe      # JSON with deduplication

  exec --code <javascript>
    Execute JavaScript in the browser context

    Options:
      --code <javascript>         JavaScript code to execute (required)

    Examples:
      pnpm sweetlink exec --code "document.title"
      pnpm sweetlink exec --code "document.querySelectorAll('.card').length"

  click [options]
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
      pnpm sweetlink click --selector ".tab" --index 2

  network [options] (requires CDP)
    Get network requests from the browser

    Options:
      --filter <text>             Filter requests by URL

    Examples:
      pnpm sweetlink network
      pnpm sweetlink network --filter "/api/"

  refresh [options]
    Refresh the browser page

    Options:
      --hard                      Force hard reload (clear cache)

    Examples:
      pnpm sweetlink refresh
      pnpm sweetlink refresh --hard

  schema [options]
    Extract page schema (JSON-LD, Open Graph, Twitter, meta tags, microdata)

    Options:
      --format <type>             Output format: text (default), json
      --output <path>             Save output to file

    Examples:
      pnpm sweetlink schema
      pnpm sweetlink schema --format json
      pnpm sweetlink schema --output .tmp/schema.json --format json

  outline [options]
    Extract document outline (headings, sections, landmarks)

    Options:
      --format <type>             Output format: text (default), json, markdown
      --output <path>             Save output to file

    Examples:
      pnpm sweetlink outline
      pnpm sweetlink outline --format json
      pnpm sweetlink outline --output .tmp/outline.md

  a11y [options]
    Run accessibility audit (requires axe-core via devbar)

    Options:
      --format <type>             Output format: text (default), json
      --output <path>             Save report to file

    Examples:
      pnpm sweetlink a11y
      pnpm sweetlink a11y --format json
      pnpm sweetlink a11y --output .tmp/a11y-report.json --format json

  vitals [options]
    Collect Core Web Vitals (FCP, LCP, CLS, INP, page size)

    Options:
      --format <type>             Output format: text (default), json

    Examples:
      pnpm sweetlink vitals
      pnpm sweetlink vitals --format json

  ruler [options]
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
      pnpm sweetlink ruler --selector ".logo" --selector ".nav-item" --show-position

  wait [options]
    Wait for server to be ready (blocks until available or timeout)
    Eliminates need for external sleep commands in scripts.

    Options:
      --url <url>                 Server URL to check (default: http://localhost:3000)
      --timeout <ms>              Maximum wait time in ms (default: 30000)

    Examples:
      pnpm sweetlink wait
      pnpm sweetlink wait --url "http://localhost:3000"
      pnpm sweetlink wait --timeout 60000

  status [options]
    Quick server status check (non-blocking, instant)

    Options:
      --url <url>                 Server URL to check (default: http://localhost:3000)

    Examples:
      pnpm sweetlink status
      pnpm sweetlink status --url "http://localhost:8080"

  cleanup [options]
    Find and close stale Sweetlink servers that weren't properly shut down.
    Useful when ports are stuck after crashes or forced process kills.

    Options:
      --force                     Force kill processes if graceful shutdown fails

    What it does:
      1. Scans common Sweetlink port ranges (9223-9233, 11396-11406, etc.)
      2. Identifies running Sweetlink servers
      3. Attempts graceful WebSocket shutdown
      4. With --force: kills the process if graceful shutdown fails

    Examples:
      pnpm sweetlink cleanup                 # Graceful shutdown
      pnpm sweetlink cleanup --force         # Force kill if needed

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
  Agent Workflow:    .claude/context/sweetlink-screenshot-workflow.md
  Agent Guide:       .claude/context/sweetlink-agent-guide.md
  CDP Guide:         .claude/context/sweetlink-cdp-guide.md
`);
}

// CLI argument parsing
const args = process.argv.slice(2);
const commandType = args[0];

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

(async () => {
  try {
    switch (commandType) {
      case 'screenshot':
        await screenshot({
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
        await queryDOM({
          selector,
          property: getArg('--property'),
        });
        break;
      }

      case 'logs': {
        const format = getArg('--format') as 'text' | 'json' | 'summary' | undefined;
        await getLogs({
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
        await execJS({ code });
        break;
      }

      case 'click':
        await click({
          selector: getArg('--selector'),
          text: getArg('--text'),
          index: getArg('--index') ? parseInt(getArg('--index')!, 10) : undefined,
        });
        break;

      case 'network':
        await getNetwork({
          filter: getArg('--filter'),
        });
        break;

      case 'refresh':
        await refresh({
          hard: hasFlag('--hard'),
        });
        break;

      case 'ruler':
      case 'measure': {
        // Collect all --selector arguments
        const rulerSelectors: string[] = [];
        args.forEach((arg, i) => {
          if (arg === '--selector' && args[i + 1]) {
            rulerSelectors.push(args[i + 1]);
          }
        });

        await ruler({
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

      case 'wait': {
        // Standalone wait command for waiting for server to be ready
        const waitUrl = getArg('--url') || 'http://localhost:3000';
        const waitTimeout = getArg('--timeout')
          ? parseInt(getArg('--timeout')!, 10)
          : SERVER_READY_TIMEOUT;
        try {
          await waitForServer(waitUrl, waitTimeout);
          console.log('[Sweetlink] ✓ Server is ready');
        } catch (error) {
          console.error(
            '[Sweetlink] ✗ Server not available:',
            error instanceof Error ? error.message : error
          );
          process.exit(1);
        }
        break;
      }

      case 'status': {
        // Quick server status check (non-blocking)
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
          } else {
            console.log(`[Sweetlink] ⚠ Server responded with status ${response.status}`);
            process.exit(1);
          }
        } catch {
          console.log(`[Sweetlink] ✗ Server at ${statusUrl} is not responding`);
          process.exit(1);
        }
        break;
      }

      case 'schema':
        await getSchema({
          format: getArg('--format') as 'text' | 'json' | undefined,
          output: getArg('--output'),
        });
        break;

      case 'outline':
        await getOutline({
          format: getArg('--format') as 'text' | 'json' | 'markdown' | undefined,
          output: getArg('--output'),
        });
        break;

      case 'a11y':
      case 'accessibility':
        await getA11y({
          format: getArg('--format') as 'text' | 'json' | undefined,
          output: getArg('--output'),
        });
        break;

      case 'vitals':
        await getVitals({
          format: getArg('--format') as 'text' | 'json' | undefined,
        });
        break;

      case 'cleanup':
        await cleanup({
          force: hasFlag('--force'),
          verbose: hasFlag('--verbose'),
        });
        break;

      default:
        console.error(`[Sweetlink] Unknown command: ${commandType}`);
        console.log('Run "pnpm sweetlink --help" for usage information');
        process.exit(1);
    }
  } catch (error) {
    console.error('[Sweetlink] Fatal error:', error);
    process.exit(1);
  }
})();
