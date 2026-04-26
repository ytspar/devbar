/**
 * Daemon HTTP Server
 *
 * Localhost-only HTTP server with bearer token auth.
 * Routes POST requests to /api/{action} and dispatches to handlers.
 * Manages idle timer for auto-shutdown.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { closeBrowser, getBrowserInstance, getPage, initBrowser, takeResponsiveScreenshots, takeScreenshot } from './browser.js';
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
import { getRecordingPage, getRecordingStatus, isRecording, logAction, startRecording, stopRecording } from './recording.js';
import { detectServerErrors } from './errorPatterns.js';
import { generateSummary } from './summary.js';
import { generateViewer } from './viewer.js';
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
let daemonPort: number | null = null;

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

  // During a recording, screenshots must target the recording page so the
  // captured image matches what the video shows, and the action is logged
  // into the session manifest.
  const recPage = getRecordingPage();
  const targetPage = recPage ?? undefined;

  const padding = (params as ScreenshotParams & { padding?: number }).padding;
  const { buffer, width, height, matchCount, pageHeight, viewportHeight } = await takeScreenshot({
    selector: params.selector,
    fullPage: params.fullPage,
    viewport: params.viewport,
    padding: typeof padding === 'number' ? padding : undefined,
    page: targetPage,
  });

  if (recPage && isRecording()) {
    const args: string[] = [];
    if (params.selector) args.push(`--selector=${params.selector}`);
    if (params.fullPage) args.push('--full-page');
    if (params.viewport) args.push(`--viewport=${params.viewport}`);
    await logAction('screenshot', args, recPage);
  }

  return {
    ok: true,
    data: {
      screenshot: buffer.toString('base64'),
      width,
      height,
      matchCount,
      pageHeight,
      viewportHeight,
    },
  };
}

async function handleResponsiveScreenshot(
  params: ResponsiveScreenshotParams,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const viewports = params.viewports ?? DEFAULT_RESPONSIVE_VIEWPORTS;
  // Default to fullPage so users see the page in its entirety at each
  // breakpoint — that's the typical reason to invoke `--responsive`.
  // Caller can pass `fullPage: false` explicitly to opt out.
  const fullPage = params.fullPage !== false;
  const results = await takeResponsiveScreenshots({
    viewports,
    fullPage,
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
  const recPage = getRecordingPage();
  const page = recPage ?? getPage();
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
    // Pull dims from the PNG IHDR so callers don't see undefined.
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    setBaseline();
    return {
      ok: true,
      data: {
        screenshot: buffer.toString('base64'),
        width,
        height,
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

  // Use recording page if recording, otherwise main page
  const recPage = getRecordingPage();
  const page = recPage ?? getPage();
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

  // Fail fast if the element is disabled — without this check, Playwright's
  // click would wait for the default 30s before throwing.
  const enabled = await locator.isEnabled().catch(() => true);
  if (!enabled) {
    return { ok: false, error: `Ref ${ref} is disabled — cannot click.` };
  }

  const box = await locator.boundingBox();
  await locator.click();

  // Log action if recording
  if (isRecording()) {
    await logAction('click', [ref], page, box ?? undefined);
  }

  return { ok: true, data: { clicked: ref } };
}

async function handleFillRef(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const recPage = getRecordingPage();
  const page = recPage ?? getPage();
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

  // Fail fast for non-fillable elements (e.g. <option>, <select>, <button>) —
  // Playwright's fill() would otherwise wait 30s for the editable check.
  const editable = await locator.isEditable().catch(() => false);
  if (!editable) {
    return {
      ok: false,
      error: `Ref ${ref} is not editable (use click-ref/press-key for non-text inputs).`,
    };
  }

  const box = await locator.boundingBox();
  await locator.fill(value);

  if (isRecording()) {
    await logAction('fill', [ref, value], page, box ?? undefined);
  }

  return { ok: true, data: { filled: ref, value } };
}

async function handleClickCss(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);

  // Route to the recording page when a session is active so the click
  // appears in the video and gets logged into the manifest.
  const recPage = getRecordingPage();
  const page = recPage ?? getPage();

  const selector = params.selector as string | undefined;
  const text = params.text as string | undefined;
  const index = (params.index as number | undefined) ?? 0;

  if (!selector && !text) {
    return { ok: false, error: 'Missing selector or text parameter' };
  }

  let locator;
  if (selector && text) {
    locator = page.locator(selector, { hasText: text });
  } else if (selector) {
    locator = page.locator(selector);
  } else {
    locator = page.getByText(text!, { exact: false });
  }
  const target = locator.nth(index);

  try {
    await target.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    const found = await locator.count();
    return { ok: false, error: `No element found matching: ${selector ?? text} (${found} matches)` };
  }

  const box = await target.boundingBox();
  await target.click();

  const tag = await target.evaluate((el) => el.tagName.toLowerCase()).catch(() => 'unknown');
  const found = await locator.count();

  if (isRecording()) {
    const args: string[] = [];
    if (selector) args.push(`--selector=${selector}`);
    if (text) args.push(`--text=${text}`);
    if (index > 0) args.push(`--index=${index}`);
    await logAction('click', args, page, box ?? undefined);
  }

  return { ok: true, data: { clicked: tag, found, index } };
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
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  // Ensure the configured page is loaded so the listeners have something to
  // observe. Without this, a fresh daemon returns an empty buffer with no
  // explanation.
  await initBrowser(url);

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
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
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

async function handleDialogRead(url: string): Promise<DaemonResponse> {
  await initBrowser(url);
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

  const { results, unknown } = await takeDeviceScreenshots(page, devices, {
    fullPage: params.fullPage as boolean | undefined,
  });

  // Surface unknown device names to the caller instead of silently dropping
  // them. If everything was unknown, treat as a hard error.
  if (results.length === 0 && unknown.length > 0) {
    const { listDeviceNames } = await import('./devices.js');
    return {
      ok: false,
      error: `Unknown device(s): ${unknown.join(', ')}. Known: ${listDeviceNames().join(', ')}`,
    };
  }

  return {
    ok: true,
    data: {
      screenshots: results.map((r) => ({
        device: r.device.name,
        width: r.device.viewport.width,
        height: r.device.viewport.height,
        screenshot: r.buffer.toString('base64'),
      })),
      unknown,
    },
  };
}

async function handleRecordStart(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const browser = getBrowserInstance();
  const viewportParam = params.viewport as string | undefined;
  let viewport: { width: number; height: number } | undefined;
  if (viewportParam) {
    const { parseViewport, DEFAULT_VIEWPORT } = await import('../viewportUtils.js');
    viewport = parseViewport(viewportParam, DEFAULT_VIEWPORT);
  }
  const result = await startRecording(browser, url, '.sweetlink', { viewport });
  return { ok: true, data: { sessionId: result.sessionId } };
}

async function handleRecordStop(): Promise<DaemonResponse> {
  const manifest = await stopRecording();
  if (!manifest) {
    return { ok: false, error: 'No recording in progress' };
  }

  // Auto-generate viewer HTML + summary report
  const sessionDir = `.sweetlink/${manifest.sessionId}`;
  let viewerPath: string | undefined;
  let summaryPath: string | undefined;

  try {
    const consoleLogs = consoleBuffer.toArray();
    const networkLogs = networkBuffer.toArray();

    viewerPath = await generateViewer(manifest, {
      sessionDir,
      consoleEntries: consoleLogs,
      networkEntries: networkLogs,
    });

    // Generate SUMMARY.md
    const { promises: fsp } = await import('fs');
    // Detect server errors from console log messages
    const consoleText = consoleLogs.map(e => e.message).join('\n');
    const serverErrors = detectServerErrors(consoleText);
    if (serverErrors.length > 0) {
      manifest.errors.server = serverErrors.length;
    }

    const summaryMd = generateSummary({
      manifest,
      consoleEntries: consoleLogs,
      networkEntries: networkLogs,
      serverErrors: serverErrors.map(e => ({
        source: 'server' as const,
        message: e.line,
        timestamp: Date.now(),
        code: e.language,
      })),
      gitBranch: manifest.gitBranch,
      gitCommit: manifest.gitCommit,
    });
    summaryPath = `${sessionDir}/SUMMARY.md`;
    await fsp.writeFile(summaryPath, summaryMd, 'utf-8');
    console.error(`[Daemon] Summary saved: ${summaryPath}`);
  } catch (e) {
    console.error('[Daemon] Report generation error:', e);
  }

  // Include a browser-accessible URL for the viewer
  const viewerUrl = manifest.sessionId && daemonPort ? `http://127.0.0.1:${daemonPort}/viewer/${manifest.sessionId}` : undefined;

  return { ok: true, data: { manifest, viewerPath, viewerUrl, summaryPath } };
}

async function handleRecordStatus(): Promise<DaemonResponse> {
  const status = getRecordingStatus();
  return { ok: true, data: status };
}

async function handleGenerateViewer(
  params: Record<string, unknown>
): Promise<DaemonResponse> {
  const sessionDir = params.sessionDir as string;
  const outputPath = params.outputPath as string | undefined;

  if (!sessionDir) return { ok: false, error: 'Missing sessionDir parameter' };

  try {
    const { promises: fsp } = await import('fs');
    const manifestRaw = await fsp.readFile(`${sessionDir}/sweetlink-session.json`, 'utf-8');
    const manifest = JSON.parse(manifestRaw);
    const viewerPath = await generateViewer(manifest, {
      sessionDir,
      outputPath,
      consoleEntries: consoleBuffer.toArray(),
      networkEntries: networkBuffer.toArray(),
    });
    return { ok: true, data: { viewerPath } };
  } catch (error) {
    return { ok: false, error: `Failed to generate viewer: ${error instanceof Error ? error.message : error}` };
  }
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
    case 'click-css':
      return handleClickCss(params, url);
    case 'fill-ref':
      return handleFillRef(params, url);
    case 'hover-ref':
      return handleHoverRef(params, url);
    case 'press-key':
      return handlePressKey(params, url);
    case 'console-read':
      return handleConsoleRead(params, url);
    case 'network-read':
      return handleNetworkRead(params, url);
    case 'dialog-read':
      return handleDialogRead(url);
    case 'screenshot-devices':
      return handleScreenshotDevices(params, url);
    case 'visual-diff':
      return handleVisualDiff(params);
    case 'record-start':
      return handleRecordStart(params, url);
    case 'record-stop':
      return handleRecordStop();
    case 'record-status':
      return handleRecordStatus();
    case 'generate-viewer':
      return handleGenerateViewer(params);
    default:
      return { ok: false, error: `Unknown action: ${action}` };
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX_BODY = 10 * 1024 * 1024; // 10MB max (visual-diff sends two screenshots)

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
    daemonPort = options.port;

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

      // Serve viewer HTML via GET (no auth required — localhost only)
      if (req.method === 'GET') {
        const urlPath = req.url ?? '/';
        const viewerMatch = urlPath.match(/^\/viewer\/([a-z0-9-]+)$/);
        if (viewerMatch) {
          const sid = viewerMatch[1];
          try {
            const { promises: fsp } = await import('fs');
            const viewerHtml = await fsp.readFile(`.sweetlink/${sid}/viewer.html`, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(viewerHtml);
          } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Viewer not found');
          }
          return;
        }
        // GET /viewers — list available sessions
        if (urlPath === '/viewers') {
          try {
            const { promises: fsp } = await import('fs');
            const entries = await fsp.readdir('.sweetlink', { withFileTypes: true });
            const sessions = entries
              .filter(e => e.isDirectory() && e.name.startsWith('session-'))
              .map(e => e.name)
              .sort()
              .reverse();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ sessions, daemonPort: options.port }));
          } catch {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ sessions: [] }));
          }
          return;
        }
        sendJson(res, 404, { ok: false, error: 'Not found' });
        return;
      }

      // Only accept POST for API
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
