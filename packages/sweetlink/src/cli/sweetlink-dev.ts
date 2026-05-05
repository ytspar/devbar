#!/usr/bin/env node

/**
 * Sweetlink Development Server
 *
 * Starts the WebSocket server for Sweetlink in development mode.
 * Run alongside the Remix dev server.
 *
 * Environment variables:
 * - SWEETLINK_WS_PORT: WebSocket server port (default: appPort + 6223, or 9223)
 * - SWEETLINK_APP_PORT: Associated app port for origin validation (optional)
 * - SWEETLINK_APP_URL: Associated local app URL for origin validation (optional)
 * - PORTLESS_URL: Associated Portless app URL for origin validation (optional)
 * - PORT: Associated app port fallback for origin validation (optional)
 * - ANTHROPIC_API_KEY: Required for AI design review feature
 */

import { config } from 'dotenv';
import { join } from 'path';

// Load .env from the project directory (cwd)
config({ path: join(process.cwd(), '.env') });

import { registerGracefulShutdown } from '../daemon/utils.js';
import { closeSweetlink, initSweetlink } from '../server.js';
import {
  parsePortNumber,
  resolveAppPortFromLocalUrl,
  resolveSweetlinkWsPortForAppPort,
} from '../types.js';

const appPort =
  parsePortNumber(process.env.SWEETLINK_APP_PORT) ??
  resolveAppPortFromLocalUrl(process.env.SWEETLINK_APP_URL) ??
  resolveAppPortFromLocalUrl(process.env.PORTLESS_URL) ??
  parsePortNumber(process.env.PORT) ??
  undefined;
const port =
  parsePortNumber(process.env.SWEETLINK_WS_PORT) ?? resolveSweetlinkWsPortForAppPort(appPort);

console.log('[Sweetlink] Starting development server...');
console.log(`[Sweetlink] Project directory: ${process.cwd()}`);

initSweetlink({ port, appPort });

// Graceful shutdown — same handler for SIGTERM and SIGINT.
registerGracefulShutdown(() => {
  console.log('[Sweetlink] Shutdown signal received: closing WebSocket server');
  closeSweetlink();
  process.exit(0);
});

// Keep the process running
console.log('[Sweetlink] Server running. Press Ctrl+C to stop.');
