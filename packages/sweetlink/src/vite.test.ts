// @vitest-environment node

/**
 * Vite Plugin Tests
 *
 * Tests the sweetlink() Vite plugin factory: plugin metadata, configureServer
 * hook wiring, port calculation, buildEnd cleanup, and default export.
 * All server I/O is mocked.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { Plugin, ViteDevServer } from 'vite';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInitSweetlink = vi.fn().mockResolvedValue(undefined);
const mockCloseSweetlink = vi.fn().mockResolvedValue(undefined);

vi.mock('./server/index.js', () => ({
  initSweetlink: (...args: unknown[]) => mockInitSweetlink(...args),
  closeSweetlink: (...args: unknown[]) => mockCloseSweetlink(...args),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { sweetlink, type SweetlinkPluginOptions } from './vite.js';
import defaultExport from './vite.js';
import { WS_PORT_OFFSET } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock ViteDevServer with a controllable httpServer */
function makeMockViteServer(port = 5173): {
  viteServer: ViteDevServer;
  httpServer: EventEmitter & { address: () => { port: number } };
} {
  const httpServer = Object.assign(new EventEmitter(), {
    address: () => ({ port }),
  });
  const viteServer = { httpServer } as unknown as ViteDevServer;
  return { viteServer, httpServer };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sweetlink vite plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========================================================================
  // Plugin shape
  // ========================================================================

  describe('plugin metadata', () => {
    it('returns an object with name "sweetlink"', () => {
      const plugin = sweetlink();
      expect(plugin.name).toBe('sweetlink');
    });

    it('sets apply to "serve" (dev mode only)', () => {
      const plugin = sweetlink();
      expect(plugin.apply).toBe('serve');
    });

    it('has a configureServer hook', () => {
      const plugin = sweetlink();
      expect(typeof plugin.configureServer).toBe('function');
    });

    it('has a buildEnd hook', () => {
      const plugin = sweetlink();
      expect(typeof plugin.buildEnd).toBe('function');
    });
  });

  // ========================================================================
  // Default export
  // ========================================================================

  describe('default export', () => {
    it('is the same function as the named export', () => {
      expect(defaultExport).toBe(sweetlink);
    });
  });

  // ========================================================================
  // configureServer
  // ========================================================================

  describe('configureServer', () => {
    it('calls closeSweetlink then initSweetlink when httpServer emits listening', async () => {
      const plugin = sweetlink();
      const { viteServer, httpServer } = makeMockViteServer(5173);

      // Invoke the configureServer hook
      (plugin.configureServer as (server: ViteDevServer) => void)(viteServer);

      // Simulate Vite server becoming ready
      httpServer.emit('listening');

      // Allow microtask queue to flush (async handler inside the listener)
      await vi.waitFor(() => {
        expect(mockCloseSweetlink).toHaveBeenCalledTimes(1);
        expect(mockInitSweetlink).toHaveBeenCalledTimes(1);
      });
    });

    it('calculates wsPort as vitePort + WS_PORT_OFFSET by default', async () => {
      const plugin = sweetlink();
      const vitePort = 5173;
      const { viteServer, httpServer } = makeMockViteServer(vitePort);

      (plugin.configureServer as (server: ViteDevServer) => void)(viteServer);
      httpServer.emit('listening');

      await vi.waitFor(() => {
        expect(mockInitSweetlink).toHaveBeenCalledWith(
          expect.objectContaining({
            port: vitePort + WS_PORT_OFFSET,
            appPort: vitePort,
          }),
        );
      });
    });

    it('uses options.port when explicitly provided', async () => {
      const customPort = 12345;
      const plugin = sweetlink({ port: customPort });
      const { viteServer, httpServer } = makeMockViteServer(5173);

      (plugin.configureServer as (server: ViteDevServer) => void)(viteServer);
      httpServer.emit('listening');

      await vi.waitFor(() => {
        expect(mockInitSweetlink).toHaveBeenCalledWith(
          expect.objectContaining({
            port: customPort,
          }),
        );
      });
    });

    it('defaults vitePort to 5173 when httpServer.address() returns a string', async () => {
      const httpServer = Object.assign(new EventEmitter(), {
        address: () => '/tmp/some-socket' as unknown,
      });
      const viteServer = { httpServer } as unknown as ViteDevServer;

      const plugin = sweetlink();
      (plugin.configureServer as (server: ViteDevServer) => void)(viteServer);
      httpServer.emit('listening');

      await vi.waitFor(() => {
        expect(mockInitSweetlink).toHaveBeenCalledWith(
          expect.objectContaining({
            port: 5173 + WS_PORT_OFFSET,
            appPort: 5173,
          }),
        );
      });
    });

    it('defaults vitePort to 5173 when httpServer.address() returns null', async () => {
      const httpServer = Object.assign(new EventEmitter(), {
        address: () => null,
      });
      const viteServer = { httpServer } as unknown as ViteDevServer;

      const plugin = sweetlink();
      (plugin.configureServer as (server: ViteDevServer) => void)(viteServer);
      httpServer.emit('listening');

      await vi.waitFor(() => {
        expect(mockInitSweetlink).toHaveBeenCalledWith(
          expect.objectContaining({
            appPort: 5173,
          }),
        );
      });
    });

    it('passes an onReady callback to initSweetlink', async () => {
      const plugin = sweetlink();
      const { viteServer, httpServer } = makeMockViteServer(5173);

      (plugin.configureServer as (server: ViteDevServer) => void)(viteServer);
      httpServer.emit('listening');

      await vi.waitFor(() => {
        const call = mockInitSweetlink.mock.calls[0][0];
        expect(typeof call.onReady).toBe('function');
      });
    });

    it('onReady logs when actual port differs from requested port', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const plugin = sweetlink();
      const { viteServer, httpServer } = makeMockViteServer(5173);

      (plugin.configureServer as (server: ViteDevServer) => void)(viteServer);
      httpServer.emit('listening');

      await vi.waitFor(() => {
        expect(mockInitSweetlink).toHaveBeenCalled();
      });

      // Extract and call the onReady callback with a different port
      const call = mockInitSweetlink.mock.calls[0][0];
      const expectedPort = 5173 + WS_PORT_OFFSET;
      call.onReady(expectedPort + 1);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using port'),
      );
      consoleSpy.mockRestore();
    });

    it('onReady does not log when actual port matches requested port', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const plugin = sweetlink();
      const { viteServer, httpServer } = makeMockViteServer(5173);

      (plugin.configureServer as (server: ViteDevServer) => void)(viteServer);
      httpServer.emit('listening');

      await vi.waitFor(() => {
        expect(mockInitSweetlink).toHaveBeenCalled();
      });

      // Reset spy to only capture onReady output
      consoleSpy.mockClear();

      const call = mockInitSweetlink.mock.calls[0][0];
      const expectedPort = 5173 + WS_PORT_OFFSET;
      call.onReady(expectedPort);

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Using port'),
      );
      consoleSpy.mockRestore();
    });

    it('does nothing when httpServer is null', () => {
      const plugin = sweetlink();
      const viteServer = { httpServer: null } as unknown as ViteDevServer;

      // Should not throw
      (plugin.configureServer as (server: ViteDevServer) => void)(viteServer);

      expect(mockInitSweetlink).not.toHaveBeenCalled();
      expect(mockCloseSweetlink).not.toHaveBeenCalled();
    });

    it('uses the "once" listener so it only fires once', async () => {
      const plugin = sweetlink();
      const { viteServer, httpServer } = makeMockViteServer(5173);

      (plugin.configureServer as (server: ViteDevServer) => void)(viteServer);

      // Emit listening twice
      httpServer.emit('listening');
      httpServer.emit('listening');

      await vi.waitFor(() => {
        expect(mockInitSweetlink).toHaveBeenCalledTimes(1);
      });
    });

    it('works with different port values', async () => {
      const plugin = sweetlink();
      const { viteServer, httpServer } = makeMockViteServer(3000);

      (plugin.configureServer as (server: ViteDevServer) => void)(viteServer);
      httpServer.emit('listening');

      await vi.waitFor(() => {
        expect(mockInitSweetlink).toHaveBeenCalledWith(
          expect.objectContaining({
            port: 3000 + WS_PORT_OFFSET,
            appPort: 3000,
          }),
        );
      });
    });
  });

  // ========================================================================
  // buildEnd
  // ========================================================================

  describe('buildEnd', () => {
    it('calls closeSweetlink', () => {
      const plugin = sweetlink();
      (plugin.buildEnd as () => void)();
      expect(mockCloseSweetlink).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================================================
  // Port calculation edge cases
  // ========================================================================

  describe('port calculation', () => {
    it('WS_PORT_OFFSET is 6223', () => {
      expect(WS_PORT_OFFSET).toBe(6223);
    });

    it('common dev ports produce expected ws ports', () => {
      expect(3000 + WS_PORT_OFFSET).toBe(9223);
      expect(5173 + WS_PORT_OFFSET).toBe(11396);
      expect(8080 + WS_PORT_OFFSET).toBe(14303);
      expect(4200 + WS_PORT_OFFSET).toBe(10423);
    });
  });

  // ========================================================================
  // Options interface
  // ========================================================================

  describe('SweetlinkPluginOptions', () => {
    it('accepts no options', () => {
      const plugin = sweetlink();
      expect(plugin).toBeDefined();
    });

    it('accepts empty options object', () => {
      const plugin = sweetlink({});
      expect(plugin).toBeDefined();
    });

    it('accepts port option', () => {
      const plugin = sweetlink({ port: 9999 });
      expect(plugin).toBeDefined();
    });
  });
});
