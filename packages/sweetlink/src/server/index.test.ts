// @vitest-environment node

/**
 * Sweetlink WebSocket Server Tests
 *
 * Tests the core server module: lifecycle management, port calculation,
 * origin validation, and message routing. All network I/O is mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage } from 'http';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Mocks — hoisted so vi.mock factories can reference them
// ---------------------------------------------------------------------------

const { mockHttpServer, mockWssInstance, mockNetServer } = vi.hoisted(() => {
  // Import EventEmitter inside vi.hoisted since imports haven't resolved yet
  const { EventEmitter: EE } = require('events');

  // Minimal mock HTTP server (EventEmitter + listen/close)
  class MockHttpServer extends EE {
    listen = vi.fn((_port: number, cb: () => void) => cb());
    close = vi.fn((cb?: () => void) => cb?.());
    address = vi.fn(() => ({ port: 9223 }));
  }

  // Minimal mock WebSocketServer (EventEmitter)
  class MockWss extends EE {
    close = vi.fn();
    clients = new Set();
  }

  // Minimal mock net server for port probing
  class MockNetServer extends EE {
    listen = vi.fn();
    close = vi.fn((cb?: () => void) => cb?.());
  }

  return {
    mockHttpServer: new MockHttpServer(),
    mockWssInstance: new MockWss(),
    mockNetServer: new MockNetServer(),
  };
});

vi.mock('http', () => ({
  createServer: vi.fn(() => {
    // Remove stale listeners so each tryPort() call starts fresh
    mockHttpServer.removeAllListeners();
    return mockHttpServer;
  }),
}));

vi.mock('ws', () => ({
  WebSocketServer: vi.fn(function () { return mockWssInstance; }),
  WebSocket: { OPEN: 1, CLOSED: 3 },
}));

vi.mock('net', () => ({
  createServer: vi.fn(() => mockNetServer),
}));

// Mock handlers so no real filesystem I/O occurs
vi.mock('./handlers/index.js', () => ({
  handleDesignReviewScreenshot: vi.fn(),
  handleHmrScreenshot: vi.fn(),
  handleLoadSettings: vi.fn(),
  handleSaveA11y: vi.fn(),
  handleSaveConsoleLogs: vi.fn(),
  handleSaveOutline: vi.fn(),
  handleSaveSchema: vi.fn(),
  handleSaveScreenshot: vi.fn(),
  handleSaveSettings: vi.fn(),
}));

vi.mock('./anthropic.js', () => ({
  CLAUDE_MODEL: 'claude-sonnet-4-5-latest',
  CLAUDE_PRICING: { input: 3, output: 15 },
}));

vi.mock('./subscriptions.js', () => ({
  channelSubscriptions: new Map(),
  cleanupClientSubscriptions: vi.fn(),
  logSubscriptions: new Map(),
  pendingScreenshotRequests: new Map(),
}));

// ---------------------------------------------------------------------------
// Import after mocks are in place
// ---------------------------------------------------------------------------

import {
  closeSweetlink,
  getAssociatedAppPort,
  getProjectRoot,
  getSweetlinkPort,
  initSweetlink,
} from './index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset module-level state between tests by closing any active server */
async function resetServerState() {
  // closeSweetlink resets module-level wss/httpServer/activePort
  await closeSweetlink();
  vi.clearAllMocks();

  // Remove all event listeners accumulated across tests
  mockHttpServer.removeAllListeners();
  mockWssInstance.removeAllListeners();
  mockNetServer.removeAllListeners();

  // Re-wire the default mock behaviour after clearAllMocks
  mockHttpServer.listen.mockImplementation((_port: number, cb: () => void) => cb());
  mockHttpServer.close.mockImplementation((cb?: () => void) => cb?.());
}

/** Convenience: init a server with sensible defaults */
function initDefault(overrides: Partial<Parameters<typeof initSweetlink>[0]> = {}) {
  return initSweetlink({ port: 9223, ...overrides });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sweetlink server module', () => {
  beforeEach(async () => {
    await resetServerState();
  });

  afterEach(async () => {
    await resetServerState();
  });

  // ========================================================================
  // getProjectRoot
  // ========================================================================

  describe('getProjectRoot', () => {
    it('returns process.cwd() before server is initialised', () => {
      // Module-level projectRoot is null when no server has been started
      const root = getProjectRoot();
      expect(root).toBe(process.cwd());
    });

    it('returns the captured project root after server initialisation', async () => {
      await initDefault();
      // After init, projectRoot is captured as process.cwd() at init time
      expect(getProjectRoot()).toBe(process.cwd());
    });

    it('returns a non-empty string', () => {
      const root = getProjectRoot();
      expect(typeof root).toBe('string');
      expect(root.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // getSweetlinkPort / getAssociatedAppPort
  // ========================================================================

  describe('getSweetlinkPort', () => {
    it('returns null before server is initialised', () => {
      expect(getSweetlinkPort()).toBeNull();
    });

    it('returns the active port after server is initialised', async () => {
      await initDefault({ port: 9500 });
      // The mock http server calls listen callback immediately, so activePort = 9500
      expect(getSweetlinkPort()).toBe(9500);
    });

    it('returns null after server is closed', async () => {
      await initDefault();
      await closeSweetlink();
      expect(getSweetlinkPort()).toBeNull();
    });
  });

  describe('getAssociatedAppPort', () => {
    it('returns null before server is initialised', () => {
      expect(getAssociatedAppPort()).toBeNull();
    });

    it('returns null when no appPort is provided', async () => {
      await initDefault();
      expect(getAssociatedAppPort()).toBeNull();
    });

    it('returns the associated app port when provided', async () => {
      await initDefault({ appPort: 3000 });
      expect(getAssociatedAppPort()).toBe(3000);
    });
  });

  // ========================================================================
  // Port offset math (WS_PORT_OFFSET = 6223)
  // ========================================================================

  describe('port calculation conventions', () => {
    it('WS_PORT_OFFSET yields correct port from common dev ports', async () => {
      // This tests the convention used by callers (vite plugin, auto.ts, CLI)
      // The server module itself does not do this math — callers pass the
      // computed port. But we verify the constant is importable and correct.
      const { WS_PORT_OFFSET, DEFAULT_WS_PORT } = await import('../types.js');

      expect(WS_PORT_OFFSET).toBe(6223);
      expect(DEFAULT_WS_PORT).toBe(9223);

      // Common dev ports
      expect(3000 + WS_PORT_OFFSET).toBe(9223);
      expect(5173 + WS_PORT_OFFSET).toBe(11396);
      expect(8080 + WS_PORT_OFFSET).toBe(14303);
    });
  });

  // ========================================================================
  // initSweetlink
  // ========================================================================

  describe('initSweetlink', () => {
    it('resolves with a WebSocketServer instance', async () => {
      const result = await initDefault();
      // Should be our mock WSS instance
      expect(result).toBe(mockWssInstance);
    });

    it('creates an HTTP server before the WebSocket server', async () => {
      const { createServer } = await import('http');
      await initDefault();
      expect(createServer).toHaveBeenCalledTimes(1);
    });

    it('listens on the specified port', async () => {
      await initDefault({ port: 9300 });
      expect(mockHttpServer.listen).toHaveBeenCalledWith(9300, expect.any(Function));
    });

    it('calls onReady callback with the bound port', async () => {
      const onReady = vi.fn();
      await initDefault({ port: 9300, onReady });
      expect(onReady).toHaveBeenCalledWith(9300);
    });

    it('returns immediately if server is already initialised', async () => {
      const first = await initDefault();
      const second = await initDefault();
      expect(first).toBe(second);
      // createServer should only have been called once
      const { createServer } = await import('http');
      expect(createServer).toHaveBeenCalledTimes(1);
    });

    it('retries on EADDRINUSE up to maxPortRetries', async () => {
      let callCount = 0;
      mockHttpServer.listen.mockImplementation((_port: number, cb: () => void) => {
        callCount++;
        if (callCount <= 2) {
          // Simulate EADDRINUSE for first 2 attempts
          const err = new Error('EADDRINUSE') as NodeJS.ErrnoException;
          err.code = 'EADDRINUSE';
          // Emit error asynchronously so the listen callback is not called
          setTimeout(() => mockHttpServer.emit('error', err), 0);
          return;
        }
        cb();
      });

      const result = await initDefault({ port: 9223, maxPortRetries: 5 });
      expect(result).toBe(mockWssInstance);
      // First two attempts fail, third succeeds — port should be 9225
      expect(getSweetlinkPort()).toBe(9225);
    });

    it('rejects when all port retries are exhausted', async () => {
      mockHttpServer.listen.mockImplementation(() => {
        const err = new Error('EADDRINUSE') as NodeJS.ErrnoException;
        err.code = 'EADDRINUSE';
        setTimeout(() => mockHttpServer.emit('error', err), 0);
      });
      mockHttpServer.close.mockImplementation((cb?: () => void) => cb?.());

      await expect(
        initSweetlink({ port: 9223, maxPortRetries: 2 }),
      ).rejects.toThrow(/Could not find available port after 2 attempts/);
    });

    it('rejects on non-EADDRINUSE server error', async () => {
      mockHttpServer.listen.mockImplementation(() => {
        const err = new Error('EACCES') as NodeJS.ErrnoException;
        err.code = 'EACCES';
        setTimeout(() => mockHttpServer.emit('error', err), 0);
      });

      await expect(initDefault()).rejects.toThrow('EACCES');
    });

    it('stores appPort in module state', async () => {
      await initDefault({ appPort: 5173 });
      expect(getAssociatedAppPort()).toBe(5173);
    });

    it('defaults maxPortRetries to 10 when not specified', async () => {
      let attempts = 0;
      mockHttpServer.listen.mockImplementation((_port: number, cb: () => void) => {
        attempts++;
        if (attempts <= 9) {
          const err = new Error('EADDRINUSE') as NodeJS.ErrnoException;
          err.code = 'EADDRINUSE';
          setTimeout(() => mockHttpServer.emit('error', err), 0);
          return;
        }
        cb();
      });
      mockHttpServer.close.mockImplementation((cb?: () => void) => cb?.());

      // Should succeed on attempt 10 (default maxPortRetries = 10)
      const result = await initDefault({ port: 9000 });
      expect(result).toBe(mockWssInstance);
      expect(getSweetlinkPort()).toBe(9009);
    });
  });

  // ========================================================================
  // closeSweetlink
  // ========================================================================

  describe('closeSweetlink', () => {
    it('resolves immediately when no server is running', async () => {
      // Should not throw or hang
      await closeSweetlink();
    });

    it('closes the WebSocket server', async () => {
      await initDefault();
      await closeSweetlink();
      expect(mockWssInstance.close).toHaveBeenCalled();
    });

    it('closes the HTTP server', async () => {
      await initDefault();
      await closeSweetlink();
      expect(mockHttpServer.close).toHaveBeenCalled();
    });

    it('resets activePort to null', async () => {
      await initDefault({ port: 9300 });
      expect(getSweetlinkPort()).toBe(9300);
      await closeSweetlink();
      expect(getSweetlinkPort()).toBeNull();
    });

    it('can reinitialise after close', async () => {
      await initDefault({ port: 9300 });
      await closeSweetlink();

      // Re-setup mock behaviour after close
      mockHttpServer.listen.mockImplementation((_port: number, cb: () => void) => cb());
      mockHttpServer.close.mockImplementation((cb?: () => void) => cb?.());

      await initDefault({ port: 9400 });
      expect(getSweetlinkPort()).toBe(9400);
    });
  });

  // ========================================================================
  // Origin Validation (tested via the connection handler on WSS)
  // ========================================================================

  describe('origin validation', () => {
    /**
     * The origin validation logic lives inside setupServerHandlers, which is
     * called during initSweetlink. We trigger it by simulating a 'connection'
     * event on the mock WebSocketServer after initialisation.
     */

    function makeClientSocket() {
      const ws = new EventEmitter() as EventEmitter & {
        send: ReturnType<typeof vi.fn>;
        close: ReturnType<typeof vi.fn>;
        readyState: number;
      };
      ws.send = vi.fn();
      ws.close = vi.fn();
      ws.readyState = 1; // WebSocket.OPEN
      return ws;
    }

    function makeRequest(origin?: string): IncomingMessage {
      return {
        headers: { origin },
        socket: { remoteAddress: '127.0.0.1', remotePort: 54321 },
      } as unknown as IncomingMessage;
    }

    it('allows connections from http://localhost:<port>', async () => {
      await initDefault({ appPort: 3000 });
      const ws = makeClientSocket();
      const req = makeRequest('http://localhost:3000');

      mockWssInstance.emit('connection', ws, req);

      // Connection was NOT rejected
      expect(ws.close).not.toHaveBeenCalled();
    });

    it('allows connections from http://127.0.0.1:<port>', async () => {
      await initDefault();
      const ws = makeClientSocket();
      const req = makeRequest('http://127.0.0.1:3000');

      mockWssInstance.emit('connection', ws, req);

      expect(ws.close).not.toHaveBeenCalled();
    });

    it('rejects connections from non-localhost origins', async () => {
      await initDefault();
      const ws = makeClientSocket();
      const req = makeRequest('http://evil.example.com');

      mockWssInstance.emit('connection', ws, req);

      expect(ws.close).toHaveBeenCalledWith(4001, 'Only localhost connections allowed');
    });

    it('rejects connections from https external origins', async () => {
      await initDefault();
      const ws = makeClientSocket();
      const req = makeRequest('https://attacker.com');

      mockWssInstance.emit('connection', ws, req);

      expect(ws.close).toHaveBeenCalledWith(4001, 'Only localhost connections allowed');
    });

    it('allows connections with no origin header (non-browser clients like CLI)', async () => {
      await initDefault();
      const ws = makeClientSocket();
      const req = makeRequest(undefined);

      mockWssInstance.emit('connection', ws, req);

      expect(ws.close).not.toHaveBeenCalled();
    });

    it('allows connections from unexpected localhost port but warns', async () => {
      // When appPort is set to 3000 but connection comes from :5173
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await initDefault({ appPort: 3000 });
      const ws = makeClientSocket();
      const req = makeRequest('http://localhost:5173');

      mockWssInstance.emit('connection', ws, req);

      // Should NOT be rejected (just warned)
      expect(ws.close).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('unexpected port'),
      );
      consoleSpy.mockRestore();
    });

    it('does not warn about port mismatch when appPort matches', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await initDefault({ appPort: 3000 });
      const ws = makeClientSocket();
      const req = makeRequest('http://localhost:3000');

      mockWssInstance.emit('connection', ws, req);

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('unexpected port'),
      );
      consoleSpy.mockRestore();
    });

    it('does not perform port matching when appPort is not set', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await initDefault(); // no appPort
      const ws = makeClientSocket();
      const req = makeRequest('http://localhost:9999');

      mockWssInstance.emit('connection', ws, req);

      expect(ws.close).not.toHaveBeenCalled();
      // Should not warn about unexpected port
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('unexpected port'),
      );
      consoleSpy.mockRestore();
    });
  });

  // ========================================================================
  // Message routing (basic dispatch validation)
  // ========================================================================

  describe('message routing', () => {
    function makeClientSocket() {
      const ws = new EventEmitter() as EventEmitter & {
        send: ReturnType<typeof vi.fn>;
        close: ReturnType<typeof vi.fn>;
        readyState: number;
      };
      ws.send = vi.fn();
      ws.close = vi.fn();
      ws.readyState = 1;
      return ws;
    }

    function makeRequest(origin?: string): IncomingMessage {
      return {
        headers: { origin },
        socket: { remoteAddress: '127.0.0.1', remotePort: 54321 },
      } as unknown as IncomingMessage;
    }

    function connectClient(origin = 'http://localhost:3000') {
      const ws = makeClientSocket();
      const req = makeRequest(origin);
      mockWssInstance.emit('connection', ws, req);
      return ws;
    }

    it('responds to browser-client-ready with server-info', async () => {
      await initDefault({ appPort: 3000 });
      const ws = connectClient();

      // Simulate browser-client-ready message
      const msg = Buffer.from(JSON.stringify({ type: 'browser-client-ready' }));
      ws.emit('message', msg);

      // Allow async handlers to settle
      await vi.waitFor(() => {
        expect(ws.send).toHaveBeenCalled();
      });

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('server-info');
      expect(sent.appPort).toBe(3000);
      expect(sent.wsPort).toBe(9223);
    });

    it('responds to check-api-key with api-key-status', async () => {
      await initDefault();
      const ws = connectClient();

      const msg = Buffer.from(JSON.stringify({ type: 'check-api-key' }));
      ws.emit('message', msg);

      await vi.waitFor(() => {
        expect(ws.send).toHaveBeenCalled();
      });

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('api-key-status');
      expect(typeof sent.configured).toBe('boolean');
      expect(sent.model).toBe('claude-sonnet-4-5-latest');
    });

    it('sends parse error for invalid JSON messages', async () => {
      await initDefault();
      const ws = connectClient();

      const msg = Buffer.from('not valid json!!!');
      ws.emit('message', msg);

      await vi.waitFor(() => {
        expect(ws.send).toHaveBeenCalled();
      });

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.success).toBe(false);
      expect(sent.error).toBeDefined();
    });

    it('cleans up subscriptions on client disconnect', async () => {
      const { cleanupClientSubscriptions } = await import('./subscriptions.js');
      await initDefault();
      const ws = connectClient();

      ws.emit('close');

      expect(cleanupClientSubscriptions).toHaveBeenCalledWith(ws);
    });

    it('cleans up subscriptions on client error', async () => {
      const { cleanupClientSubscriptions } = await import('./subscriptions.js');
      await initDefault();
      const ws = connectClient();

      ws.emit('error', new Error('connection reset'));

      expect(cleanupClientSubscriptions).toHaveBeenCalledWith(ws);
    });
  });
});
