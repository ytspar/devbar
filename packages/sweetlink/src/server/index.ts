/**
 * Sweetlink WebSocket Server
 *
 * Main server module that handles WebSocket connections and message routing.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { WebSocket, WebSocketServer } from 'ws';

// Import types and type guards
import type {
  ConsoleLog,
  HmrScreenshotData,
  SweetlinkCommand,
  SweetlinkResponse,
} from '../types.js';
import {
  getErrorMessage,
  isDesignReviewScreenshotData,
  isSaveOutlineData,
  isSaveSchemaData,
  isSaveScreenshotData,
  isSaveSettingsData,
} from '../types.js';

// Import constants
import { PACKAGE_INFO, SCREENSHOT_REQUEST_TIMEOUT_MS } from './constants.js';

// Import handlers
import {
  handleDesignReviewScreenshot,
  handleHmrScreenshot,
  handleLoadSettings,
  handleSaveOutline,
  handleSaveSchema,
  handleSaveScreenshot,
  handleSaveSettings,
} from './handlers/index.js';

/**
 * Send a success response to the WebSocket client
 */
function sendSuccess(ws: WebSocket, type: string, data: Record<string, unknown>): void {
  ws.send(
    JSON.stringify({
      success: true,
      type,
      timestamp: Date.now(),
      ...data,
    })
  );
}

/**
 * Send an error response to the WebSocket client
 */
function sendError(ws: WebSocket, type: string, error: unknown): void {
  ws.send(
    JSON.stringify({
      success: false,
      type,
      error: getErrorMessage(error),
      timestamp: Date.now(),
    })
  );
}

// Import Anthropic settings for API key check
import { CLAUDE_MODEL, CLAUDE_PRICING } from './anthropic.js';

// Import subscription management
import {
  channelSubscriptions,
  cleanupClientSubscriptions,
  logSubscriptions,
  pendingScreenshotRequests,
} from './subscriptions.js';

// Re-export types for backwards compatibility
export type { SweetlinkCommand, SweetlinkResponse, ConsoleLog, HmrScreenshotData };

// Module-level state
let wss: WebSocketServer | null = null;
let httpServer: ReturnType<typeof createServer> | null = null;
let activePort: number | null = null;
let associatedAppPort: number | null = null;
let projectRoot: string | null = null;
const clients = new Map<WebSocket, { type: 'browser' | 'cli'; id: string; origin?: string }>();

// WeakMap for CLI client references (prevents memory leaks)
const cliClientMap = new WeakMap<WebSocket, WebSocket>();

// HMR screenshot sequence counter
let hmrSequenceNumber = 0;

// Security: Maximum regex pattern length to prevent ReDoS
const MAX_REGEX_PATTERN_LENGTH = 200;

/**
 * Safely compile a regex pattern with length and complexity limits
 * @throws Error if pattern is invalid or too complex
 */
function safeRegex(pattern: string): RegExp {
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    throw new Error(`Regex pattern too long (max ${MAX_REGEX_PATTERN_LENGTH} chars)`);
  }
  // Block patterns known to cause catastrophic backtracking
  const dangerousPatterns = [
    /\(\.\*\)\+/, // (.*)+
    /\(\.\+\)\+/, // (.+)+
    /\([^)]*\+\)\+/, // (a+)+
    /\([^)]*\*\)\+/, // (a*)+
  ];
  for (const dangerous of dangerousPatterns) {
    if (dangerous.test(pattern)) {
      throw new Error('Regex pattern contains potentially dangerous backtracking');
    }
  }
  return new RegExp(pattern, 'i');
}

/**
 * Get the project root directory (where the server was started)
 * This is captured at server initialization time for consistency
 */
export function getProjectRoot(): string {
  return projectRoot ?? process.cwd();
}

export interface InitSweetlinkOptions {
  port: number;
  /** Number of alternative ports to try if the primary port is in use (default: 10) */
  maxPortRetries?: number;
  /** Called when server starts successfully with the actual port */
  onReady?: (port: number) => void;
  /** The port of the associated dev server (e.g., Next.js port). Used to validate browser connections. */
  appPort?: number;
}

/**
 * Initialize Sweetlink WebSocket server
 * Automatically tries alternative ports if the specified port is in use
 */
export function initSweetlink(options: InitSweetlinkOptions): Promise<WebSocketServer> {
  return new Promise((resolve, reject) => {
    if (wss) {
      console.warn('[Sweetlink] Server already initialized on port', activePort);
      resolve(wss);
      return;
    }

    const maxRetries = options.maxPortRetries ?? 10;
    const currentPort = options.port;
    let attempts = 0;

    // Capture project root at initialization time (before any cwd changes)
    projectRoot = process.cwd();
    console.log(`[Sweetlink] Project root: ${projectRoot}`);

    // Store the associated app port for origin validation
    associatedAppPort = options.appPort ?? null;
    if (associatedAppPort) {
      console.log(`[Sweetlink] Associated with app on port ${associatedAppPort}`);
    }

    const tryPort = (port: number) => {
      attempts++;

      // Create HTTP server to handle direct HTTP requests with package info
      const localHttpServer = createServer((_req: IncomingMessage, res: ServerResponse) => {
        // Return package info for direct HTTP requests (not WebSocket upgrades)
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'http://localhost',
        });
        res.end(
          JSON.stringify(
            {
              ...PACKAGE_INFO,
              status: 'running',
              port: port,
              appPort: associatedAppPort,
              connectedClients: clients.size,
              uptime: process.uptime(),
            },
            null,
            2
          )
        );
      });

      localHttpServer.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          localHttpServer.close();
          if (attempts < maxRetries) {
            const nextPort = port + 1;
            console.log(`[Sweetlink] Port ${port} in use, trying ${nextPort}...`);
            tryPort(nextPort);
          } else {
            const errMsg = `[Sweetlink] Could not find available port after ${maxRetries} attempts (tried ${options.port}-${port})`;
            console.error(errMsg);
            reject(new Error(errMsg));
          }
        } else {
          console.error('[Sweetlink] Server error:', error);
          reject(error);
        }
      });

      localHttpServer.listen(port, () => {
        // Create WebSocket server on top of HTTP server
        const server = new WebSocketServer({ server: localHttpServer });

        // Server started successfully - store in module state
        httpServer = localHttpServer;
        wss = server;
        activePort = port;
        console.log(`[Sweetlink] WebSocket server started on ws://localhost:${port}`);
        console.log(`[Sweetlink] HTTP info available at http://localhost:${port}`);
        if (port !== options.port) {
          console.log(
            `[Sweetlink] Note: Using alternative port (original ${options.port} was in use)`
          );
        }
        options.onReady?.(port);
        setupServerHandlers(server);
        resolve(server);
      });
    };

    tryPort(currentPort);
  });
}

/** Get the port the server is running on */
export function getSweetlinkPort(): number | null {
  return activePort;
}

/** Get the associated app port */
export function getAssociatedAppPort(): number | null {
  return associatedAppPort;
}

function setupServerHandlers(server: WebSocketServer) {
  server.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
    const origin = req.headers.origin;

    // Validate origin - only accept localhost connections
    if (origin) {
      const isLocalhost =
        origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');

      if (!isLocalhost) {
        console.log(`[Sweetlink] Rejecting non-localhost connection from ${origin}`);
        ws.close(4001, 'Only localhost connections allowed');
        return;
      }

      // If appPort is configured, enforce strict port matching for security
      if (associatedAppPort) {
        const expectedOrigins = [
          `http://localhost:${associatedAppPort}`,
          `http://127.0.0.1:${associatedAppPort}`,
        ];
        const isExpectedOrigin = expectedOrigins.some((expected) => origin.startsWith(expected));
        if (!isExpectedOrigin) {
          console.warn(
            `[Sweetlink] Connection from unexpected port: ${origin} (expected port: ${associatedAppPort})`
          );
          // Still allow but warn - strict mode could reject here
        }
      }
    }

    // Initially mark as CLI client, will be updated if browser identifies itself
    clients.set(ws, { type: 'cli', id: clientId, origin: origin || undefined });

    console.log(`[Sweetlink] Client connected: ${clientId}${origin ? ` from ${origin}` : ''}`);

    ws.on('message', async (message: Buffer) => {
      try {
        const command = JSON.parse(message.toString()) as SweetlinkCommand;

        // Skip logging for response messages (no type field = response from browser)
        if (command.type) {
          console.log('[Sweetlink] Received message type:', command.type);
        }

        // Handle browser client identification
        if (command.type === 'browser-client-ready') {
          const clientInfo = clients.get(ws);
          clients.set(ws, { type: 'browser', id: clientId, origin: clientInfo?.origin });
          console.log(`[Sweetlink] Browser client identified: ${clientId}`);

          // Send server info back to the browser so it can verify connection
          // Security: Don't expose projectDir to prevent path disclosure
          ws.send(
            JSON.stringify({
              type: 'server-info',
              appPort: associatedAppPort,
              wsPort: activePort,
              timestamp: Date.now(),
            })
          );
          return;
        }

        // Handle API key check request from browser
        if (command.type === 'check-api-key') {
          const apiKey = process.env.ANTHROPIC_API_KEY;
          const hasKey = Boolean(apiKey && apiKey.length > 0);

          // Security: Only return boolean, don't expose any key info
          ws.send(
            JSON.stringify({
              type: 'api-key-status',
              configured: hasKey,
              model: CLAUDE_MODEL,
              pricing: CLAUDE_PRICING,
              timestamp: Date.now(),
            })
          );
          return;
        }

        // Handle browser-originated save commands
        const clientInfo = clients.get(ws);
        const isBrowserClient = clientInfo?.type === 'browser';

        if (command.type === 'save-screenshot' && isBrowserClient) {
          if (!isSaveScreenshotData(command.data)) {
            sendError(ws, 'screenshot-error', 'Invalid screenshot data');
            return;
          }
          try {
            const savedPath = await handleSaveScreenshot(command.data);
            console.log(`[Sweetlink] Screenshot saved to ${savedPath}`);
            sendSuccess(ws, 'screenshot-saved', { path: savedPath });
          } catch (error) {
            console.error('[Sweetlink] Screenshot save failed:', getErrorMessage(error));
            sendError(ws, 'screenshot-error', error);
          }
          return;
        }

        if (command.type === 'design-review-screenshot' && isBrowserClient) {
          if (!isDesignReviewScreenshotData(command.data)) {
            sendError(ws, 'design-review-error', 'Invalid design review data');
            return;
          }
          try {
            const result = await handleDesignReviewScreenshot(command.data);
            console.log(`[Sweetlink] Design review saved to ${result.reviewPath}`);
            sendSuccess(ws, 'design-review-saved', {
              screenshotPath: result.screenshotPath,
              reviewPath: result.reviewPath,
            });
          } catch (error) {
            console.error('[Sweetlink] Design review failed:', getErrorMessage(error));
            sendError(ws, 'design-review-error', error);
          }
          return;
        }

        if (command.type === 'save-outline' && isBrowserClient) {
          if (!isSaveOutlineData(command.data)) {
            sendError(ws, 'outline-error', 'Invalid outline data');
            return;
          }
          try {
            const result = await handleSaveOutline(command.data);
            console.log(`[Sweetlink] Outline saved to ${result.outlinePath}`);
            sendSuccess(ws, 'outline-saved', { outlinePath: result.outlinePath });
          } catch (error) {
            console.error('[Sweetlink] Outline save failed:', getErrorMessage(error));
            sendError(ws, 'outline-error', error);
          }
          return;
        }

        if (command.type === 'save-schema' && isBrowserClient) {
          if (!isSaveSchemaData(command.data)) {
            sendError(ws, 'schema-error', 'Invalid schema data');
            return;
          }
          try {
            const result = await handleSaveSchema(command.data);
            console.log(`[Sweetlink] Schema saved to ${result.schemaPath}`);
            sendSuccess(ws, 'schema-saved', { schemaPath: result.schemaPath });
          } catch (error) {
            console.error('[Sweetlink] Schema save failed:', getErrorMessage(error));
            sendError(ws, 'schema-error', error);
          }
          return;
        }

        // Handle save-settings from browser
        if (command.type === 'save-settings' && isBrowserClient) {
          if (!isSaveSettingsData(command.data)) {
            sendError(ws, 'settings-error', 'Invalid settings data');
            return;
          }
          try {
            // Type assertion after validation - handler expects DevBarSettings
            // Cast through unknown as the runtime validation ensures structure
            const result = await handleSaveSettings(
              command.data as unknown as Parameters<typeof handleSaveSettings>[0]
            );
            console.log(`[Sweetlink] Settings saved to ${result.settingsPath}`);
            sendSuccess(ws, 'settings-saved', { settingsPath: result.settingsPath });
          } catch (error) {
            console.error('[Sweetlink] Settings save failed:', getErrorMessage(error));
            sendError(ws, 'settings-error', error);
          }
          return;
        }

        // Handle load-settings from browser
        if (command.type === 'load-settings' && clientInfo?.type === 'browser') {
          try {
            const settings = await handleLoadSettings();
            sendSuccess(ws, 'settings-loaded', { settings });
          } catch (error) {
            console.error(
              '[Sweetlink] Settings load failed:',
              error instanceof Error ? error.message : error
            );
            sendError(ws, 'settings-error', error);
          }
          return;
        }

        // ============================================================================
        // v1.4.0: New message handlers
        // ============================================================================

        // Handle request-screenshot from CLI/Agent
        if (command.type === 'request-screenshot' && clientInfo?.type === 'cli') {
          const requestId = command.requestId || `req-${Date.now()}`;
          console.log(`[Sweetlink] Screenshot request ${requestId} from CLI`);

          const browserClients = Array.from(clients.entries())
            .filter(([, info]) => info.type === 'browser')
            .map(([client]) => client);

          if (browserClients.length === 0) {
            ws.send(
              JSON.stringify({
                type: 'screenshot-response',
                requestId,
                success: false,
                error: 'No browser client connected',
                timestamp: Date.now(),
              })
            );
            return;
          }

          const timeout = setTimeout(() => {
            const pending = pendingScreenshotRequests.get(requestId);
            if (pending) {
              pendingScreenshotRequests.delete(requestId);
              pending.clientWs.send(
                JSON.stringify({
                  type: 'screenshot-response',
                  requestId,
                  success: false,
                  error: 'Screenshot request timed out',
                  timestamp: Date.now(),
                })
              );
            }
          }, SCREENSHOT_REQUEST_TIMEOUT_MS);

          pendingScreenshotRequests.set(requestId, { requestId, clientWs: ws, timeout });

          browserClients[0].send(
            JSON.stringify({
              type: 'request-screenshot',
              requestId,
              selector: command.selector,
              format: command.format || 'jpeg',
              quality: command.quality || 0.7,
              scale: command.scale || 0.25,
              includeMetadata: command.includeMetadata !== false,
            })
          );
          return;
        }

        // Handle screenshot-response from browser
        if (
          command.type === 'screenshot-response' &&
          clientInfo?.type === 'browser' &&
          command.requestId
        ) {
          const pending = pendingScreenshotRequests.get(command.requestId);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingScreenshotRequests.delete(command.requestId);
            if (pending.clientWs.readyState === WebSocket.OPEN) {
              pending.clientWs.send(message.toString());
            }
          }
          return;
        }

        // Handle channel subscription (e.g., 'hmr-screenshots')
        if (command.type === 'subscribe') {
          const channel = command.channel;
          if (channel) {
            console.log(`[Sweetlink] Client subscribing to channel: ${channel}`);
            if (!channelSubscriptions.has(channel)) {
              channelSubscriptions.set(channel, []);
            }
            channelSubscriptions.get(channel)!.push({ channel, clientWs: ws });
            sendSuccess(ws, 'subscribed', { channel });
            return;
          }
        }

        // Handle channel unsubscription
        if (command.type === 'unsubscribe') {
          const channel = command.channel;
          if (channel && channelSubscriptions.has(channel)) {
            const subs = channelSubscriptions.get(channel)!;
            const idx = subs.findIndex((s) => s.clientWs === ws);
            if (idx !== -1) {
              subs.splice(idx, 1);
              console.log(`[Sweetlink] Client unsubscribed from channel: ${channel}`);
            }
            sendSuccess(ws, 'unsubscribed', { channel });
            return;
          }
        }

        // Handle log subscription
        if (command.type === 'log-subscribe') {
          const subscriptionId = command.subscriptionId || `log-${Date.now()}`;
          console.log(`[Sweetlink] Log subscription created: ${subscriptionId}`);
          logSubscriptions.set(subscriptionId, {
            subscriptionId,
            clientWs: ws,
            filters: command.filters,
          });
          sendSuccess(ws, 'log-subscribed', { subscriptionId });
          return;
        }

        // Handle log unsubscription
        if (command.type === 'log-unsubscribe') {
          if (command.subscriptionId && logSubscriptions.has(command.subscriptionId)) {
            logSubscriptions.delete(command.subscriptionId);
            console.log(`[Sweetlink] Log subscription removed: ${command.subscriptionId}`);
            sendSuccess(ws, 'log-unsubscribed', { subscriptionId: command.subscriptionId });
          }
          return;
        }

        // Handle HMR screenshot from browser
        if (command.type === 'hmr-screenshot' && clientInfo?.type === 'browser' && command.data) {
          const hmrData = command.data as HmrScreenshotData;
          hmrSequenceNumber++;

          console.log(`[Sweetlink] HMR screenshot received (${hmrData.trigger})`);
          if (hmrData.changedFile) {
            console.log(`[Sweetlink] Changed file: ${hmrData.changedFile}`);
          }

          const result = await handleHmrScreenshot(hmrData);

          const notificationData = {
            screenshotPath: result.screenshotPath,
            logsPath: result.logsPath,
            trigger: hmrData.trigger,
            changedFile: hmrData.changedFile,
            timestamp: hmrData.timestamp,
            sequenceNumber: hmrSequenceNumber,
            logSummary: result.logSummary,
          };

          const subscribers = channelSubscriptions.get('hmr-screenshots') || [];
          for (const sub of subscribers) {
            if (sub.clientWs.readyState === WebSocket.OPEN) {
              sendSuccess(sub.clientWs, 'hmr-screenshot-saved', notificationData);
            }
          }

          sendSuccess(ws, 'hmr-screenshot-saved', {
            screenshotPath: result.screenshotPath,
            logsPath: result.logsPath,
            sequenceNumber: hmrSequenceNumber,
          });
          return;
        }

        // Handle log-event from browser (for streaming to subscribers)
        if (command.type === 'log-event' && clientInfo?.type === 'browser' && command.data) {
          const log = command.data as ConsoleLog;
          for (const [, sub] of logSubscriptions) {
            if (sub.clientWs.readyState !== WebSocket.OPEN) continue;

            if (sub.filters) {
              if (sub.filters.levels && !sub.filters.levels.includes(log.level)) continue;
              if (sub.filters.pattern) {
                try {
                  const regex = safeRegex(sub.filters.pattern);
                  if (!regex.test(log.message)) continue;
                } catch {
                  console.warn(
                    `[Sweetlink] Skipping invalid regex pattern: ${sub.filters.pattern}`
                  );
                }
              }
              if (sub.filters.source && log.source !== sub.filters.source) continue;
            }

            sub.clientWs.send(
              JSON.stringify({
                type: 'log-event',
                subscriptionId: sub.subscriptionId,
                log,
                timestamp: Date.now(),
              })
            );
          }
          return;
        }

        // Forward CLI commands to browser, browser responses to CLI
        if (clientInfo?.type === 'cli') {
          console.log(`[Sweetlink] Received command from CLI: ${command.type}`);

          const browserClients = Array.from(clients.entries())
            .filter(([, info]) => info.type === 'browser')
            .map(([client]) => client);

          if (browserClients.length === 0) {
            ws.send(
              JSON.stringify({
                success: false,
                error: 'No browser client connected. Is the dev server running with the page open?',
                timestamp: Date.now(),
              } as SweetlinkResponse)
            );
            return;
          }

          const browserWs = browserClients[0];
          cliClientMap.set(browserWs, ws);
          browserWs.send(message.toString());
        } else if (clientInfo?.type === 'browser') {
          const cliWs = cliClientMap.get(ws);
          if (cliWs && cliWs.readyState === WebSocket.OPEN) {
            cliWs.send(message.toString());
            cliClientMap.delete(ws);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Sweetlink] Error processing message:', errorMessage);

        ws.send(
          JSON.stringify({
            success: false,
            error: errorMessage,
            timestamp: Date.now(),
          } as SweetlinkResponse)
        );
      }
    });

    ws.on('close', () => {
      const clientInfo = clients.get(ws);
      console.log(`[Sweetlink] Client disconnected: ${clientInfo?.id} (${clientInfo?.type})`);
      cleanupClientSubscriptions(ws);
      cliClientMap.delete(ws); // Explicit cleanup (WeakMap would auto-cleanup on GC)
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error(`[Sweetlink] WebSocket error:`, error);
      cleanupClientSubscriptions(ws);
      cliClientMap.delete(ws); // Explicit cleanup (WeakMap would auto-cleanup on GC)
      clients.delete(ws);
    });
  });
}

export function closeSweetlink(): Promise<void> {
  return new Promise((resolve) => {
    if (!wss && !httpServer) {
      resolve();
      return;
    }

    console.log('[Sweetlink] Closing WebSocket server on port', activePort);

    // Close all client connections first
    clients.forEach((_, client) => client.close());
    clients.clear();

    // Close WebSocket server
    if (wss) {
      wss.close();
      wss = null;
    }

    // Close HTTP server (this releases the port)
    if (httpServer) {
      httpServer.close(() => {
        httpServer = null;
        activePort = null;
        resolve();
      });
    } else {
      activePort = null;
      resolve();
    }
  });
}
