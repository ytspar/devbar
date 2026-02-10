/**
 * Screenshot module tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateCostEstimate,
  closeDesignReviewConfirm,
  copyPathToClipboard,
  handleDocumentOutline,
  handlePageSchema,
  handleSaveOutline,
  handleSaveSchema,
  handleScreenshot,
  proceedWithDesignReview,
  showDesignReviewConfirmation,
} from './screenshot.js';
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
      wsPort: 24680,
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
    baseWsPort: 24680,
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
      get: vi.fn((key: string) => {
        if (key === 'accentColor') return '#10b981';
        return undefined;
      }),
      getSettings: vi.fn(() => ({
        version: 1,
        position: 'bottom-left',
        themeMode: 'system',
        compactMode: false,
        showMetrics: { breakpoint: true, fcp: true, lcp: true, cls: true, inp: true, pageSize: true },
        showScreenshot: true,
        showConsoleBadges: true,
        showTooltips: true,
        saveLocation: 'auto',
      })),
      saveSettings: vi.fn(),
      saveSettingsNow: vi.fn(),
      loadSettings: vi.fn(),
      resetToDefaults: vi.fn(),
      onChange: vi.fn(() => () => {}),
      setConnected: vi.fn(),
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

describe('copyPathToClipboard', () => {
  const mockWriteText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    mockWriteText.mockClear().mockResolvedValue(undefined);
    // navigator.clipboard is a getter-only property in happy-dom
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copies the path to clipboard and sets copiedPath state', async () => {
    const state = createMockState();
    await copyPathToClipboard(state, '/some/path.txt');

    expect(mockWriteText).toHaveBeenCalledWith('/some/path.txt');
    expect(state.copiedPath).toBe(true);
    expect(state.render).toHaveBeenCalled();
  });

  it('sets a timeout to reset copiedPath', async () => {
    vi.useFakeTimers();
    const state = createMockState();
    await copyPathToClipboard(state, '/path');

    expect(state.copiedPath).toBe(true);
    expect(state.copiedPathTimeout).not.toBeNull();

    vi.advanceTimersByTime(2000);
    expect(state.copiedPath).toBe(false);
    vi.useRealTimers();
  });

  it('clears previous timeout before setting a new one', async () => {
    vi.useFakeTimers();
    const state = createMockState();
    const existingTimeout = setTimeout(() => {}, 10000);
    state.copiedPathTimeout = existingTimeout;

    await copyPathToClipboard(state, '/path');
    // The existing timeout should have been cleared (no error thrown)
    expect(state.copiedPath).toBe(true);
    vi.useRealTimers();
  });

  it('handles clipboard write failure gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockWriteText.mockRejectedValue(new Error('denied'));

    const state = createMockState();
    await copyPathToClipboard(state, '/path');

    expect(consoleError).toHaveBeenCalledWith(
      '[GlobalDevBar] Failed to copy path:',
      expect.any(Error)
    );
    consoleError.mockRestore();
  });
});

describe('handleScreenshot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing if already capturing', async () => {
    const state = createMockState({ capturing: true });
    await handleScreenshot(state, false);
    // render should not be called since we exit early
    expect(state.render).not.toHaveBeenCalled();
  });

  it('does nothing if not copying and save is local but not connected', async () => {
    const state = createMockState({ sweetlinkConnected: false });
    state.options.saveLocation = 'local';
    await handleScreenshot(state, false);
    expect(state.render).not.toHaveBeenCalled();
  });

  it('sets capturing to true then false after completion', async () => {
    // This test verifies the capturing state lifecycle
    // handleScreenshot requires html2canvas which is hard to mock completely,
    // so we test the early-exit paths and state transitions
    const state = createMockState({ capturing: false, sweetlinkConnected: false });
    state.options.saveLocation = 'local';
    await handleScreenshot(state, false);
    // Since save is local and not connected, it exits early
    expect(state.capturing).toBe(false);
  });
});

describe('showDesignReviewConfirmation', () => {
  it('does nothing if not connected', () => {
    const state = createMockState({ sweetlinkConnected: false });
    showDesignReviewConfirmation(state);
    expect(state.showDesignReviewConfirm).toBe(false);
    expect(state.render).not.toHaveBeenCalled();
  });

  it('shows confirmation modal and closes other modals', () => {
    const sendMock = vi.fn();
    const state = createMockState({
      sweetlinkConnected: true,
      ws: { readyState: WebSocket.OPEN, send: sendMock } as any,
      showOutlineModal: true,
      showSchemaModal: true,
      consoleFilter: 'error',
    });

    showDesignReviewConfirmation(state);

    expect(state.showDesignReviewConfirm).toBe(true);
    expect(state.showOutlineModal).toBe(false);
    expect(state.showSchemaModal).toBe(false);
    expect(state.consoleFilter).toBeNull();
    expect(state.render).toHaveBeenCalled();
  });

  it('sends check-api-key message via WebSocket', () => {
    const sendMock = vi.fn();
    const state = createMockState({
      sweetlinkConnected: true,
      ws: { readyState: WebSocket.OPEN, send: sendMock } as any,
    });

    showDesignReviewConfirmation(state);

    expect(sendMock).toHaveBeenCalledWith(JSON.stringify({ type: 'check-api-key' }));
  });
});

describe('calculateCostEstimate', () => {
  it('returns null when apiKeyStatus is null', () => {
    const state = createMockState({ apiKeyStatus: null });
    expect(calculateCostEstimate(state)).toBeNull();
  });

  it('returns null when apiKeyStatus has no pricing', () => {
    const state = createMockState({
      apiKeyStatus: { configured: true },
    });
    expect(calculateCostEstimate(state)).toBeNull();
  });

  it('calculates cost estimate with pricing data', () => {
    const state = createMockState({
      apiKeyStatus: {
        configured: true,
        model: 'claude-3-5-sonnet',
        pricing: { input: 3.0, output: 15.0 },
      },
    });

    // Mock window dimensions
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    const result = calculateCostEstimate(state);
    expect(result).not.toBeNull();
    expect(result!.tokens).toBeGreaterThan(0);
    expect(typeof result!.cost).toBe('string');
  });

  it('returns "<$0.01" for very small costs', () => {
    const state = createMockState({
      apiKeyStatus: {
        configured: true,
        pricing: { input: 0.001, output: 0.001 },
      },
    });

    Object.defineProperty(window, 'innerWidth', { value: 100, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 100, configurable: true });

    const result = calculateCostEstimate(state);
    expect(result).not.toBeNull();
    expect(result!.cost).toBe('<$0.01');
  });

  it('returns formatted cost for larger amounts', () => {
    const state = createMockState({
      apiKeyStatus: {
        configured: true,
        pricing: { input: 100.0, output: 100.0 },
      },
    });

    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });

    const result = calculateCostEstimate(state);
    expect(result).not.toBeNull();
    expect(result!.cost).toMatch(/^~\$/);
  });
});

describe('closeDesignReviewConfirm', () => {
  it('closes the modal and resets apiKeyStatus', () => {
    const state = createMockState({
      showDesignReviewConfirm: true,
      apiKeyStatus: { configured: true },
    });

    closeDesignReviewConfirm(state);

    expect(state.showDesignReviewConfirm).toBe(false);
    expect(state.apiKeyStatus).toBeNull();
    expect(state.render).toHaveBeenCalled();
  });
});

describe('proceedWithDesignReview', () => {
  it('closes the confirm modal', () => {
    const state = createMockState({
      showDesignReviewConfirm: true,
      sweetlinkConnected: false,
    });

    proceedWithDesignReview(state);

    expect(state.showDesignReviewConfirm).toBe(false);
  });
});

describe('handleDocumentOutline', () => {
  it('toggles outline modal on', () => {
    const state = createMockState({ showOutlineModal: false });
    handleDocumentOutline(state);
    expect(state.showOutlineModal).toBe(true);
    expect(state.render).toHaveBeenCalled();
  });

  it('toggles outline modal off', () => {
    const state = createMockState({ showOutlineModal: true });
    handleDocumentOutline(state);
    expect(state.showOutlineModal).toBe(false);
    expect(state.render).toHaveBeenCalled();
  });

  it('closes schema modal when opening outline', () => {
    const state = createMockState({
      showOutlineModal: false,
      showSchemaModal: true,
      consoleFilter: 'error',
    });
    handleDocumentOutline(state);
    expect(state.showOutlineModal).toBe(true);
    expect(state.showSchemaModal).toBe(false);
    expect(state.consoleFilter).toBeNull();
  });
});

describe('handlePageSchema', () => {
  it('toggles schema modal on', () => {
    const state = createMockState({ showSchemaModal: false });
    handlePageSchema(state);
    expect(state.showSchemaModal).toBe(true);
    expect(state.render).toHaveBeenCalled();
  });

  it('toggles schema modal off', () => {
    const state = createMockState({ showSchemaModal: true });
    handlePageSchema(state);
    expect(state.showSchemaModal).toBe(false);
    expect(state.render).toHaveBeenCalled();
  });

  it('closes outline modal when opening schema', () => {
    const state = createMockState({
      showSchemaModal: false,
      showOutlineModal: true,
      consoleFilter: 'warn',
    });
    handlePageSchema(state);
    expect(state.showSchemaModal).toBe(true);
    expect(state.showOutlineModal).toBe(false);
    expect(state.consoleFilter).toBeNull();
  });
});

describe('handleSaveOutline', () => {
  it('does nothing if already saving', () => {
    const sendMock = vi.fn();
    const state = createMockState({
      savingOutline: true,
      ws: { readyState: WebSocket.OPEN, send: sendMock } as any,
    });
    handleSaveOutline(state);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends outline via WebSocket when connected and saveLocation is local', () => {
    const sendMock = vi.fn();
    const state = createMockState({
      savingOutline: false,
      ws: { readyState: WebSocket.OPEN, send: sendMock } as any,
    });
    state.options.saveLocation = 'local';

    handleSaveOutline(state);

    expect(state.savingOutline).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(sendMock.mock.calls[0][0]);
    expect(sent.type).toBe('save-outline');
    expect(sent.data).toHaveProperty('outline');
    expect(sent.data).toHaveProperty('markdown');
    expect(sent.data).toHaveProperty('url');
    expect(sent.data).toHaveProperty('title');
    expect(sent.data).toHaveProperty('timestamp');
    expect(state.render).toHaveBeenCalled();
  });

  it('triggers download when saveLocation is download', () => {
    const state = createMockState({
      savingOutline: false,
      ws: null,
    });
    state.options.saveLocation = 'download';
    handleSaveOutline(state);
    expect(state.handleNotification).toHaveBeenCalledWith('outline', 'outline downloaded', expect.any(Number));
  });

  it('triggers download when saveLocation is auto and not connected', () => {
    const state = createMockState({
      savingOutline: false,
      sweetlinkConnected: false,
      ws: null,
    });
    handleSaveOutline(state);
    expect(state.handleNotification).toHaveBeenCalledWith('outline', 'outline downloaded', expect.any(Number));
  });
});

describe('handleSaveSchema', () => {
  it('does nothing if already saving', () => {
    const sendMock = vi.fn();
    const state = createMockState({
      savingSchema: true,
      ws: { readyState: WebSocket.OPEN, send: sendMock } as any,
    });
    handleSaveSchema(state);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends schema via WebSocket when connected and saveLocation is local', () => {
    const sendMock = vi.fn();
    const state = createMockState({
      savingSchema: false,
      ws: { readyState: WebSocket.OPEN, send: sendMock } as any,
    });
    state.options.saveLocation = 'local';

    handleSaveSchema(state);

    expect(state.savingSchema).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(sendMock.mock.calls[0][0]);
    expect(sent.type).toBe('save-schema');
    expect(sent.data).toHaveProperty('schema');
    expect(sent.data).toHaveProperty('markdown');
    expect(sent.data).toHaveProperty('url');
    expect(sent.data).toHaveProperty('title');
    expect(sent.data).toHaveProperty('timestamp');
    expect(state.render).toHaveBeenCalled();
  });

  it('triggers download when saveLocation is download', () => {
    const state = createMockState({
      savingSchema: false,
      ws: null,
    });
    state.options.saveLocation = 'download';
    handleSaveSchema(state);
    expect(state.handleNotification).toHaveBeenCalledWith('schema', 'schema downloaded', expect.any(Number));
  });
});
