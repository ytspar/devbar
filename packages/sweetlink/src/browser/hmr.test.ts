import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HmrCaptureConfig, HmrCaptureState } from './hmr.js';
import { captureHmrScreenshot, setupHmrDetection } from './hmr.js';

// ---------------------------------------------------------------------------
// Mock html2canvas-pro (it is imported by hmr.ts)
// ---------------------------------------------------------------------------

vi.mock('html2canvas-pro', () => {
  // Return a mock canvas when called
  return {
    default: vi.fn().mockImplementation(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      // Ensure getContext returns a usable context
      return Promise.resolve(canvas);
    }),
  };
});

// ---------------------------------------------------------------------------
// Mock screenshotUtils (avoid canvas rendering issues in test env)
// ---------------------------------------------------------------------------

vi.mock('./screenshotUtils.js', () => ({
  DEFAULT_SCREENSHOT_SCALE: 0.25,
  DEFAULT_SCREENSHOT_QUALITY: 0.7,
  scaleCanvas: vi.fn().mockImplementation(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 150;
    return canvas;
  }),
  canvasToDataUrl: vi.fn().mockReturnValue('data:image/jpeg;base64,mockdata'),
}));

// ---------------------------------------------------------------------------
// MockWebSocket for captureHmrScreenshot tests
// ---------------------------------------------------------------------------

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  readyState: number;
  send = vi.fn();
  close = vi.fn();

  constructor(readyState = MockWebSocket.OPEN) {
    this.readyState = readyState;
  }
}

// ---------------------------------------------------------------------------
// setupHmrDetection tests
// ---------------------------------------------------------------------------

describe('setupHmrDetection', () => {
  it('returns a cleanup function', () => {
    const onCapture = vi.fn();
    const cleanup = setupHmrDetection(onCapture);
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('calls onCapture with "vite" when vite:afterUpdate fires', () => {
    const onCapture = vi.fn();
    const cleanup = setupHmrDetection(onCapture);

    document.dispatchEvent(new Event('vite:afterUpdate'));

    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onCapture).toHaveBeenCalledWith('vite');

    cleanup();
  });

  it('calls onCapture with "vite" and file info when vite:hmr fires', () => {
    const onCapture = vi.fn();
    const cleanup = setupHmrDetection(onCapture);

    const event = new CustomEvent('vite:hmr', { detail: { file: 'src/App.tsx' } });
    document.dispatchEvent(event);

    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onCapture).toHaveBeenCalledWith('vite', 'src/App.tsx');

    cleanup();
  });

  it('calls onCapture with "vite" and undefined file when vite:hmr has no detail', () => {
    const onCapture = vi.fn();
    const cleanup = setupHmrDetection(onCapture);

    const event = new CustomEvent('vite:hmr');
    document.dispatchEvent(event);

    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onCapture).toHaveBeenCalledWith('vite', undefined);

    cleanup();
  });

  it('calls onCapture with "remix" when remix-hmr fires', () => {
    const onCapture = vi.fn();
    const cleanup = setupHmrDetection(onCapture);

    window.dispatchEvent(new Event('remix-hmr'));

    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onCapture).toHaveBeenCalledWith('remix');

    cleanup();
  });

  it('stops calling onCapture after cleanup', () => {
    const onCapture = vi.fn();
    const cleanup = setupHmrDetection(onCapture);

    cleanup();

    document.dispatchEvent(new Event('vite:afterUpdate'));
    window.dispatchEvent(new Event('remix-hmr'));
    document.dispatchEvent(new CustomEvent('vite:hmr'));

    expect(onCapture).not.toHaveBeenCalled();
  });

  it('handles multiple HMR events in sequence', () => {
    const onCapture = vi.fn();
    const cleanup = setupHmrDetection(onCapture);

    document.dispatchEvent(new Event('vite:afterUpdate'));
    document.dispatchEvent(new Event('vite:afterUpdate'));
    window.dispatchEvent(new Event('remix-hmr'));

    expect(onCapture).toHaveBeenCalledTimes(3);
    expect(onCapture.mock.calls[0][0]).toBe('vite');
    expect(onCapture.mock.calls[1][0]).toBe('vite');
    expect(onCapture.mock.calls[2][0]).toBe('remix');

    cleanup();
  });
});

// ---------------------------------------------------------------------------
// captureHmrScreenshot tests
// ---------------------------------------------------------------------------

describe('captureHmrScreenshot', () => {
  let state: HmrCaptureState;
  let config: HmrCaptureConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    state = {
      sequence: 0,
      debounceTimeout: null,
      lastCaptureTime: 0,
    };
    config = {
      debounceMs: 300,
      captureDelay: 100,
    };
  });

  afterEach(() => {
    if (state.debounceTimeout) clearTimeout(state.debounceTimeout);
    vi.useRealTimers();
  });

  it('does nothing when ws is null', async () => {
    await captureHmrScreenshot(null, [], state, config, 'vite');
    expect(state.sequence).toBe(0);
  });

  it('does nothing when ws is not OPEN', async () => {
    const ws = new MockWebSocket(MockWebSocket.CLOSED) as unknown as WebSocket;
    await captureHmrScreenshot(ws, [], state, config, 'vite');
    expect(state.sequence).toBe(0);
  });

  it('captures and sends screenshot over WebSocket', async () => {
    const ws = new MockWebSocket() as unknown as WebSocket;

    const promise = captureHmrScreenshot(ws, [], state, config, 'vite', 'App.tsx');

    // Advance past the capture delay
    await vi.advanceTimersByTimeAsync(config.captureDelay + 50);
    await promise;

    expect(state.sequence).toBe(1);
    expect(state.lastCaptureTime).toBeGreaterThan(0);

    const mockSend = (ws as unknown as MockWebSocket).send;
    expect(mockSend).toHaveBeenCalledTimes(1);

    const sent = JSON.parse(mockSend.mock.calls[0][0]);
    expect(sent.type).toBe('hmr-screenshot');
    expect(sent.data.trigger).toBe('vite');
    expect(sent.data.changedFile).toBe('App.tsx');
    expect(sent.data.screenshot).toBe('data:image/jpeg;base64,mockdata');
    expect(sent.data.sequenceNumber).toBe(1);
    expect(sent.data.url).toBeDefined();
    expect(typeof sent.data.timestamp).toBe('number');
  });

  it('includes console logs in the HMR data', async () => {
    const ws = new MockWebSocket() as unknown as WebSocket;
    const logs = [
      { level: 'error', message: 'some error', timestamp: 1000 },
      { level: 'warn', message: 'some warning', timestamp: 2000 },
      { level: 'log', message: 'some log', timestamp: 3000 },
    ];

    const promise = captureHmrScreenshot(ws, logs, state, config, 'vite');
    await vi.advanceTimersByTimeAsync(config.captureDelay + 50);
    await promise;

    const sent = JSON.parse((ws as unknown as MockWebSocket).send.mock.calls[0][0]);
    expect(sent.data.logs.all.length).toBe(3);
    expect(sent.data.logs.errors.length).toBe(1);
    expect(sent.data.logs.warnings.length).toBe(1);
  });

  it('debounces rapid HMR events', async () => {
    const ws = new MockWebSocket() as unknown as WebSocket;

    // First capture sets lastCaptureTime
    const promise1 = captureHmrScreenshot(ws, [], state, config, 'vite');
    await vi.advanceTimersByTimeAsync(config.captureDelay + 50);
    await promise1;

    expect(state.sequence).toBe(1);
    const mockSend = (ws as unknown as MockWebSocket).send;
    mockSend.mockClear();

    // Second capture immediately after (within debounce window) should be deferred
    captureHmrScreenshot(ws, [], state, config, 'vite');

    // The debounce timeout should be set, but send should not have been called yet
    expect(mockSend).not.toHaveBeenCalled();
    expect(state.debounceTimeout).not.toBeNull();

    // Advance past debounce and capture delay
    await vi.advanceTimersByTimeAsync(config.debounceMs + config.captureDelay + 50);

    // Now it should have captured
    expect(state.sequence).toBe(2);
  });

  it('cancels pending debounce when new event arrives', async () => {
    const ws = new MockWebSocket() as unknown as WebSocket;

    // First capture
    const promise1 = captureHmrScreenshot(ws, [], state, config, 'vite');
    await vi.advanceTimersByTimeAsync(config.captureDelay + 50);
    await promise1;

    const mockSend = (ws as unknown as MockWebSocket).send;
    mockSend.mockClear();

    // Two rapid calls within debounce window
    captureHmrScreenshot(ws, [], state, config, 'vite', 'first.ts');
    captureHmrScreenshot(ws, [], state, config, 'vite', 'second.ts');

    // Only the second should fire after debounce
    await vi.advanceTimersByTimeAsync(config.debounceMs + config.captureDelay + 50);

    // The debounced call with 'second.ts' should have sent
    expect(mockSend).toHaveBeenCalled();
    const lastSent = JSON.parse(mockSend.mock.calls[mockSend.mock.calls.length - 1][0]);
    expect(lastSent.data.changedFile).toBe('second.ts');
  });

  it('increments sequence number on each successful capture', async () => {
    const ws = new MockWebSocket() as unknown as WebSocket;

    // First capture
    let promise = captureHmrScreenshot(ws, [], state, config, 'vite');
    await vi.advanceTimersByTimeAsync(config.captureDelay + 50);
    await promise;
    expect(state.sequence).toBe(1);

    // Advance time past debounce window
    vi.advanceTimersByTime(config.debounceMs + 100);

    // Second capture
    promise = captureHmrScreenshot(ws, [], state, config, 'remix');
    await vi.advanceTimersByTimeAsync(config.captureDelay + 50);
    await promise;
    expect(state.sequence).toBe(2);
  });

  it('passes hmrMetadata through to the sent data', async () => {
    const ws = new MockWebSocket() as unknown as WebSocket;
    const metadata = {
      modulesUpdated: ['./src/App.tsx'],
      fullReload: false,
      updateDuration: 42,
    };

    const promise = captureHmrScreenshot(ws, [], state, config, 'vite', 'App.tsx', metadata);
    await vi.advanceTimersByTimeAsync(config.captureDelay + 50);
    await promise;

    const sent = JSON.parse((ws as unknown as MockWebSocket).send.mock.calls[0][0]);
    expect(sent.data.hmrMetadata).toEqual(metadata);
  });
});

describe('HmrCaptureConfig and HmrCaptureState types', () => {
  it('HmrCaptureState can be constructed with default values', () => {
    const state: HmrCaptureState = {
      sequence: 0,
      debounceTimeout: null,
      lastCaptureTime: 0,
    };
    expect(state.sequence).toBe(0);
    expect(state.debounceTimeout).toBeNull();
    expect(state.lastCaptureTime).toBe(0);
  });

  it('HmrCaptureConfig has debounceMs and captureDelay', () => {
    const config: HmrCaptureConfig = {
      debounceMs: 200,
      captureDelay: 50,
    };
    expect(config.debounceMs).toBe(200);
    expect(config.captureDelay).toBe(50);
  });
});
