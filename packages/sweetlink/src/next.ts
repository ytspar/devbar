/**
 * Sweetlink Next.js Plugin
 *
 * Zero-config integration for Next.js projects.
 * Wraps your Next.js config to automatically start the Sweetlink WebSocket server in dev mode.
 *
 * Usage:
 * ```javascript
 * // next.config.mjs
 * import { withSweetlink } from '@ytspar/sweetlink/next';
 *
 * const nextConfig = { ... };
 * export default withSweetlink(nextConfig);
 * ```
 *
 * Port detection (in order of precedence):
 * 1. process.argv: `--port 3002` or `-p 3002`
 * 2. process.env.PORT
 * 3. Default: 3000
 */

import { closeSweetlink, initSweetlink } from './server/index.js';
import { WS_PORT_OFFSET } from './types.js';

export interface WithSweetlinkOptions {
  /**
   * Override the app port detection. If not specified, auto-detected from
   * process.argv (--port / -p) or process.env.PORT, defaulting to 3000.
   */
  port?: number;
}

/**
 * Detect the Next.js dev server port from CLI args or environment.
 *
 * Next.js `--port` flag does NOT set process.env.PORT, so we parse argv directly.
 */
function detectNextPort(): number {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // --port 3002 or -p 3002
    if ((arg === '--port' || arg === '-p') && args[i + 1]) {
      const port = parseInt(args[i + 1]!, 10);
      if (!Number.isNaN(port)) return port;
    }
    // --port=3002
    if (arg?.startsWith('--port=')) {
      const port = parseInt(arg.split('=')[1]!, 10);
      if (!Number.isNaN(port)) return port;
    }
  }

  if (process.env.PORT) {
    const port = parseInt(process.env.PORT, 10);
    if (!Number.isNaN(port)) return port;
  }

  return 3000;
}

/**
 * Wrap a Next.js config to auto-start Sweetlink in development.
 *
 * Mirrors the Vite plugin (`@ytspar/sweetlink/vite`) pattern:
 * - Detects the app port from CLI args
 * - Starts the WebSocket server on `appPort + 6223`
 * - Registers graceful shutdown handlers
 * - No-ops in production
 */
export function withSweetlink<T>(nextConfig: T, options?: WithSweetlinkOptions): T {
  if (process.env.NODE_ENV !== 'development') return nextConfig;

  const appPort = options?.port ?? detectNextPort();
  const wsPort = appPort + WS_PORT_OFFSET;

  initSweetlink({
    port: wsPort,
    appPort,
    onReady: (actualPort) => {
      if (actualPort !== wsPort) {
        console.log(`[Sweetlink] Using port ${actualPort} (${wsPort} was in use)`);
      }
      console.log(`[Sweetlink] Ready for devbar connections (app port: ${appPort})`);
    },
  });

  const handleShutdown = (): void => {
    closeSweetlink();
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);

  return nextConfig;
}

export default withSweetlink;
