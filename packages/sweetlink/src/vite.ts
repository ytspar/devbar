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

/** Port offset from Vite port to calculate WebSocket port */
const WS_PORT_OFFSET = 6223;

export interface SweetlinkPluginOptions {
  /**
   * WebSocket server port. If not specified, calculated as Vite port + 6223.
   * For example, if Vite runs on 5173, Sweetlink uses 11396.
   */
  port?: number;
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
