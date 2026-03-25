/**
 * Daemon HTTP Server
 *
 * Localhost-only HTTP server with bearer token auth.
 * Routes POST requests to /api/{action} and dispatches to handlers.
 * Manages idle timer for auto-shutdown.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { closeBrowser, initBrowser, takeResponsiveScreenshots, takeScreenshot } from './browser.js';
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
