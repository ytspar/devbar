/**
 * WebSocket module tests
 *
 * Tests for connectWebSocket and handleNotification functions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock modules used by command handlers
vi.mock('../accessibility.js', () => ({
  runA11yAudit: vi.fn(),
}));
vi.mock('../lazy/lazyHtml2Canvas.js', () => ({
  getHtml2Canvas: vi.fn(),
}));
vi.mock('../outline.js', () => ({
  extractDocumentOutline: vi.fn(() => []),
  outlineToMarkdown: vi.fn(() => ''),
}));
vi.mock('../schema.js', () => ({
  extractPageSchema: vi.fn(() => ({})),
  schemaToMarkdown: vi.fn(() => ''),
}));

import type { DevBarState } from './types.js';
import { connectWebSocket, handleNotification } from './websocket.js';

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
    serverGitBranch: null,
    serverAppName: null,
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
    showA11yModal: false,
    a11yLoading: false,
    savingA11yAudit: false,
    lastA11yAudit: null,
    a11yTimeout: null,
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
    clearConsoleLogs: vi.fn(),
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
    ws.onmessage!({
      data: JSON.stringify({ type: 'server-info', appPort: 3000, projectDir: '/proj' }),
    });

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

  it('handles a11y type and resets savingA11yAudit', () => {
    const state = createMockState({ savingA11yAudit: true } as any);
    handleNotification(state, 'a11y', '/a11y-report.md', 3000);

    expect(state.savingA11yAudit).toBe(false);
    expect(state.lastA11yAudit).toBe('/a11y-report.md');
    expect(state.render).toHaveBeenCalled();

    vi.advanceTimersByTime(3000);
    expect(state.lastA11yAudit).toBeNull();
    expect(state.render).toHaveBeenCalledTimes(2);
  });

  it('clears previous a11y timeout before setting new one', () => {
    const state = createMockState({ savingA11yAudit: true } as any);
    handleNotification(state, 'a11y', '/first-a11y.md', 3000);
    handleNotification(state, 'a11y', '/second-a11y.md', 3000);

    expect(state.lastA11yAudit).toBe('/second-a11y.md');

    vi.advanceTimersByTime(3000);
    expect(state.lastA11yAudit).toBeNull();
  });

  it('clears previous designReview timeout before setting new one', () => {
    const state = createMockState();
    handleNotification(state, 'designReview', '/first-review.md', 5000);
    handleNotification(state, 'designReview', '/second-review.md', 5000);

    expect(state.lastDesignReview).toBe('/second-review.md');

    vi.advanceTimersByTime(5000);
    expect(state.lastDesignReview).toBeNull();
  });

  it('clears previous outline timeout before setting new one', () => {
    const state = createMockState({ savingOutline: true });
    handleNotification(state, 'outline', '/first-outline.md', 3000);
    handleNotification(state, 'outline', '/second-outline.md', 3000);

    expect(state.lastOutline).toBe('/second-outline.md');

    vi.advanceTimersByTime(3000);
    expect(state.lastOutline).toBeNull();
  });

  it('clears previous schema timeout before setting new one', () => {
    const state = createMockState({ savingSchema: true });
    handleNotification(state, 'schema', '/first-schema.md', 3000);
    handleNotification(state, 'schema', '/second-schema.md', 3000);

    expect(state.lastSchema).toBe('/second-schema.md');

    vi.advanceTimersByTime(3000);
    expect(state.lastSchema).toBeNull();
  });

  it('clears previous consoleLogs timeout before setting new one', () => {
    const state = createMockState({ savingConsoleLogs: true });
    handleNotification(state, 'consoleLogs', '/first-logs.md', 3000);
    handleNotification(state, 'consoleLogs', '/second-logs.md', 3000);

    expect(state.lastConsoleLogs).toBe('/second-logs.md');

    vi.advanceTimersByTime(3000);
    expect(state.lastConsoleLogs).toBeNull();
  });
});

describe('connectWebSocket - port scan exhaustion', () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('restarts from base port when all ports exhausted', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    // baseWsPort=9223, MAX_PORT_RETRIES=10, so max port is 9232
    // Connect starting at port 9232 (baseWsPort + MAX_PORT_RETRIES - 1)
    const state = createMockState({ baseWsPort: 9223, currentAppPort: 3000 });
    connectWebSocket(state, 9232);

    const ws = instances[0];
    // Mismatch at the last port
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: 4000 }) });

    expect(ws.close).toHaveBeenCalled();

    // nextPort would be 9233, which is >= 9223 + 10 = 9233, so it restarts from base
    // PORT_SCAN_RESTART_DELAY_MS = 3000
    vi.advanceTimersByTime(3000);
    expect(instances).toHaveLength(2);
    expect(instances[1].url).toBe('ws://localhost:9223');
  });

  it('handles JSON parse error in onmessage gracefully', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState();
    connectWebSocket(state);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ws = instances[0];
    // Send invalid JSON
    ws.onmessage!({ data: 'not-valid-json' });

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GlobalDevBar] Error handling command:',
      expect.any(SyntaxError)
    );
    consoleSpy.mockRestore();
  });

  it('onerror handler logs the error', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState();
    connectWebSocket(state);

    const ws = instances[0];
    // Should not throw
    ws.onerror!({});
    expect(state.debug.ws).toHaveBeenCalledWith('WebSocket error');
  });

  it('handles server-info without projectDir', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState({ currentAppPort: 3000 });
    connectWebSocket(state);

    const ws = instances[0];
    // server-info without projectDir field
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: 3000 }) });

    expect(state.wsVerified).toBe(true);
    expect(state.serverProjectDir).toBeNull();
  });

  it('reconnect delay is capped at MAX_RECONNECT_DELAY_MS', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState({ reconnectAttempts: 0 });
    connectWebSocket(state);

    // Verify
    instances[0].onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });

    // Set attempts to 8, so delay = 1000 * 2^8 = 256000 > 30000 (MAX)
    state.reconnectAttempts = 8;
    instances[0].onclose!({});

    expect(state.reconnectAttempts).toBe(9);

    // After 30000ms (the cap), should reconnect
    vi.advanceTimersByTime(30000);
    expect(instances).toHaveLength(2);
    expect(instances[1].url).toBe('ws://localhost:9223');
  });

  it('processes settings-loaded command after verification', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState();
    connectWebSocket(state);

    const ws = instances[0];
    // Verify first
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });

    // Send settings-loaded command
    ws.onmessage!({
      data: JSON.stringify({
        type: 'settings-loaded',
        settings: { position: 'top-right', themeMode: 'dark' },
      }),
    });

    // handleSettingsLoaded calls settingsManager.handleSettingsLoaded and applySettings
    expect(state.settingsManager.handleSettingsLoaded).toHaveBeenCalledWith({
      position: 'top-right',
      themeMode: 'dark',
    });
    expect(state.applySettings).toHaveBeenCalledWith({
      position: 'top-right',
      themeMode: 'dark',
    });
  });

  it('handles settings-loaded with null settings', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState();
    connectWebSocket(state);

    const ws = instances[0];
    // Verify
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });

    // Send settings-loaded with null settings
    ws.onmessage!({
      data: JSON.stringify({ type: 'settings-loaded', settings: null }),
    });

    // Should not call applySettings with null
    expect(state.applySettings).not.toHaveBeenCalled();
  });

  it('does not dispatch commands when ws is not open', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState();
    connectWebSocket(state);

    const ws = instances[0];
    // Verify
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });

    // Close the ws (simulate readyState change)
    ws.readyState = MockWebSocket.CLOSED;

    // Send a command - should not be processed since readyState is CLOSED
    ws.onmessage!({ data: JSON.stringify({ type: 'get-logs' }) });
    // No error should be thrown, and no ws.send should be called after the initial load-settings
    const sendCallsAfterSetup = ws.send.mock.calls.filter(
      (call: string[]) =>
        !call[0].includes('browser-client-ready') && !call[0].includes('load-settings')
    );
    expect(sendCallsAfterSetup).toHaveLength(0);
  });

  it('handles screenshot-saved command and updates state', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState();
    connectWebSocket(state);

    const ws = instances[0];
    // Verify
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });
    // Reset render calls from verification
    (state.render as any).mockClear();

    // Send screenshot-saved
    ws.onmessage!({
      data: JSON.stringify({ type: 'screenshot-saved', path: '/tmp/screenshot.png' }),
    });

    expect(state.lastScreenshot).toBe('/tmp/screenshot.png');
    expect(state.render).toHaveBeenCalled();
  });

  it('handles design-review-error command', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState({ designReviewInProgress: true } as any);
    connectWebSocket(state);

    const ws = instances[0];
    // Verify
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Send design-review-error
    ws.onmessage!({
      data: JSON.stringify({ type: 'design-review-error', error: 'API key missing' }),
    });

    expect(state.designReviewInProgress).toBe(false);
    expect(state.designReviewError).toBe('API key missing');
    expect(consoleSpy).toHaveBeenCalledWith(
      '[GlobalDevBar] Design review failed:',
      'API key missing'
    );

    consoleSpy.mockRestore();
  });

  it('handles api-key-status command', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState();
    connectWebSocket(state);

    const ws = instances[0];
    // Verify
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });
    (state.render as any).mockClear();

    // Send api-key-status
    ws.onmessage!({
      data: JSON.stringify({
        type: 'api-key-status',
        configured: true,
        model: 'claude-sonnet-4-20250514',
        pricing: { input: 3, output: 15 },
      }),
    });

    expect(state.apiKeyStatus).toEqual({
      configured: true,
      model: 'claude-sonnet-4-20250514',
      pricing: { input: 3, output: 15 },
    });
    expect(state.render).toHaveBeenCalled();
  });

  it('handles unknown command type gracefully (no-op)', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState();
    connectWebSocket(state);

    const ws = instances[0];
    // Verify
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });

    // Send unknown command - should not throw
    ws.onmessage!({
      data: JSON.stringify({ type: 'unknown-command-type' }),
    });

    // No error thrown, state unchanged
    expect(state.lastScreenshot).toBeNull();
  });

  it('handles console-logs-error command and resets savingConsoleLogs', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState({ savingConsoleLogs: true });
    connectWebSocket(state);

    const ws = instances[0];
    // Verify
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    ws.onmessage!({
      data: JSON.stringify({ type: 'console-logs-error', error: 'Disk full' }),
    });

    expect(state.savingConsoleLogs).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[GlobalDevBar] Console logs save failed:',
      'Disk full'
    );
    expect(state.render).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('handles a11y-error command and resets savingA11yAudit', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState({ savingA11yAudit: true } as any);
    connectWebSocket(state);

    const ws = instances[0];
    // Verify
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    ws.onmessage!({
      data: JSON.stringify({ type: 'a11y-error', error: 'axe-core failed' }),
    });

    expect(state.savingA11yAudit).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith('[GlobalDevBar] A11y save failed:', 'axe-core failed');

    consoleSpy.mockRestore();
  });

  it('handles settings-saved command', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState();
    connectWebSocket(state);

    const ws = instances[0];
    // Verify
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });

    // Send settings-saved - should just log, not throw
    ws.onmessage!({
      data: JSON.stringify({ type: 'settings-saved', settingsPath: '/proj/.devbar/settings.json' }),
    });

    expect(state.debug.state).toHaveBeenCalledWith('Settings saved to server', {
      path: '/proj/.devbar/settings.json',
    });
  });

  it('handles settings-error command', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState();
    connectWebSocket(state);

    const ws = instances[0];
    // Verify
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    ws.onmessage!({
      data: JSON.stringify({ type: 'settings-error', error: 'Permission denied' }),
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GlobalDevBar] Settings operation failed:',
      'Permission denied'
    );

    consoleSpy.mockRestore();
  });
});

// ============================================================================
// Command handler tests — lines 218-520+ (previously uncovered)
// ============================================================================

describe('connectWebSocket - command handlers', () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Helper: connect and verify, then return the ws instance */
  function connectAndVerify(state: DevBarState) {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;
    connectWebSocket(state);
    const ws = instances[0];
    ws.onmessage!({ data: JSON.stringify({ type: 'server-info', appPort: null }) });
    (state.render as any).mockClear();
    ws.send.mockClear();
    return { ws, MockWebSocket, instances };
  }

  it('handles screenshot command with html2canvas', async () => {
    const mockCanvas = {
      toDataURL: vi.fn(() => 'data:image/png;base64,abc'),
      width: 800,
      height: 600,
    };
    const mockHtml2Canvas = vi.fn().mockResolvedValue(mockCanvas);

    // Mock the lazy loader
    const { getHtml2Canvas } = await import('../lazy/lazyHtml2Canvas.js');
    vi.mocked(getHtml2Canvas).mockResolvedValue(mockHtml2Canvas);

    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'screenshot' }),
    });

    // Wait for async handler
    await vi.advanceTimersByTimeAsync(0);

    expect(mockHtml2Canvas).toHaveBeenCalledWith(document.body, {
      logging: false,
      useCORS: true,
      allowTaint: true,
    });
    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining('"screenshot":"data:image/png;base64,abc"')
    );
  });

  it('handles screenshot command with selector', async () => {
    const targetEl = document.createElement('div');
    targetEl.id = 'capture-target';
    document.body.appendChild(targetEl);

    const mockCanvas = {
      toDataURL: vi.fn(() => 'data:image/png;base64,xyz'),
      width: 400,
      height: 300,
    };
    const mockHtml2Canvas = vi.fn().mockResolvedValue(mockCanvas);

    const { getHtml2Canvas } = await import('../lazy/lazyHtml2Canvas.js');
    vi.mocked(getHtml2Canvas).mockResolvedValue(mockHtml2Canvas);

    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'screenshot', selector: '#capture-target' }),
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(mockHtml2Canvas).toHaveBeenCalledWith(targetEl, expect.any(Object));
    targetEl.remove();
  });

  it('handles screenshot command with non-existent selector (falls back to body)', async () => {
    const mockCanvas = {
      toDataURL: vi.fn(() => 'data:image/png;base64,fallback'),
      width: 100,
      height: 100,
    };
    const mockHtml2Canvas = vi.fn().mockResolvedValue(mockCanvas);

    const { getHtml2Canvas } = await import('../lazy/lazyHtml2Canvas.js');
    vi.mocked(getHtml2Canvas).mockResolvedValue(mockHtml2Canvas);

    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'screenshot', selector: '#nonexistent' }),
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(mockHtml2Canvas).toHaveBeenCalledWith(document.body, expect.any(Object));
  });

  it('handles get-logs command without filter', () => {
    const logs = [
      { level: 'error', message: 'err1', timestamp: 'ts1' },
      { level: 'log', message: 'log1', timestamp: 'ts2' },
    ];
    const state = createMockState({ consoleLogs: logs as any });
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'get-logs' }),
    });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.success).toBe(true);
    expect(sent.data).toHaveLength(2);
  });

  it('handles get-logs command with filter', () => {
    const logs = [
      { level: 'error', message: 'err1', timestamp: 'ts1' },
      { level: 'log', message: 'log1', timestamp: 'ts2' },
      { level: 'warn', message: 'an error occurred', timestamp: 'ts3' },
    ];
    const state = createMockState({ consoleLogs: logs as any });
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'get-logs', filter: 'error' }),
    });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.success).toBe(true);
    // 'error' level match + 'an error occurred' message match
    expect(sent.data).toHaveLength(2);
  });

  it('handles query-dom command without property', () => {
    const el = document.createElement('div');
    el.className = 'test-query';
    el.id = 'q1';
    el.textContent = 'Hello World';
    document.body.appendChild(el);

    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'query-dom', selector: '.test-query' }),
    });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.success).toBe(true);
    expect(sent.data.count).toBe(1);
    expect(sent.data.results[0].tagName).toBe('DIV');
    expect(sent.data.results[0].id).toBe('q1');

    el.remove();
  });

  it('handles query-dom command with property', () => {
    const el = document.createElement('div');
    el.className = 'test-prop';
    el.textContent = 'content here';
    document.body.appendChild(el);

    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'query-dom', selector: '.test-prop', property: 'textContent' }),
    });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.success).toBe(true);
    expect(sent.data.results[0]).toBe('content here');

    el.remove();
  });

  it('handles query-dom with no selector (no-op)', () => {
    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'query-dom' }),
    });

    // Should not send anything since there's no selector
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('handles exec-js command successfully', () => {
    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'exec-js', code: '2 + 2' }),
    });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.success).toBe(true);
    expect(sent.data).toBe(4);
  });

  it('handles exec-js command with error', () => {
    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'exec-js', code: 'throw new Error("test error")' }),
    });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.success).toBe(false);
    expect(sent.error).toBe('test error');
  });

  it('handles exec-js with non-Error throw', () => {
    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'exec-js', code: 'throw "string error"' }),
    });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.success).toBe(false);
    expect(sent.error).toBe('Execution failed');
  });

  it('handles exec-js with code exceeding 10000 chars (no-op)', () => {
    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'exec-js', code: 'x'.repeat(10001) }),
    });

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('handles exec-js with no code (no-op)', () => {
    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'exec-js' }),
    });

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('handles get-outline command successfully', async () => {
    const { extractDocumentOutline } = await import('../outline.js');
    const { outlineToMarkdown } = await import('../outline.js');
    vi.mocked(extractDocumentOutline).mockReturnValue([{ tag: 'h1', text: 'Title', level: 1 }] as any);
    vi.mocked(outlineToMarkdown).mockReturnValue('# Title');

    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'get-outline' }),
    });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.success).toBe(true);
    expect(sent.data.markdown).toBe('# Title');
  });

  it('handles get-outline command with error', async () => {
    const { extractDocumentOutline } = await import('../outline.js');
    vi.mocked(extractDocumentOutline).mockImplementation(() => {
      throw new Error('outline fail');
    });

    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'get-outline' }),
    });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.success).toBe(false);
    expect(sent.error).toBe('outline fail');
  });

  it('handles get-schema command successfully', async () => {
    const { extractPageSchema } = await import('../schema.js');
    const { schemaToMarkdown } = await import('../schema.js');
    vi.mocked(extractPageSchema).mockReturnValue({ title: 'Test' } as any);
    vi.mocked(schemaToMarkdown).mockReturnValue('## Schema');

    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'get-schema' }),
    });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.success).toBe(true);
    expect(sent.data.markdown).toBe('## Schema');
  });

  it('handles get-schema command with error', async () => {
    const { extractPageSchema } = await import('../schema.js');
    vi.mocked(extractPageSchema).mockImplementation(() => {
      throw new Error('schema fail');
    });

    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'get-schema' }),
    });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.success).toBe(false);
    expect(sent.error).toBe('schema fail');
  });

  it('handles refresh command', () => {
    const state = createMockState();
    const { ws } = connectAndVerify(state);

    // Mock window.location.reload
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });

    ws.onmessage!({
      data: JSON.stringify({ type: 'refresh' }),
    });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.success).toBe(true);
  });

  it('handles design-review-saved command', () => {
    const state = createMockState({ designReviewInProgress: true } as any);
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'design-review-saved', reviewPath: '/review.md' }),
    });

    expect(state.designReviewInProgress).toBe(false);
    expect(state.lastDesignReview).toBe('/review.md');
    expect(state.render).toHaveBeenCalled();
  });

  it('handles design-review-error and clears error after timeout', () => {
    const state = createMockState({ designReviewInProgress: true } as any);
    const { ws } = connectAndVerify(state);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    ws.onmessage!({
      data: JSON.stringify({ type: 'design-review-error', error: 'API limit' }),
    });

    expect(state.designReviewInProgress).toBe(false);
    expect(state.designReviewError).toBe('API limit');
    expect(state.render).toHaveBeenCalled();

    // Error should clear after DESIGN_REVIEW_NOTIFICATION_MS (5000)
    vi.advanceTimersByTime(5000);
    expect(state.designReviewError).toBeNull();

    consoleSpy.mockRestore();
  });

  it('design-review-error clears previous error timeout', () => {
    const state = createMockState({ designReviewInProgress: true } as any);
    const { ws } = connectAndVerify(state);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // First error
    ws.onmessage!({
      data: JSON.stringify({ type: 'design-review-error', error: 'first' }),
    });
    // Second error before timeout
    ws.onmessage!({
      data: JSON.stringify({ type: 'design-review-error', error: 'second' }),
    });

    expect(state.designReviewError).toBe('second');

    // Advance past first timeout - should still show second error only
    vi.advanceTimersByTime(5000);
    expect(state.designReviewError).toBeNull();

    consoleSpy.mockRestore();
  });

  it('handles api-key-status with defaults for missing fields', () => {
    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'api-key-status' }),
    });

    expect(state.apiKeyStatus).toEqual({
      configured: false,
      model: undefined,
      pricing: undefined,
    });
  });

  it('handles outline-error command (no savingFlag)', () => {
    const state = createMockState();
    const { ws } = connectAndVerify(state);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    ws.onmessage!({
      data: JSON.stringify({ type: 'outline-error', error: 'Outline failed' }),
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GlobalDevBar] Outline save failed:',
      'Outline failed'
    );
    // No savingFlag set, so render should NOT be called (beyond initial verify)
    expect(state.render).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('handles schema-error command (no savingFlag)', () => {
    const state = createMockState();
    const { ws } = connectAndVerify(state);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    ws.onmessage!({
      data: JSON.stringify({ type: 'schema-error', error: 'Schema failed' }),
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GlobalDevBar] Schema save failed:',
      'Schema failed'
    );
    expect(state.render).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('handles outline-saved command via dispatch', () => {
    const state = createMockState({ savingOutline: true });
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'outline-saved', outlinePath: '/outline.md' }),
    });

    expect(state.savingOutline).toBe(false);
    expect(state.lastOutline).toBe('/outline.md');
    expect(state.render).toHaveBeenCalled();
  });

  it('handles schema-saved command via dispatch', () => {
    const state = createMockState({ savingSchema: true });
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'schema-saved', schemaPath: '/schema.md' }),
    });

    expect(state.savingSchema).toBe(false);
    expect(state.lastSchema).toBe('/schema.md');
    expect(state.render).toHaveBeenCalled();
  });

  it('handles console-logs-saved command via dispatch', () => {
    const state = createMockState({ savingConsoleLogs: true });
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'console-logs-saved', consoleLogsPath: '/logs.md' }),
    });

    expect(state.savingConsoleLogs).toBe(false);
    expect(state.lastConsoleLogs).toBe('/logs.md');
    expect(state.render).toHaveBeenCalled();
  });

  it('handles a11y-saved command via dispatch', () => {
    const state = createMockState({ savingA11yAudit: true } as any);
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'a11y-saved', a11yPath: '/a11y.md' }),
    });

    expect(state.savingA11yAudit).toBe(false);
    expect(state.lastA11yAudit).toBe('/a11y.md');
    expect(state.render).toHaveBeenCalled();
  });

  it('handles server-info with gitBranch and appName', () => {
    const { MockWebSocket, instances } = createMockWebSocketClass();
    globalThis.WebSocket = MockWebSocket as any;

    const state = createMockState({ currentAppPort: 3000 });
    connectWebSocket(state);

    const ws = instances[0];
    ws.onmessage!({
      data: JSON.stringify({
        type: 'server-info',
        appPort: 3000,
        projectDir: '/proj',
        gitBranch: 'feature/test',
        appName: 'my-app',
      }),
    });

    expect(state.serverGitBranch).toBe('feature/test');
    expect(state.serverAppName).toBe('my-app');
  });

  it('handles get-a11y command successfully', async () => {
    const { runA11yAudit } = await import('../accessibility.js');
    vi.mocked(runA11yAudit).mockResolvedValue({
      violations: [
        { impact: 'critical', id: 'v1', description: 'test', help: '', helpUrl: '', nodes: [] },
        { impact: 'serious', id: 'v2', description: 'test2', help: '', helpUrl: '', nodes: [] },
      ],
      passes: [{ id: 'p1' }],
      incomplete: [],
    } as any);

    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'get-a11y', forceRefresh: true }),
    });

    await vi.advanceTimersByTimeAsync(0);

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.success).toBe(true);
    expect(sent.data.summary.totalViolations).toBe(2);
    expect(sent.data.summary.totalPasses).toBe(1);
    expect(sent.data.summary.byImpact.critical).toBe(1);
    expect(sent.data.summary.byImpact.serious).toBe(1);
  });

  it('handles get-a11y command with error', async () => {
    const { runA11yAudit } = await import('../accessibility.js');
    vi.mocked(runA11yAudit).mockRejectedValue(new Error('axe failed'));

    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'get-a11y' }),
    });

    await vi.advanceTimersByTimeAsync(0);

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.success).toBe(false);
    expect(sent.error).toBe('axe failed');
  });

  it('handles get-vitals command', async () => {
    // Mock performance APIs
    const origGetEntriesByType = performance.getEntriesByType;
    vi.spyOn(performance, 'getEntriesByType').mockImplementation((type: string) => {
      if (type === 'paint') {
        return [{ name: 'first-contentful-paint', startTime: 123.456 }] as any;
      }
      if (type === 'resource') {
        return [{ transferSize: 1024 }] as any;
      }
      return [];
    });

    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'get-vitals' }),
    });

    await vi.advanceTimersByTimeAsync(10);

    expect(ws.send).toHaveBeenCalled();
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.success).toBe(true);
    expect(sent.data.vitals.fcp).toBe(123);
  });

  it('handles get-vitals with no paint entries', async () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);

    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({ type: 'get-vitals' }),
    });

    await vi.advanceTimersByTimeAsync(10);

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.success).toBe(true);
    expect(sent.data.vitals.fcp).toBeNull();
  });

  // =========================================================================
  // Recording WS flow
  // =========================================================================

  it('handles record-start-response success', async () => {
    const state = createMockState();
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({
        type: 'record-start-response',
        success: true,
        sessionId: 'session-123',
      }),
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(state.recordingActive).toBe(true);
    expect(state.recordingSessionId).toBe('session-123');
    expect(state.recordingStartedAt).toBeGreaterThan(0);
    expect(state.recordingTimer).not.toBeNull();
    expect(state.render).toHaveBeenCalled();
  });

  it('handles record-stop-response success with viewerUrl', async () => {
    const mockWindow = { location: { href: '' }, close: vi.fn() };
    const state = createMockState({
      recordingActive: true,
      recordingStartedAt: Date.now(),
      recordingTimer: setInterval(() => {}, 1000),
      pendingViewerWindow: mockWindow as any,
    });
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({
        type: 'record-stop-response',
        success: true,
        viewerUrl: 'http://127.0.0.1:12345/viewer/session-123',
      }),
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(state.recordingActive).toBe(false);
    expect(state.recordingTimer).toBeNull();
    expect(state.pendingViewerWindow).toBeNull();
    expect(mockWindow.location.href).toBe('http://127.0.0.1:12345/viewer/session-123');
    expect(mockWindow.close).not.toHaveBeenCalled();
    expect(state.lastViewerPath).toBe('http://127.0.0.1:12345/viewer/session-123');
  });

  it('handles record-stop-response success without viewerUrl — closes blank tab', async () => {
    const mockWindow = { location: { href: '' }, close: vi.fn() };
    const state = createMockState({
      recordingActive: true,
      recordingStartedAt: Date.now(),
      pendingViewerWindow: mockWindow as any,
    });
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({
        type: 'record-stop-response',
        success: true,
        // no viewerUrl
      }),
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(state.pendingViewerWindow).toBeNull();
    expect(mockWindow.close).toHaveBeenCalled();
    expect(mockWindow.location.href).toBe(''); // not navigated
  });

  it('handles record-stop-response failure — cleans up blank tab', async () => {
    const mockWindow = { location: { href: '' }, close: vi.fn() };
    const state = createMockState({
      recordingActive: true,
      recordingStartedAt: Date.now(),
      pendingViewerWindow: mockWindow as any,
    });
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({
        type: 'record-stop-response',
        success: false,
        error: 'No recording in progress',
      }),
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(state.recordingActive).toBe(false);
    expect(state.pendingViewerWindow).toBeNull();
    expect(mockWindow.close).toHaveBeenCalled();
  });

  it('handles record-stop error type — cleans up blank tab', async () => {
    const mockWindow = { location: { href: '' }, close: vi.fn() };
    const state = createMockState({
      recordingActive: true,
      recordingStartedAt: Date.now(),
      pendingViewerWindow: mockWindow as any,
    });
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({
        type: 'record-stop',
        success: false,
        error: 'Daemon not running',
      }),
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(state.recordingActive).toBe(false);
    expect(state.pendingViewerWindow).toBeNull();
    expect(mockWindow.close).toHaveBeenCalled();
  });

  it('handles record-stop with no pending window gracefully', async () => {
    const state = createMockState({
      recordingActive: true,
      recordingStartedAt: Date.now(),
      pendingViewerWindow: null,
    });
    const { ws } = connectAndVerify(state);

    ws.onmessage!({
      data: JSON.stringify({
        type: 'record-stop-response',
        success: true,
        viewerUrl: 'http://127.0.0.1:12345/viewer/session-123',
      }),
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(state.recordingActive).toBe(false);
    expect(state.lastViewerPath).toBe('http://127.0.0.1:12345/viewer/session-123');
    // No crash — no pending window to navigate
  });
});
