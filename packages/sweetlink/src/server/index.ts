/**
 * Sweetlink WebSocket Server
 *
 * Main server module that handles WebSocket connections and message routing.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';

// Import types
import type {
  SweetlinkCommand,
  SweetlinkResponse,
  ConsoleLog,
  HmrScreenshotData,
} from '../types.js';

// Import constants
import { PACKAGE_INFO, SCREENSHOT_REQUEST_TIMEOUT_MS } from './constants.js';

// Import handlers
import {
  handleSaveScreenshot,
  handleDesignReviewScreenshot,
  handleSaveOutline,
  handleSaveSchema,
  handleHmrScreenshot,
} from './handlers/index.js';

// Import Anthropic settings for API key check
import { CLAUDE_MODEL, CLAUDE_PRICING } from './anthropic.js';

// Import subscription management
import {
  logSubscriptions,
  channelSubscriptions,
  pendingScreenshotRequests,
  cleanupClientSubscriptions,
} from './subscriptions.js';

// Re-export types for backwards compatibility
export type { SweetlinkCommand, SweetlinkResponse, ConsoleLog, HmrScreenshotData };

// Module-level state
let wss: WebSocketServer | null = null;
let activePort: number | null = null;
let associatedAppPort: number | null = null;
const clients = new Map<WebSocket, { type: 'browser' | 'cli'; id: string; origin?: string }>();

// HMR screenshot sequence counter
let hmrSequenceNumber = 0;

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
    let currentPort = options.port;
    let attempts = 0;

    // Store the associated app port for origin validation
    associatedAppPort = options.appPort ?? null;
    if (associatedAppPort) {
      console.log(`[Sweetlink] Associated with app on port ${associatedAppPort}`);
    }

    const tryPort = (port: number) => {
      attempts++;

      // Create HTTP server to handle direct HTTP requests with package info
      const httpServer = createServer((_req: IncomingMessage, res: ServerResponse) => {
        // Return package info for direct HTTP requests (not WebSocket upgrades)
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          ...PACKAGE_INFO,
          status: 'running',
          port: port,
          appPort: associatedAppPort,
          connectedClients: clients.size,
          uptime: process.uptime(),
        }, null, 2));
      });

      httpServer.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          httpServer.close();
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

      httpServer.listen(port, () => {
        // Create WebSocket server on top of HTTP server
        const server = new WebSocketServer({ server: httpServer });

        // Server started successfully
        wss = server;
        activePort = port;
        console.log(`[Sweetlink] WebSocket server started on ws://localhost:${port}`);
        console.log(`[Sweetlink] HTTP info available at http://localhost:${port}`);
        if (port !== options.port) {
          console.log(`[Sweetlink] Note: Using alternative port (original ${options.port} was in use)`);
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

    // Validate origin - accept any localhost connection in dev mode
    if (origin) {
      const isLocalhost = origin.startsWith('http://localhost:') ||
                          origin.startsWith('http://127.0.0.1:');

      if (!isLocalhost) {
        console.log(`[Sweetlink] Rejecting non-localhost connection from ${origin}`);
        ws.close(4001, 'Only localhost connections allowed');
        return;
      }

      // Log if connection is from a different port than expected (informational only)
      if (associatedAppPort) {
        const expectedOrigins = [
          `http://localhost:${associatedAppPort}`,
          `http://127.0.0.1:${associatedAppPort}`,
        ];
        if (!expectedOrigins.some(expected => origin.startsWith(expected))) {
          console.log(`[Sweetlink] Accepting connection from ${origin} (configured port: ${associatedAppPort})`);
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
          ws.send(JSON.stringify({
            type: 'server-info',
            appPort: associatedAppPort,
            wsPort: activePort,
            projectDir: process.cwd(),
            timestamp: Date.now()
          }));
          return;
        }

        // Handle API key check request from browser
        if (command.type === 'check-api-key') {
          const apiKey = process.env.ANTHROPIC_API_KEY;
          const hasKey = Boolean(apiKey && apiKey.length > 0);

          // Mask the key for display (show first 8 chars + last 4)
          let maskedKey: string | undefined;
          if (hasKey && apiKey) {
            if (apiKey.length > 12) {
              maskedKey = `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
            } else {
              maskedKey = '***';
            }
          }

          ws.send(JSON.stringify({
            type: 'api-key-status',
            configured: hasKey,
            maskedKey,
            model: CLAUDE_MODEL,
            pricing: CLAUDE_PRICING,
            timestamp: Date.now()
          }));
          return;
        }

        // Handle screenshot save request from browser
        if (command.type === 'save-screenshot') {
          console.log('[Sweetlink] Received save-screenshot command, hasData:', !!command.data);
          const clientInfo = clients.get(ws);
          console.log('[Sweetlink] Client info:', clientInfo);

          if (command.data && clientInfo?.type === 'browser') {
            const savedPath = await handleSaveScreenshot(command.data as Parameters<typeof handleSaveScreenshot>[0]);
            console.log(`[Sweetlink] Screenshot saved to ${savedPath}`);

            // Send confirmation back to browser
            ws.send(JSON.stringify({
              success: true,
              type: 'screenshot-saved',
              path: savedPath,
              timestamp: Date.now()
            }));
            return;
          }
        }

        // Handle design review screenshot request from browser
        if (command.type === 'design-review-screenshot') {
          console.log('[Sweetlink] Received design-review-screenshot command');
          const clientInfo = clients.get(ws);

          if (command.data && clientInfo?.type === 'browser') {
            try {
              const result = await handleDesignReviewScreenshot(command.data as Parameters<typeof handleDesignReviewScreenshot>[0]);
              console.log(`[Sweetlink] Design review saved to ${result.reviewPath}`);

              // Send confirmation back to browser
              ws.send(JSON.stringify({
                success: true,
                type: 'design-review-saved',
                screenshotPath: result.screenshotPath,
                reviewPath: result.reviewPath,
                timestamp: Date.now()
              }));
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              console.error('[Sweetlink] Design review failed:', errorMessage);

              ws.send(JSON.stringify({
                success: false,
                type: 'design-review-error',
                error: errorMessage,
                timestamp: Date.now()
              }));
            }
            return;
          }
        }

        // Handle save-outline request from browser
        if (command.type === 'save-outline') {
          console.log('[Sweetlink] Received save-outline command');
          const clientInfo = clients.get(ws);

          if (command.data && clientInfo?.type === 'browser') {
            try {
              const result = await handleSaveOutline(command.data as Parameters<typeof handleSaveOutline>[0]);
              console.log(`[Sweetlink] Outline saved to ${result.outlinePath}`);

              // Send confirmation back to browser
              ws.send(JSON.stringify({
                success: true,
                type: 'outline-saved',
                outlinePath: result.outlinePath,
                timestamp: Date.now()
              }));
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              console.error('[Sweetlink] Outline save failed:', errorMessage);

              ws.send(JSON.stringify({
                success: false,
                type: 'outline-error',
                error: errorMessage,
                timestamp: Date.now()
              }));
            }
            return;
          }
        }

        // Handle save-schema request from browser
        if (command.type === 'save-schema') {
          console.log('[Sweetlink] Received save-schema command');
          const clientInfo = clients.get(ws);

          if (command.data && clientInfo?.type === 'browser') {
            try {
              const result = await handleSaveSchema(command.data as Parameters<typeof handleSaveSchema>[0]);
              console.log(`[Sweetlink] Schema saved to ${result.schemaPath}`);

              // Send confirmation back to browser
              ws.send(JSON.stringify({
                success: true,
                type: 'schema-saved',
                schemaPath: result.schemaPath,
                timestamp: Date.now()
              }));
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              console.error('[Sweetlink] Schema save failed:', errorMessage);

              ws.send(JSON.stringify({
                success: false,
                type: 'schema-error',
                error: errorMessage,
                timestamp: Date.now()
              }));
            }
            return;
          }
        }

        // ============================================================================
        // v1.4.0: New message handlers
        // ============================================================================

        // Handle request-screenshot from CLI/Agent
        if (command.type === 'request-screenshot') {
          const clientInfo = clients.get(ws);
          if (clientInfo?.type === 'cli') {
            const requestId = command.requestId || `req-${Date.now()}`;
            console.log(`[Sweetlink] Screenshot request ${requestId} from CLI`);

            // Find browser client
            const browserClients = Array.from(clients.entries())
              .filter(([_, info]) => info.type === 'browser')
              .map(([client, _]) => client);

            if (browserClients.length === 0) {
              ws.send(JSON.stringify({
                type: 'screenshot-response',
                requestId,
                success: false,
                error: 'No browser client connected',
                timestamp: Date.now()
              }));
              return;
            }

            // Set up timeout
            const timeout = setTimeout(() => {
              const pending = pendingScreenshotRequests.get(requestId);
              if (pending) {
                pendingScreenshotRequests.delete(requestId);
                pending.clientWs.send(JSON.stringify({
                  type: 'screenshot-response',
                  requestId,
                  success: false,
                  error: 'Screenshot request timed out',
                  timestamp: Date.now()
                }));
              }
            }, SCREENSHOT_REQUEST_TIMEOUT_MS);

            // Store pending request
            pendingScreenshotRequests.set(requestId, {
              requestId,
              clientWs: ws,
              timeout
            });

            // Forward to browser with requestId
            const browserWs = browserClients[0];
            browserWs.send(JSON.stringify({
              type: 'request-screenshot',
              requestId,
              selector: command.selector,
              format: command.format || 'jpeg',
              quality: command.quality || 0.7,
              scale: command.scale || 0.25,
              includeMetadata: command.includeMetadata !== false
            }));
            return;
          }
        }

        // Handle screenshot-response from browser
        if (command.type === 'screenshot-response') {
          const clientInfo = clients.get(ws);
          if (clientInfo?.type === 'browser' && command.requestId) {
            const pending = pendingScreenshotRequests.get(command.requestId);
            if (pending) {
              clearTimeout(pending.timeout);
              pendingScreenshotRequests.delete(command.requestId);
              // Forward response to CLI client
              if (pending.clientWs.readyState === WebSocket.OPEN) {
                pending.clientWs.send(message.toString());
              }
            }
            return;
          }
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
            ws.send(JSON.stringify({
              type: 'subscribed',
              channel,
              timestamp: Date.now()
            }));
            return;
          }
        }

        // Handle channel unsubscription
        if (command.type === 'unsubscribe') {
          const channel = command.channel;
          if (channel && channelSubscriptions.has(channel)) {
            const subs = channelSubscriptions.get(channel)!;
            const idx = subs.findIndex(s => s.clientWs === ws);
            if (idx !== -1) {
              subs.splice(idx, 1);
              console.log(`[Sweetlink] Client unsubscribed from channel: ${channel}`);
            }
            ws.send(JSON.stringify({
              type: 'unsubscribed',
              channel,
              timestamp: Date.now()
            }));
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
            filters: command.filters
          });
          ws.send(JSON.stringify({
            type: 'log-subscribed',
            subscriptionId,
            timestamp: Date.now()
          }));
          return;
        }

        // Handle log unsubscription
        if (command.type === 'log-unsubscribe') {
          if (command.subscriptionId && logSubscriptions.has(command.subscriptionId)) {
            logSubscriptions.delete(command.subscriptionId);
            console.log(`[Sweetlink] Log subscription removed: ${command.subscriptionId}`);
            ws.send(JSON.stringify({
              type: 'log-unsubscribed',
              subscriptionId: command.subscriptionId,
              timestamp: Date.now()
            }));
          }
          return;
        }

        // Handle HMR screenshot from browser
        if (command.type === 'hmr-screenshot') {
          const clientInfo = clients.get(ws);
          if (clientInfo?.type === 'browser' && command.data) {
            const hmrData = command.data as HmrScreenshotData;
            hmrSequenceNumber++;

            console.log(`[Sweetlink] HMR screenshot received (${hmrData.trigger})`);
            if (hmrData.changedFile) {
              console.log(`[Sweetlink] Changed file: ${hmrData.changedFile}`);
            }

            // Save screenshot and logs
            const result = await handleHmrScreenshot(hmrData);

            // Notify all subscribers on 'hmr-screenshots' channel
            const subscribers = channelSubscriptions.get('hmr-screenshots') || [];
            const notification = {
              type: 'hmr-screenshot-saved',
              screenshotPath: result.screenshotPath,
              logsPath: result.logsPath,
              trigger: hmrData.trigger,
              changedFile: hmrData.changedFile,
              timestamp: hmrData.timestamp,
              sequenceNumber: hmrSequenceNumber,
              logSummary: result.logSummary
            };

            for (const sub of subscribers) {
              if (sub.clientWs.readyState === WebSocket.OPEN) {
                sub.clientWs.send(JSON.stringify(notification));
              }
            }

            // Send confirmation back to browser
            ws.send(JSON.stringify({
              success: true,
              type: 'hmr-screenshot-saved',
              screenshotPath: result.screenshotPath,
              logsPath: result.logsPath,
              sequenceNumber: hmrSequenceNumber,
              timestamp: Date.now()
            }));
            return;
          }
        }

        // Handle log-event from browser (for streaming to subscribers)
        if (command.type === 'log-event') {
          const clientInfo = clients.get(ws);
          if (clientInfo?.type === 'browser' && command.data) {
            const log = command.data as ConsoleLog;
            // Forward to matching subscriptions
            for (const [_, sub] of logSubscriptions) {
              if (sub.clientWs.readyState !== WebSocket.OPEN) continue;

              // Apply filters
              if (sub.filters) {
                if (sub.filters.levels && !sub.filters.levels.includes(log.level)) continue;
                if (sub.filters.pattern) {
                  const regex = new RegExp(sub.filters.pattern, 'i');
                  if (!regex.test(log.message)) continue;
                }
                if (sub.filters.source && log.source !== sub.filters.source) continue;
              }

              sub.clientWs.send(JSON.stringify({
                type: 'log-event',
                subscriptionId: sub.subscriptionId,
                log,
                timestamp: Date.now()
              }));
            }
            return;
          }
        }

        // ============================================================================
        // End v1.4.0 handlers
        // ============================================================================

        const clientInfo = clients.get(ws);

        // If this is a CLI client sending a command, forward to browser
        if (clientInfo?.type === 'cli') {
          console.log(`[Sweetlink] Received command from CLI: ${command.type}`);

          // Find browser clients
          const browserClients = Array.from(clients.entries())
            .filter(([_, info]) => info.type === 'browser')
            .map(([client, _]) => client);

          if (browserClients.length === 0) {
            ws.send(JSON.stringify({
              success: false,
              error: 'No browser client connected. Is the dev server running with the page open?',
              timestamp: Date.now()
            } as SweetlinkResponse));
            return;
          }

          // Forward command to first browser client
          // Store reference to CLI client for response
          const browserWs = browserClients[0];
          (browserWs as unknown as { __cliClient: WebSocket }).__cliClient = ws;
          browserWs.send(message.toString());
        }
        // If this is a browser client sending a response, forward to CLI
        else if (clientInfo?.type === 'browser') {
          const cliWs = (ws as unknown as { __cliClient?: WebSocket }).__cliClient;
          if (cliWs && cliWs.readyState === WebSocket.OPEN) {
            cliWs.send(message.toString());
            // Clear the reference
            delete (ws as unknown as { __cliClient?: WebSocket }).__cliClient;
          }
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Sweetlink] Error processing message:', errorMessage);

        ws.send(JSON.stringify({
          success: false,
          error: errorMessage,
          timestamp: Date.now()
        } as SweetlinkResponse));
      }
    });

    ws.on('close', () => {
      const clientInfo = clients.get(ws);
      console.log(`[Sweetlink] Client disconnected: ${clientInfo?.id} (${clientInfo?.type})`);
      cleanupClientSubscriptions(ws);
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error(`[Sweetlink] WebSocket error:`, error);
      cleanupClientSubscriptions(ws);
      clients.delete(ws);
    });
  });
}

export function closeSweetlink() {
  if (wss) {
    console.log('[Sweetlink] Closing WebSocket server on port', activePort);
    clients.forEach((_, client) => client.close());
    clients.clear();
    wss.close();
    wss = null;
    activePort = null;
  }
}
