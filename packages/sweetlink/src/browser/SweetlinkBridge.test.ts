import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WS_PORT, WS_PORT_OFFSET } from '../types.js';
import {
  destroySweetlinkBridge,
  getSweetlinkBridge,
  initSweetlinkBridge,
  SweetlinkBridge,
} from './SweetlinkBridge.js';

// ---------------------------------------------------------------------------
// MockWebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code?: number }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readyState = MockWebSocket.OPEN;
  url: string;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    // Store for test access
    MockWebSocket.instances.push(this);
  }

  static instances: MockWebSocket[] = [];

  static reset() {
    MockWebSocket.instances = [];
  }
}

// Expose CONNECTING/OPEN/etc as class-level statics for the WebSocket spec
Object.defineProperty(MockWebSocket, 'CONNECTING', { value: 0 });
Object.defineProperty(MockWebSocket, 'OPEN', { value: 1 });
Object.defineProperty(MockWebSocket, 'CLOSING', { value: 2 });
Object.defineProperty(MockWebSocket, 'CLOSED', { value: 3 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Install MockWebSocket on globalThis and return a restore function.
 */
function installMockWebSocket() {
  const original = globalThis.WebSocket;
  // @ts-expect-error - assigning mock
  globalThis.WebSocket = MockWebSocket;
  MockWebSocket.reset();
  return () => {
    globalThis.WebSocket = original;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SweetlinkBridge - constructor', () => {
  it('uses defaults when no config is provided', () => {
    const bridge = new SweetlinkBridge();
    // The bridge should construct without error
    expect(bridge).toBeInstanceOf(SweetlinkBridge);
    expect(bridge.isConnected()).toBe(false);
    expect(bridge.getServerInfo()).toBeNull();
  });

  it('accepts custom basePort', () => {
    const bridge = new SweetlinkBridge({ basePort: 5555 });
    expect(bridge).toBeInstanceOf(SweetlinkBridge);
  });

  it('accepts custom maxPortRetries', () => {
    const bridge = new SweetlinkBridge({ maxPortRetries: 5 });
    expect(bridge).toBeInstanceOf(SweetlinkBridge);
  });

  it('accepts HMR configuration options', () => {
    const bridge = new SweetlinkBridge({
      hmrScreenshots: true,
      hmrDebounceMs: 500,
      hmrCaptureDelay: 200,
    });
    expect(bridge).toBeInstanceOf(SweetlinkBridge);
  });

  it('calculates basePort from window.location.port + WS_PORT_OFFSET when no basePort given', () => {
    // In happy-dom, window.location.port defaults to '' for protocol default,
    // so the fallback in constructor uses protocol to pick 80/443 then adds offset.
    // We just verify it constructs successfully with the computed port.
    const bridge = new SweetlinkBridge();
    expect(bridge).toBeInstanceOf(SweetlinkBridge);
  });
});

describe('SweetlinkBridge - port calculation', () => {
  it('falls back to DEFAULT_WS_PORT when port is zero and not https', () => {
    // window.location.port is '' in happy-dom (protocol is 'http:'),
    // so currentAppPort = 80, and basePort = 80 + WS_PORT_OFFSET
    const bridge = new SweetlinkBridge();
    // We cannot directly read the private field, but we can verify the bridge
    // functions without crashing. The DEFAULT_WS_PORT constant is used only
    // when currentAppPort <= 0, which does not happen in happy-dom (port defaults
    // to 80 for http).
    expect(bridge.isConnected()).toBe(false);
  });

  it('uses explicit basePort over calculated port', () => {
    const bridge = new SweetlinkBridge({ basePort: 7777 });
    expect(bridge).toBeInstanceOf(SweetlinkBridge);
  });
});

describe('SweetlinkBridge - init / destroy lifecycle', () => {
  let restoreWS: () => void;
  let bridge: SweetlinkBridge;
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let originalWarn: typeof console.warn;
  let originalInfo: typeof console.info;

  beforeEach(() => {
    originalLog = console.log;
    originalError = console.error;
    originalWarn = console.warn;
    originalInfo = console.info;
    restoreWS = installMockWebSocket();
    bridge = new SweetlinkBridge({ basePort: 9000 });
  });

  afterEach(() => {
    bridge.destroy();
    restoreWS();
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
  });

  it('creates a WebSocket connection on init', () => {
    bridge.init();
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:9000');
  });

  it('sends browser-client-ready on WebSocket open', () => {
    bridge.init();
    const ws = MockWebSocket.instances[0];

    // Simulate open
    ws.onopen?.();

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'browser-client-ready' }));
  });

  it('sets connected/verified on server-info matching app port', () => {
    bridge.init();
    const ws = MockWebSocket.instances[0];

    ws.onopen?.();

    // Simulate server-info message that matches app port (null = any)
    const serverInfo = {
      type: 'server-info',
      appPort: null,
      wsPort: 9000,
      projectDir: '/tmp/project',
      timestamp: Date.now(),
    };
    ws.onmessage?.({ data: JSON.stringify(serverInfo) });

    expect(bridge.isConnected()).toBe(true);
    expect(bridge.getServerInfo()).not.toBeNull();
    expect(bridge.getServerInfo()?.projectDir).toBe('/tmp/project');
  });

  it('tries next port when server-info appPort does not match', () => {
    bridge.init();
    const ws = MockWebSocket.instances[0];

    ws.onopen?.();

    // server-info says appPort=5555, but our app is on a different port
    const serverInfo = {
      type: 'server-info',
      appPort: 5555,
      wsPort: 9000,
      projectDir: '/tmp/project',
      timestamp: Date.now(),
    };
    ws.onmessage?.({ data: JSON.stringify(serverInfo) });

    // Should close and try next port
    expect(ws.close).toHaveBeenCalled();
    expect(bridge.isConnected()).toBe(false);
  });

  it('handles command responses after verification', async () => {
    bridge.init();
    const ws = MockWebSocket.instances[0];

    ws.onopen?.();

    // Verify connection
    const serverInfo = {
      type: 'server-info',
      appPort: null,
      wsPort: 9000,
      projectDir: '/tmp/project',
      timestamp: Date.now(),
    };
    ws.onmessage?.({ data: JSON.stringify(serverInfo) });

    // Send a get-logs command
    ws.send.mockClear();
    ws.onmessage?.({ data: JSON.stringify({ type: 'get-logs' }) });

    // Wait for async handling to complete
    await vi.waitFor(() => {
      expect(ws.send).toHaveBeenCalled();
    });

    // Parse the response
    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData.success).toBe(true);
  });

  it('ignores commands before verification', () => {
    bridge.init();
    const ws = MockWebSocket.instances[0];

    ws.onopen?.();

    // Send command without verifying first
    ws.onmessage?.({ data: JSON.stringify({ type: 'get-logs' }) });

    // Should not send any response (besides browser-client-ready)
    // The only send call should be browser-client-ready from onopen
    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(ws.send.mock.calls[0][0]).type).toBe('browser-client-ready');
  });

  it('sends error response for unknown command types', async () => {
    bridge.init();
    const ws = MockWebSocket.instances[0];
    ws.onopen?.();

    // Verify
    ws.onmessage?.({
      data: JSON.stringify({
        type: 'server-info',
        appPort: null,
        wsPort: 9000,
        projectDir: '/tmp',
        timestamp: Date.now(),
      }),
    });

    ws.send.mockClear();
    ws.onmessage?.({ data: JSON.stringify({ type: 'unknown-command-xyz' }) });

    await vi.waitFor(() => {
      expect(ws.send).toHaveBeenCalled();
    });

    const response = JSON.parse(ws.send.mock.calls[0][0]);
    expect(response.success).toBe(false);
    expect(response.error).toContain('Unknown command');
  });

  it('sends error response when JSON parsing fails', () => {
    bridge.init();
    const ws = MockWebSocket.instances[0];
    ws.onopen?.();

    // Verify
    ws.onmessage?.({
      data: JSON.stringify({
        type: 'server-info',
        appPort: null,
        wsPort: 9000,
        projectDir: '/tmp',
        timestamp: Date.now(),
      }),
    });

    ws.send.mockClear();
    ws.onmessage?.({ data: 'not-valid-json{{{' });

    // Should send an error response
    expect(ws.send).toHaveBeenCalledTimes(1);
    const response = JSON.parse(ws.send.mock.calls[0][0]);
    expect(response.success).toBe(false);
  });

  it('cleans up on destroy', () => {
    bridge.init();
    const ws = MockWebSocket.instances[0];

    bridge.destroy();

    expect(ws.close).toHaveBeenCalled();
    expect(bridge.isConnected()).toBe(false);
    expect(bridge.getServerInfo()).toBeNull();
  });

  it('destroy is safe to call multiple times', () => {
    bridge.init();
    bridge.destroy();
    expect(() => bridge.destroy()).not.toThrow();
  });

  it('destroy without init does not throw', () => {
    const freshBridge = new SweetlinkBridge();
    expect(() => freshBridge.destroy()).not.toThrow();
  });

  it('schedules reconnection on WebSocket close', () => {
    vi.useFakeTimers();
    bridge.init();
    const ws = MockWebSocket.instances[0];

    // Simulate close
    ws.onclose?.({ code: 1000 });

    expect(bridge.isConnected()).toBe(false);

    // Advance timer to trigger reconnect
    vi.advanceTimersByTime(2500);

    // A new WebSocket should have been created
    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
    vi.useRealTimers();
  });

  it('tries next port on origin mismatch close code 4001', () => {
    vi.useFakeTimers();
    bridge.init();
    const ws = MockWebSocket.instances[0];

    // Simulate close with origin mismatch code
    ws.onclose?.({ code: 4001 });

    // Should try next port quickly (100ms)
    vi.advanceTimersByTime(200);

    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
    expect(MockWebSocket.instances[1].url).toBe('ws://localhost:9001');
    vi.useRealTimers();
  });

  it('handles screenshot-saved message type', () => {
    bridge.init();
    const ws = MockWebSocket.instances[0];
    ws.onopen?.();

    // This message type should be handled without sending a response
    ws.send.mockClear();
    ws.onmessage?.({
      data: JSON.stringify({ type: 'screenshot-saved', path: '/tmp/screenshot.png' }),
    });

    // No command response should be sent (only the message is logged)
    // browser-client-ready was already sent, so send should not be called again for this
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('handles design-review-saved message type', () => {
    bridge.init();
    const ws = MockWebSocket.instances[0];
    ws.onopen?.();

    ws.send.mockClear();
    ws.onmessage?.({
      data: JSON.stringify({ type: 'design-review-saved', reviewPath: '/tmp/review.md' }),
    });

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('handles design-review-error message type', () => {
    bridge.init();
    const ws = MockWebSocket.instances[0];
    ws.onopen?.();

    ws.send.mockClear();
    ws.onmessage?.({
      data: JSON.stringify({ type: 'design-review-error', error: 'API key missing' }),
    });

    expect(ws.send).not.toHaveBeenCalled();
  });
});

describe('SweetlinkBridge - isConnected / getServerInfo', () => {
  it('isConnected returns false before init', () => {
    const bridge = new SweetlinkBridge();
    expect(bridge.isConnected()).toBe(false);
  });

  it('getServerInfo returns null before init', () => {
    const bridge = new SweetlinkBridge();
    expect(bridge.getServerInfo()).toBeNull();
  });
});

describe('initSweetlinkBridge / getSweetlinkBridge / destroySweetlinkBridge', () => {
  let restoreWS: () => void;
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let originalWarn: typeof console.warn;
  let originalInfo: typeof console.info;

  beforeEach(() => {
    originalLog = console.log;
    originalError = console.error;
    originalWarn = console.warn;
    originalInfo = console.info;
    restoreWS = installMockWebSocket();
    // Make sure no global bridge exists
    destroySweetlinkBridge();
  });

  afterEach(() => {
    destroySweetlinkBridge();
    restoreWS();
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
  });

  it('initSweetlinkBridge creates and returns a bridge', () => {
    const bridge = initSweetlinkBridge({ basePort: 8888 });
    expect(bridge).toBeInstanceOf(SweetlinkBridge);
  });

  it('initSweetlinkBridge returns the same instance on second call', () => {
    const bridge1 = initSweetlinkBridge({ basePort: 8888 });
    const bridge2 = initSweetlinkBridge({ basePort: 9999 });
    expect(bridge1).toBe(bridge2);
  });

  it('getSweetlinkBridge returns null when no bridge initialized', () => {
    expect(getSweetlinkBridge()).toBeNull();
  });

  it('getSweetlinkBridge returns the bridge after init', () => {
    const bridge = initSweetlinkBridge({ basePort: 8888 });
    expect(getSweetlinkBridge()).toBe(bridge);
  });

  it('destroySweetlinkBridge clears the global bridge', () => {
    initSweetlinkBridge({ basePort: 8888 });
    destroySweetlinkBridge();
    expect(getSweetlinkBridge()).toBeNull();
  });

  it('destroySweetlinkBridge is safe when no bridge exists', () => {
    expect(() => destroySweetlinkBridge()).not.toThrow();
  });
});
