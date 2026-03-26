/**
 * Sweetlink Vite Plugin
 *
 * Zero-config integration for Vite projects.
 * Automatically starts the Sweetlink WebSocket server when Vite's dev server starts.
 *
 * Usage:
 * ```typescript
 * // vite.config.ts
 * import { sweetlink } from '@ytspar/sweetlink/vite';
 *
 * export default defineConfig({
 *   plugins: [sweetlink()]
 * });
 * ```
 */

import type { Plugin } from 'vite';
import { closeSweetlink, initSweetlink } from './server/index.js';
import { WS_PORT_OFFSET } from './types.js';

export interface SweetlinkPluginOptions {
  /**
   * WebSocket server port. If not specified, calculated as Vite port + 6223.
   * For example, if Vite runs on 5173, Sweetlink uses 11396.
   */
  port?: number;

  /**
   * Auto-start the Playwright daemon alongside the dev server.
   * Enables `--hifi` screenshots, `snapshot`, `console`, recording, etc.
   * Default: false
   */
  daemon?: boolean;

  /**
   * Start the daemon in headed mode (visible browser window).
   * Only applies when `daemon: true`.
   * Default: false
   */
  headed?: boolean;
}

/**
 * Vite plugin for automatic Sweetlink integration
 */
export function sweetlink(options: SweetlinkPluginOptions = {}): Plugin {
  return {
    name: 'sweetlink',
    apply: 'serve', // Only run in dev mode

    configureServer(viteServer) {
      // Start Sweetlink when Vite server is ready
      viteServer.httpServer?.once('listening', async () => {
        // Close any existing server first (handles Vite restarts)
        await closeSweetlink();

        const address = viteServer.httpServer?.address();
        const vitePort = typeof address === 'object' && address ? address.port : 5173;

        // Calculate WebSocket port (matches GlobalDevBar's calculation)
        const wsPort = options.port ?? vitePort + WS_PORT_OFFSET;

        initSweetlink({
          port: wsPort,
          appPort: vitePort,
          onReady: (actualPort) => {
            if (actualPort !== wsPort) {
              console.log(`[Sweetlink] Using port ${actualPort} (${wsPort} was in use)`);
            }
          },
        });

        console.log(`[Sweetlink] Ready for devbar connections (app port: ${vitePort})`);

        // Auto-start daemon if configured
        if (options.daemon) {
          const url = `http://localhost:${vitePort}`;
          import('./daemon/client.js').then(({ ensureDaemon }) => {
            ensureDaemon(process.cwd(), url, { headed: options.headed }).then((state) => {
              console.log(`[Sweetlink] Daemon ready on port ${state.port} (target: ${url})`);
            }).catch((err) => {
              console.warn('[Sweetlink] Daemon auto-start failed:', err instanceof Error ? err.message : err);
            });
          }).catch(() => {
            console.warn('[Sweetlink] Daemon module not available');
          });
        }
      });
    },

    buildEnd() {
      // Clean up on build end (though this mainly matters for serve mode)
      closeSweetlink();
    },
  };
}

// Default export for convenience
export default sweetlink;
