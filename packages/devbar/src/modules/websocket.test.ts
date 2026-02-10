/**
 * WebSocket module tests
 *
 * Tests for connectWebSocket and handleNotification functions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectWebSocket, handleNotification } from './websocket.js';
import type { DevBarState } from './types.js';

/** Create a minimal mock DevBarState for testing */
function createMockState(overrides: Partial<DevBarState> = {}): DevBarState {
  return {
    options: {
      showTooltips: true,
      showScreenshot: true,
      showConsoleBadges: true,
      saveLocation: 'auto',
      position: 'bottom-left',
      wsPort: 9223,
      accentColor: '#10b981',
      showMetrics: { breakpoint: true, fcp: true, lcp: true, cls: true, inp: true, pageSize: true },
    },
    debug: { state: vi.fn(), perf: vi.fn(), ws: vi.fn(), render: vi.fn(), event: vi.fn() },
    container: null,
    overlayElement: null,
    ws: null,
    sweetlinkConnected: false,
    wsVerified: false,
    serverProjectDir: null,
    reconnectAttempts: 0,
    currentAppPort: 3000,
    baseWsPort: 9223,
    reconnectTimeout: null,
    destroyed: false,
    consoleLogs: [],
    consoleFilter: null,
    capturing: false,
    copiedToClipboard: false,
    copiedPath: false,
    lastScreenshot: null,
    designReviewInProgress: false,
    lastDesignReview: null,
    designReviewError: null,
    showDesignReviewConfirm: false,
    apiKeyStatus: null,
    lastOutline: null,
    lastSchema: null,
    savingOutline: false,
    savingSchema: false,
    showOutlineModal: false,
    showSchemaModal: false,
    savingConsoleLogs: false,
    lastConsoleLogs: null,
    consoleLogsTimeout: undefined,
    screenshotTimeout: null,
    copiedPathTimeout: null,
    designReviewTimeout: null,
    designReviewErrorTimeout: null,
    outlineTimeout: null,
    schemaTimeout: null,
    breakpointInfo: null,
    perfStats: null,
    lcpValue: null,
    clsValue: 0,
    inpValue: 0,
    resizeHandler: null,
    fcpObserver: null,
    lcpObserver: null,
    clsObserver: null,
    inpObserver: null,
    themeMode: 'system',
    themeMediaQuery: null,
    themeMediaHandler: null,
    collapsed: false,
    compactMode: false,
    showSettingsPopover: false,
    lastDotPosition: null,
    activeTooltips: new Set(),
    keydownHandler: null,
    settingsManager: {
      get: vi.fn(),
      getSettings: vi.fn(),
      saveSettings: vi.fn(),
      saveSettingsNow: vi.fn(),
      loadSettings: vi.fn(),
      resetToDefaults: vi.fn(),
      onChange: vi.fn(() => () => {}),
      setConnected: vi.fn(),
      setWebSocket: vi.fn(),
      handleSettingsLoaded: vi.fn(),
    } as any,
    render: vi.fn(),
    getLogCounts: vi.fn(() => ({ errorCount: 0, warningCount: 0, infoCount: 0 })),
    resetPositionStyles: vi.fn(),
    createCollapsedBadge: vi.fn(),
    handleScreenshot: vi.fn(),
    toggleCompactMode: vi.fn(),
    connectWebSocket: vi.fn(),
    handleNotification: vi.fn(),
    applySettings: vi.fn(),
    ...overrides,
  } as any;
}

/** Create a mock WebSocket class for testing */
function createMockWebSocketClass() {
  const instances: any[] = [];

  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;

    url: string;
    readyState = MockWebSocket.OPEN;
    onopen: ((ev: any) => void) | null = null;
    onmessage: ((ev: any) => void) | null = null;
    onclose: ((ev: any) => void) | null = null;
    onerror: ((ev: any) => void) | null = null;
    send = vi.fn();
    close = vi.fn();

    constructor(url: string) {
      this.url = url;
      instances.push(this);
    }
  }

  return { MockWebSocket, instances };
}

describe('connectWebSocket', () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  it('does nothing if state is destroyed', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState({ destroyed: true });
    connectWebSocket(state);

    expect(instances).toHaveLength(0);
  });

  it('creates a WebSocket to the base port by default', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState({ baseWsPort: 9223 });
    connectWebSocket(state);

    expect(instances).toHaveLength(1);
    expect(instances[0].url).toBe('ws://localhost:9223');
    expect(state.ws).toBe(instances[0]);
    expect(state.wsVerified).toBe(false);
  });

  it('creates a WebSocket to a custom port when specified', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState({ baseWsPort: 9223 });
    connectWebSocket(state, 9225);

    expect(instances[0].url).toBe('ws://localhost:9225');
  });

  it('sends browser-client-ready on open', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState();
    connectWebSocket(state);

    const ws = instances[0];
    ws.onopen!({});

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'browser-client-ready' }));
  });

  it('verifies server on matching server-info and marks connected', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState({ currentAppPort: 3000 });
    connectWebSocket(state);

    const ws = instances[0];
    // Simulate server-info that matches our app port
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: 3000, projectDir: '/proj' }) });

    expect(state.wsVerified).toBe(true);
    expect(state.sweetlinkConnected).toBe(true);
    expect(state.reconnectAttempts).toBe(0);
    expect(state.serverProjectDir).toBe('/proj');
    expect((state.settingsManager as any).setWebSocket).toHaveBeenCalledWith(ws);
    expect((state.settingsManager as any).setConnected).toHaveBeenCalledWith(true);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'load-settings' }));
    expect(state.render).toHaveBeenCalled();
  });

  it('accepts server-info with null appPort (matches any app)', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState({ currentAppPort: 5000 });
    connectWebSocket(state);

    const ws = instances[0];
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });

    expect(state.wsVerified).toBe(true);
    expect(state.sweetlinkConnected).toBe(true);
  });

  it('closes and tries next port on server-info mismatch', () => {
    vi.useFakeTimers();
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState({ baseWsPort: 9223, currentAppPort: 3000 });
    connectWebSocket(state);

    const ws = instances[0];
    // Simulate server-info with a different app port
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: 4000 }) });

    expect(ws.close).toHaveBeenCalled();
    expect(state.wsVerified).toBe(false);

    // After delay, should try next port
    vi.advanceTimersByTime(200);
    expect(instances).toHaveLength(2);
    expect(instances[1].url).toBe('ws://localhost:9224');

    vi.useRealTimers();
  });

  it('ignores commands before verification', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState();
    connectWebSocket(state);

    const ws = instances[0];
    // Send a command without first sending server-info
    ws.onmessage!({ data: JSON.stringify({ type: 'screenshot-saved', path: '/test.png' }) });

    // Should not have processed - state unchanged
    expect(state.lastScreenshot).toBeNull();
  });

  it('resets connection state on close when verified', () => {
    vi.useFakeTimers();
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState();
    connectWebSocket(state);

    const ws = instances[0];
    // First verify
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });
    expect(state.sweetlinkConnected).toBe(true);

    // Then close
    ws.onclose!({});

    expect(state.sweetlinkConnected).toBe(false);
    expect(state.wsVerified).toBe(false);
    expect(state.serverProjectDir).toBeNull();
    expect((state.settingsManager as any).setConnected).toHaveBeenCalledWith(false);
    expect(state.render).toHaveBeenCalledTimes(2); // once on verify, once on close

    vi.useRealTimers();
  });

  it('does not reset connection state on close when not verified', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState();
    connectWebSocket(state);

    const ws = instances[0];
    // Close without ever verifying
    ws.onclose!({});

    expect(state.sweetlinkConnected).toBe(false);
    expect(state.render).not.toHaveBeenCalled();
  });

  it('schedules reconnect with exponential backoff after verified close', () => {
    vi.useFakeTimers();
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState({ reconnectAttempts: 0 });
    connectWebSocket(state);

    // Verify
    instances[0].onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });
    // Close
    instances[0].onclose!({});

    expect(state.reconnectAttempts).toBe(1);
    expect(state.reconnectTimeout).not.toBeNull();

    // Advance by base delay (1000ms)
    vi.advanceTimersByTime(1000);
    expect(instances).toHaveLength(2);

    vi.useRealTimers();
  });

  it('does not reconnect when destroyed', () => {
    vi.useFakeTimers();
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState();
    connectWebSocket(state);

    // Verify then destroy
    instances[0].onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });
    state.destroyed = true;
    instances[0].onclose!({});

    vi.advanceTimersByTime(60000);
    expect(instances).toHaveLength(1); // No reconnect created

    vi.useRealTimers();
  });

  it('does not reconnect when max attempts exceeded', () => {
    vi.useFakeTimers();
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState();
    connectWebSocket(state);

    // Verify then close
    instances[0].onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });

    // Manually set reconnectAttempts to max AFTER verify (which resets to 0)
    state.reconnectAttempts = 10; // MAX_RECONNECT_ATTEMPTS = 10
    instances[0].onclose!({});

    // 10 < 10 is false, so no reconnect should be scheduled
    vi.advanceTimersByTime(60000);
    expect(instances).toHaveLength(1);

    vi.useRealTimers();
  });
});

describe('handleNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when path is undefined', () => {
    const state = createMockState();
    handleNotification(state, 'screenshot', undefined, 3000);

    expect(state.lastScreenshot).toBeNull();
    expect(state.render).not.toHaveBeenCalled();
  });

  it('sets screenshot state and calls render', () => {
    const state = createMockState();
    handleNotification(state, 'screenshot', '/path/to/screenshot.png', 3000);

    expect(state.lastScreenshot).toBe('/path/to/screenshot.png');
    expect(state.render).toHaveBeenCalled();
  });

  it('clears screenshot state after duration', () => {
    const state = createMockState();
    handleNotification(state, 'screenshot', '/path.png', 3000);

    expect(state.lastScreenshot).toBe('/path.png');

    vi.advanceTimersByTime(3000);
    expect(state.lastScreenshot).toBeNull();
    expect(state.render).toHaveBeenCalledTimes(2); // initial + clear
  });

  it('clears previous screenshot timeout before setting new one', () => {
    const state = createMockState();
    handleNotification(state, 'screenshot', '/first.png', 3000);
    handleNotification(state, 'screenshot', '/second.png', 3000);

    expect(state.lastScreenshot).toBe('/second.png');

    vi.advanceTimersByTime(3000);
    expect(state.lastScreenshot).toBeNull();
  });

  it('handles designReview type', () => {
    const state = createMockState();
    handleNotification(state, 'designReview', '/review.md', 5000);

    expect(state.lastDesignReview).toBe('/review.md');
    expect(state.render).toHaveBeenCalled();

    vi.advanceTimersByTime(5000);
    expect(state.lastDesignReview).toBeNull();
  });

  it('handles outline type and resets savingOutline', () => {
    const state = createMockState({ savingOutline: true });
    handleNotification(state, 'outline', '/outline.md', 3000);

    expect(state.savingOutline).toBe(false);
    expect(state.lastOutline).toBe('/outline.md');
    expect(state.render).toHaveBeenCalled();

    vi.advanceTimersByTime(3000);
    expect(state.lastOutline).toBeNull();
  });

  it('handles schema type and resets savingSchema', () => {
    const state = createMockState({ savingSchema: true });
    handleNotification(state, 'schema', '/schema.md', 3000);

    expect(state.savingSchema).toBe(false);
    expect(state.lastSchema).toBe('/schema.md');
    expect(state.render).toHaveBeenCalled();

    vi.advanceTimersByTime(3000);
    expect(state.lastSchema).toBeNull();
  });

  it('handles consoleLogs type and resets savingConsoleLogs', () => {
    const state = createMockState({ savingConsoleLogs: true });
    handleNotification(state, 'consoleLogs', '/logs.md', 3000);

    expect(state.savingConsoleLogs).toBe(false);
    expect(state.lastConsoleLogs).toBe('/logs.md');
    expect(state.render).toHaveBeenCalled();

    vi.advanceTimersByTime(3000);
    expect(state.lastConsoleLogs).toBeNull();
  });
});
