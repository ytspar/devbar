/**
 * Sweetlink Auto-Start
 *
 * Zero-config Sweetlink server that works with any Node.js app.
 * Just import this module in development to start the server automatically.
 *
 * Usage:
 * ```typescript
 * // At the top of your server entry file
 * import '@ytspar/sweetlink/auto';
 * ```
 *
 * Or with explicit configuration:
 * ```typescript
 * import { startSweetlink } from '@ytspar/sweetlink/auto';
 * startSweetlink({ appPort: 3000 });
 * ```
 *
 * Port Calculation:
 * - Reads app port from process.env.PORT (default: 3000)
 * - WebSocket port = app port + 6223 (matches DevBar's calculation)
 * - Example: app on 3000 → Sweetlink on 9223
 */

import { closeSweetlink, initSweetlink } from './server/index.js';

/** Port offset from app port to calculate WebSocket port */
const WS_PORT_OFFSET = 6223;

/** Default app port if not specified */
const DEFAULT_APP_PORT = 3000;

export interface AutoStartOptions {
  /**
   * Your app's HTTP port. If not specified, reads from process.env.PORT
   * or defaults to 3000.
   */
  appPort?: number;

  /**
   * WebSocket server port. If not specified, calculated as appPort + 6223.
   */
  wsPort?: number;

  /**
   * Only start in development mode. Default: true
   */
  devOnly?: boolean;
}

let started = false;

/**
 * Start Sweetlink server with automatic port configuration.
 *
 * @example
 * // Auto-detect port from process.env.PORT
 * startSweetlink();
 *
 * @example
 * // Explicit app port
 * startSweetlink({ appPort: 3000 });
 */
export function startSweetlink(options: AutoStartOptions = {}): void {
  if (started) {
    console.log('[Sweetlink] Already started');
    return;
  }

  const { devOnly = true } = options;

  // Skip in production unless explicitly enabled
  if (devOnly && process.env.NODE_ENV === 'production') {
    return;
  }

  // Determine app port
  const appPort =
    options.appPort ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_APP_PORT);

  // Calculate WebSocket port (matches DevBar's calculation)
  const wsPort = options.wsPort ?? appPort + WS_PORT_OFFSET;

  initSweetlink({
    port: wsPort,
    appPort,
    onReady: (actualPort) => {
      started = true;
      if (actualPort !== wsPort) {
        console.log(`[Sweetlink] Started on port ${actualPort} (${wsPort} was in use)`);
      } else {
        console.log(`[Sweetlink] Started on port ${actualPort}`);
      }
      console.log(`[Sweetlink] DevBar will auto-connect from app port ${appPort}`);
    },
  });

  // Graceful shutdown on SIGTERM and SIGINT
  const handleShutdown = (): void => {
    closeSweetlink();
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}

/**
 * Stop the Sweetlink server
 */
export function stopSweetlink(): void {
  if (started) {
    closeSweetlink();
    started = false;
  }
}

// Auto-start when this module is imported (unless NODE_ENV=production)
if (process.env.NODE_ENV !== 'production') {
  startSweetlink();
}
