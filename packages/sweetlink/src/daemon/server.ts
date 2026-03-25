/**
 * Daemon HTTP Server
 *
 * Localhost-only HTTP server with bearer token auth.
 * Routes POST requests to /api/{action} and dispatches to handlers.
 * Manages idle timer for auto-shutdown.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { closeBrowser, getPage, initBrowser, takeResponsiveScreenshots, takeScreenshot } from './browser.js';
import { annotateScreenshot, diffSnapshots } from './diff.js';
import { takeDeviceScreenshots } from './devices.js';
import {
  consoleBuffer,
  dialogBuffer,
  formatConsoleEntries,
  formatNetworkEntries,
  getErrorCount,
  getWarningCount,
  networkBuffer,
} from './listeners.js';
import { visualDiff } from './visualDiff.js';
import {
  buildRefMap,
  checkRefStale,
  formatRefMap,
  getBaseline,
  getCurrentRefMap,
  resolveRef,
  setBaseline,
} from './refs.js';
import type {
  DaemonAction,
  DaemonResponse,
  ResponsiveScreenshotParams,
  ScreenshotParams,
} from './types.js';
import { DAEMON_IDLE_TIMEOUT_MS, DEFAULT_RESPONSIVE_VIEWPORTS } from './types.js';

// ============================================================================
// State
// ============================================================================

let httpServer: ReturnType<typeof createServer> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let shutdownCallback: (() => void) | null = null;

// ============================================================================
// Idle Timer
// ============================================================================

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    console.error('[Daemon] Idle timeout reached. Shutting down...');
    shutdown();
  }, DAEMON_IDLE_TIMEOUT_MS);
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handlePing(): Promise<DaemonResponse> {
  return { ok: true, data: { pong: true, timestamp: Date.now() } };
}

async function handleShutdown(): Promise<DaemonResponse> {
  // Schedule shutdown after response is sent
  setTimeout(() => shutdown(), 100);
  return { ok: true, data: { message: 'Daemon shutting down' } };
}

async function handleScreenshot(
  params: ScreenshotParams,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const { buffer, width, height } = await takeScreenshot({
    selector: params.selector,
    fullPage: params.fullPage,
    viewport: params.viewport,
  });

  return {
    ok: true,
    data: {
      screenshot: buffer.toString('base64'),
      width,
      height,
    },
  };
}

async function handleResponsiveScreenshot(
  params: ResponsiveScreenshotParams,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const viewports = params.viewports ?? DEFAULT_RESPONSIVE_VIEWPORTS;
  const results = await takeResponsiveScreenshots({
    viewports,
    fullPage: params.fullPage,
  });

  return {
    ok: true,
    data: {
      screenshots: results.map((r) => ({
        width: r.width,
        height: r.height,
        screenshot: r.buffer.toString('base64'),
        label: r.label,
      })),
    },
  };
}

// ============================================================================
// Ref System Handlers
// ============================================================================

async function handleSnapshot(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const page = getPage();
  const interactive = params.interactive as boolean | undefined;
  const diff = params.diff as boolean | undefined;
  const annotate = params.annotate as boolean | undefined;

  // If diffing, we need the baseline before taking new snapshot
  const baseline = diff ? getBaseline() : null;

  const resolved = await buildRefMap(page, { interactive: interactive !== false });

  // Handle diff mode
  if (diff) {
    if (!baseline) {
      return {
        ok: false,
        error: 'No baseline snapshot to diff against. Run `snapshot` first, then make changes, then `snapshot -D`.',
      };
    }
    const diffText = diffSnapshots(baseline, resolved);
    setBaseline(); // Update baseline for next diff
    return {
      ok: true,
      data: {
        diff: diffText,
        tree: formatRefMap(resolved),
        refs: resolved.entries,
        count: resolved.entries.length,
      },
    };
  }

  // Handle annotated screenshot mode
  if (annotate) {
    const currentRefs = getCurrentRefMap();
    if (!currentRefs || currentRefs.entries.length === 0) {
      return { ok: false, error: 'No refs to annotate. Run `snapshot -i` first.' };
    }
    const buffer = await annotateScreenshot(page, currentRefs);
    setBaseline();
    return {
      ok: true,
      data: {
        screenshot: buffer.toString('base64'),
        tree: formatRefMap(resolved),
        refs: resolved.entries,
        count: resolved.entries.length,
      },
    };
  }

  // Default: set as baseline for future diffs
  setBaseline();

  return {
    ok: true,
    data: {
      tree: formatRefMap(resolved),
      refs: resolved.entries,
      count: resolved.entries.length,
      rawSnapshot: resolved.rawSnapshot,
    },
  };
}

async function handleClickRef(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const page = getPage();
  const ref = params.ref as string;

  if (!ref) return { ok: false, error: 'Missing ref parameter' };

  const stale = await checkRefStale(page, ref);
  if (stale) {
    return {
      ok: false,
      error: `Ref ${ref} is stale — element no longer exists. Run \`snapshot\` to get fresh refs.`,
    };
  }

  const locator = resolveRef(page, ref);
  await locator.click();
  return { ok: true, data: { clicked: ref } };
}

async function handleFillRef(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const page = getPage();
  const ref = params.ref as string;
  const value = params.value as string;

  if (!ref) return { ok: false, error: 'Missing ref parameter' };
  if (value === undefined) return { ok: false, error: 'Missing value parameter' };

  const stale = await checkRefStale(page, ref);
  if (stale) {
    return {
      ok: false,
      error: `Ref ${ref} is stale — element no longer exists. Run \`snapshot\` to get fresh refs.`,
    };
  }

  const locator = resolveRef(page, ref);
  await locator.fill(value);
  return { ok: true, data: { filled: ref, value } };
}

async function handleHoverRef(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const page = getPage();
  const ref = params.ref as string;

  if (!ref) return { ok: false, error: 'Missing ref parameter' };

  const stale = await checkRefStale(page, ref);
  if (stale) {
    return {
      ok: false,
      error: `Ref ${ref} is stale — element no longer exists. Run \`snapshot\` to get fresh refs.`,
    };
  }

  const locator = resolveRef(page, ref);
  await locator.hover();
  return { ok: true, data: { hovered: ref } };
}

async function handlePressKey(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const page = getPage();
  const key = params.key as string;

  if (!key) return { ok: false, error: 'Missing key parameter' };

  await page.keyboard.press(key);
  return { ok: true, data: { pressed: key } };
}

// ============================================================================
// Ring Buffer Handlers
// ============================================================================

async function handleConsoleRead(
  params: Record<string, unknown>
): Promise<DaemonResponse> {
  const errorsOnly = params.errors as boolean | undefined;
  const last = params.last as number | undefined;

  let entries = errorsOnly
    ? consoleBuffer.filter((e) => e.level === 'error')
    : consoleBuffer.toArray();

  if (last) {
    entries = entries.slice(-last);
  }

  return {
    ok: true,
    data: {
      entries,
      formatted: formatConsoleEntries(entries),
      total: consoleBuffer.size,
      errorCount: getErrorCount(),
      warningCount: getWarningCount(),
    },
  };
}

async function handleNetworkRead(
  params: Record<string, unknown>
): Promise<DaemonResponse> {
  const failedOnly = params.failed as boolean | undefined;
  const last = params.last as number | undefined;

  let entries = failedOnly
    ? networkBuffer.filter((e) => e.status >= 400 || e.status === 0)
    : networkBuffer.toArray();

  if (last) {
    entries = entries.slice(-last);
  }

  return {
    ok: true,
    data: {
      entries,
      formatted: formatNetworkEntries(entries),
      total: networkBuffer.size,
      failedCount: networkBuffer.filter((e) => e.status >= 400 || e.status === 0).length,
    },
  };
}

async function handleDialogRead(): Promise<DaemonResponse> {
  const entries = dialogBuffer.toArray();
  return {
    ok: true,
    data: { entries, total: dialogBuffer.size },
  };
}

async function handleScreenshotDevices(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const page = getPage();
  const devices = params.devices as string[] | undefined;
  if (!devices || devices.length === 0) {
    return { ok: false, error: 'Missing devices parameter' };
  }

  const results = await takeDeviceScreenshots(page, devices, {
    fullPage: params.fullPage as boolean | undefined,
  });

  return {
    ok: true,
    data: {
      screenshots: results.map((r) => ({
        device: r.device.name,
        width: r.device.viewport.width,
        height: r.device.viewport.height,
        screenshot: r.buffer.toString('base64'),
      })),
    },
  };
}

async function handleVisualDiff(
  params: Record<string, unknown>
): Promise<DaemonResponse> {
  const baseline = params.baseline as string | undefined;
  const current = params.current as string | undefined;
  const threshold = params.threshold as number | undefined;

  if (!baseline || !current) {
    return { ok: false, error: 'Missing baseline or current parameter (base64 encoded PNG)' };
  }

  const baselineBuffer = Buffer.from(baseline, 'base64');
  const currentBuffer = Buffer.from(current, 'base64');
  const result = await visualDiff(baselineBuffer, currentBuffer, { threshold });

  return {
    ok: true,
    data: {
      mismatchPercentage: result.mismatchPercentage,
      mismatchCount: result.mismatchCount,
      totalPixels: result.totalPixels,
      pass: result.pass,
    },
  };
}

// ============================================================================
// Request Handling
// ============================================================================

async function handleRequest(
  action: DaemonAction,
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  switch (action) {
    case 'ping':
      return handlePing();
    case 'shutdown':
      return handleShutdown();
    case 'screenshot':
      return handleScreenshot(params as unknown as ScreenshotParams, url);
    case 'screenshot-responsive':
      return handleResponsiveScreenshot(params as unknown as ResponsiveScreenshotParams, url);
    case 'snapshot':
      return handleSnapshot(params, url);
    case 'click-ref':
      return handleClickRef(params, url);
    case 'fill-ref':
      return handleFillRef(params, url);
    case 'hover-ref':
      return handleHoverRef(params, url);
    case 'press-key':
      return handlePressKey(params, url);
    case 'console-read':
      return handleConsoleRead(params);
    case 'network-read':
      return handleNetworkRead(params);
    case 'dialog-read':
      return handleDialogRead();
    case 'screenshot-devices':
      return handleScreenshotDevices(params, url);
    case 'visual-diff':
      return handleVisualDiff(params);
    default:
      return { ok: false, error: `Unknown action: ${action}` };
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX_BODY = 1024 * 1024; // 1MB max

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: DaemonResponse): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// ============================================================================
// Server Lifecycle
// ============================================================================

export interface StartServerOptions {
  port: number;
  token: string;
  url: string;
  onShutdown: () => void;
}

/**
 * Start the daemon HTTP server.
 * Binds to 127.0.0.1 (localhost only) on the specified port.
 */
export function startServer(options: StartServerOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    shutdownCallback = options.onShutdown;

    httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        });
        res.end();
        return;
      }

      // Only accept POST
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
        return;
      }

      // Validate bearer token
      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${options.token}`) {
        sendJson(res, 401, { ok: false, error: 'Unauthorized' });
        return;
      }

      // Parse action from URL path: /api/{action}
      const urlPath = req.url ?? '/';
      const match = urlPath.match(/^\/api\/([a-z-]+)$/);
      if (!match) {
        sendJson(res, 404, { ok: false, error: 'Not found' });
        return;
      }
      const action = match[1] as DaemonAction;

      // Reset idle timer on every valid request
      resetIdleTimer();

      try {
        const body = await readBody(req);
        const parsed = body ? JSON.parse(body) : {};
        const params = parsed.params ?? {};
        const response = await handleRequest(action, params, options.url);
        sendJson(res, response.ok ? 200 : 400, response);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Daemon] Request error:', message);
        sendJson(res, 500, { ok: false, error: message });
      }
    });

    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`Port ${options.port} is in use`));
      } else {
        reject(error);
      }
    });

    // Bind to localhost only
    httpServer.listen(options.port, '127.0.0.1', () => {
      console.error(`[Daemon] HTTP server listening on http://127.0.0.1:${options.port}`);
      resetIdleTimer();
      resolve();
    });
  });
}

/**
 * Shut down the daemon: close browser, close HTTP server, call shutdown callback.
 */
export async function shutdown(): Promise<void> {
  console.error('[Daemon] Shutting down...');

  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  await closeBrowser();

  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }

  shutdownCallback?.();
}
