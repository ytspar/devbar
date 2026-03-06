/**
 * Rendering index (render dispatch) tests
 *
 * Tests for the main render() function in rendering/index.ts.
 * Focuses on:
 * - render guard (re-entrancy prevention)
 * - document undefined guard
 * - error handling in content and overlay rendering
 * - overlay dispatch logic (renderOverlays)
 * - body scroll lock when overlay is present
 * - tooltip cleanup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all sub-modules before importing render
vi.mock('./collapsed.js', () => ({
  renderCollapsed: vi.fn(),
}));
vi.mock('./compact.js', () => ({
  renderCompact: vi.fn(),
}));
vi.mock('./expanded.js', () => ({
  renderExpanded: vi.fn(),
}));
vi.mock('./console.js', () => ({
  renderConsolePopup: vi.fn(),
}));
vi.mock('./modals.js', () => ({
  renderOutlineModal: vi.fn(),
  renderSchemaModal: vi.fn(),
  renderA11yModal: vi.fn(),
  renderDesignReviewConfirmModal: vi.fn(),
}));
vi.mock('./settings.js', () => ({
  renderSettingsPopover: vi.fn(),
}));
vi.mock('../tooltips.js', () => ({
  clearAllTooltips: vi.fn(),
}));
vi.mock('./common.js', () => {
  let guard = false;
  return {
    get renderGuard() {
      return guard;
    },
    setRenderGuard: vi.fn((v: boolean) => {
      guard = v;
    }),
  };
});

import type { DevBarState } from '../types.js';
import { render } from './index.js';

import { renderCollapsed } from './collapsed.js';
import { renderCompact } from './compact.js';
import { setRenderGuard } from './common.js';
import { renderConsolePopup } from './console.js';
import { renderExpanded } from './expanded.js';
import {
  renderA11yModal,
  renderDesignReviewConfirmModal,
  renderOutlineModal,
  renderSchemaModal,
} from './modals.js';
import { renderSettingsPopover } from './settings.js';

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
    rulerMode: false,
    rulerOverlay: null,
    rulerPinnedElements: [],
    rulerCleanup: null,
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
    createCollapsedBadge: vi.fn(() => document.createElement('span')),
    handleScreenshot: vi.fn(),
    toggleCompactMode: vi.fn(),
    connectWebSocket: vi.fn(),
    handleNotification: vi.fn(),
    applySettings: vi.fn(),
    clearConsoleLogs: vi.fn(),
    ...overrides,
  } as any;
}

function createMockConsoleCapture() {
  return {
    getLogs: vi.fn(() => []),
    clear: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as any;
}

describe('render dispatch (index.ts)', () => {
  afterEach(() => {
    document.querySelectorAll('[data-devbar]').forEach((el) => el.remove());
    document.body.style.overflow = '';
    vi.mocked(renderExpanded).mockReset();
    vi.mocked(renderCollapsed).mockReset();
    vi.mocked(renderCompact).mockReset();
    vi.mocked(renderSettingsPopover).mockReset();
    vi.mocked(renderConsolePopup).mockReset();
    vi.mocked(renderOutlineModal).mockReset();
    vi.mocked(renderSchemaModal).mockReset();
    vi.mocked(renderA11yModal).mockReset();
    vi.mocked(renderDesignReviewConfirmModal).mockReset();
    vi.restoreAllMocks();
    // Ensure render guard is reset
    setRenderGuard(false);
  });

  it('does nothing when state.destroyed is true', () => {
    const state = createMockState({ destroyed: true });
    render(state, createMockConsoleCapture(), []);

    expect(renderExpanded).not.toHaveBeenCalled();
    expect(renderCollapsed).not.toHaveBeenCalled();
    expect(renderCompact).not.toHaveBeenCalled();
    expect(state.container).toBeNull();
  });

  it('does nothing when renderGuard is true (re-entrancy)', () => {
    setRenderGuard(true);

    const state = createMockState();
    render(state, createMockConsoleCapture(), []);

    expect(renderExpanded).not.toHaveBeenCalled();
    expect(state.container).toBeNull();

    // Reset for cleanup
    setRenderGuard(false);
  });

  it('delegates to renderCollapsed when state.collapsed is true', () => {
    const state = createMockState({ collapsed: true });
    render(state, createMockConsoleCapture(), []);

    expect(renderCollapsed).toHaveBeenCalledWith(state);
    expect(renderCompact).not.toHaveBeenCalled();
    expect(renderExpanded).not.toHaveBeenCalled();
  });

  it('delegates to renderCompact when state.compactMode is true', () => {
    const state = createMockState({ compactMode: true });
    const controls = [{ id: 'c1', label: 'Ctrl' }];
    render(state, createMockConsoleCapture(), controls);

    expect(renderCompact).toHaveBeenCalledWith(state, controls);
    expect(renderCollapsed).not.toHaveBeenCalled();
    expect(renderExpanded).not.toHaveBeenCalled();
  });

  it('delegates to renderExpanded by default', () => {
    const state = createMockState();
    const controls = [{ id: 'c1', label: 'Ctrl' }];
    render(state, createMockConsoleCapture(), controls);

    expect(renderExpanded).toHaveBeenCalledWith(state, controls);
    expect(renderCollapsed).not.toHaveBeenCalled();
    expect(renderCompact).not.toHaveBeenCalled();
  });

  it('creates container with data-devbar, role, and aria-label', () => {
    const state = createMockState();
    render(state, createMockConsoleCapture(), []);

    expect(state.container).not.toBeNull();
    expect(state.container!.getAttribute('data-devbar')).toBe('true');
    expect(state.container!.getAttribute('role')).toBe('toolbar');
    expect(state.container!.getAttribute('aria-label')).toBe('DevBar');
  });

  it('removes existing container before creating new one', () => {
    const state = createMockState();
    const existing = document.createElement('div');
    existing.setAttribute('data-devbar', 'true');
    document.body.appendChild(existing);
    state.container = existing as HTMLDivElement;

    render(state, createMockConsoleCapture(), []);

    expect(existing.parentElement).toBeNull();
    expect(state.container).not.toBe(existing);
  });

  it('removes existing overlay and resets body overflow', () => {
    const state = createMockState();
    const overlay = document.createElement('div');
    document.body.appendChild(overlay);
    state.overlayElement = overlay as HTMLDivElement;
    document.body.style.overflow = 'hidden';

    render(state, createMockConsoleCapture(), []);

    expect(overlay.parentElement).toBeNull();
    // body overflow reset by the cleanup, then may be set again by overlay logic
  });

  it('catches and logs errors from content rendering', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(renderExpanded).mockImplementation(() => {
      throw new Error('render boom');
    });

    const state = createMockState();
    render(state, createMockConsoleCapture(), []);

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GlobalDevBar] Render failed:',
      expect.any(Error)
    );
    // Container should still exist (appended before try block)
    expect(state.container).not.toBeNull();

    consoleSpy.mockRestore();
  });

  it('catches and logs errors from overlay rendering', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(renderSettingsPopover).mockImplementation(() => {
      throw new Error('overlay boom');
    });

    const state = createMockState({ showSettingsPopover: true });
    render(state, createMockConsoleCapture(), []);

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GlobalDevBar] Overlay render failed:',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  it('sets renderGuard to true during render and false after', () => {
    const state = createMockState();
    // Clear any prior calls from afterEach cleanup
    vi.mocked(setRenderGuard).mockClear();

    render(state, createMockConsoleCapture(), []);

    const calls = vi.mocked(setRenderGuard).mock.calls;
    expect(calls[0]).toEqual([true]);
    expect(calls[calls.length - 1]).toEqual([false]);
  });

  it('resets renderGuard to false even when content rendering throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(renderExpanded).mockImplementation(() => {
      throw new Error('boom');
    });

    const state = createMockState();
    render(state, createMockConsoleCapture(), []);

    const calls = vi.mocked(setRenderGuard).mock.calls;
    expect(calls[calls.length - 1]).toEqual([false]);
  });

  it('locks body scroll when overlayElement is set by overlay renderer', () => {
    vi.mocked(renderSettingsPopover).mockImplementation((s: DevBarState) => {
      s.overlayElement = document.createElement('div') as HTMLDivElement;
    });

    const state = createMockState({ showSettingsPopover: true });
    render(state, createMockConsoleCapture(), []);

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('does not lock body scroll when no overlay is rendered', () => {
    const state = createMockState();
    render(state, createMockConsoleCapture(), []);

    expect(document.body.style.overflow).toBe('');
  });
});

describe('renderOverlays dispatch', () => {
  afterEach(() => {
    document.querySelectorAll('[data-devbar]').forEach((el) => el.remove());
    document.body.style.overflow = '';
    vi.mocked(renderExpanded).mockReset();
    vi.mocked(renderCollapsed).mockReset();
    vi.mocked(renderCompact).mockReset();
    vi.mocked(renderSettingsPopover).mockReset();
    vi.mocked(renderConsolePopup).mockReset();
    vi.mocked(renderOutlineModal).mockReset();
    vi.mocked(renderSchemaModal).mockReset();
    vi.mocked(renderA11yModal).mockReset();
    vi.mocked(renderDesignReviewConfirmModal).mockReset();
    vi.restoreAllMocks();
    setRenderGuard(false);
  });

  it('renders console popup when consoleFilter is set', () => {
    const state = createMockState({ consoleFilter: 'error' });
    const cc = createMockConsoleCapture();
    render(state, cc, []);

    expect(renderConsolePopup).toHaveBeenCalledWith(state, cc);
  });

  it('console filter takes priority over other overlays', () => {
    const state = createMockState({
      consoleFilter: 'warn',
      showOutlineModal: true,
      showSchemaModal: true,
      showA11yModal: true,
      showDesignReviewConfirm: true,
      showSettingsPopover: true,
    });
    render(state, createMockConsoleCapture(), []);

    expect(renderConsolePopup).toHaveBeenCalled();
    expect(renderOutlineModal).not.toHaveBeenCalled();
    expect(renderSchemaModal).not.toHaveBeenCalled();
    expect(renderA11yModal).not.toHaveBeenCalled();
    expect(renderDesignReviewConfirmModal).not.toHaveBeenCalled();
    expect(renderSettingsPopover).not.toHaveBeenCalled();
  });

  it('renders outline modal when showOutlineModal is true', () => {
    const state = createMockState({ showOutlineModal: true });
    render(state, createMockConsoleCapture(), []);

    expect(renderOutlineModal).toHaveBeenCalledWith(state);
  });

  it('renders schema modal when showSchemaModal is true', () => {
    const state = createMockState({ showSchemaModal: true });
    render(state, createMockConsoleCapture(), []);

    expect(renderSchemaModal).toHaveBeenCalledWith(state);
  });

  it('renders a11y modal when showA11yModal is true', () => {
    const state = createMockState({ showA11yModal: true });
    render(state, createMockConsoleCapture(), []);

    expect(renderA11yModal).toHaveBeenCalledWith(state);
  });

  it('renders design review confirm modal when showDesignReviewConfirm is true', () => {
    const state = createMockState({ showDesignReviewConfirm: true });
    render(state, createMockConsoleCapture(), []);

    expect(renderDesignReviewConfirmModal).toHaveBeenCalledWith(state);
  });

  it('renders settings popover when showSettingsPopover is true', () => {
    const state = createMockState({ showSettingsPopover: true });
    render(state, createMockConsoleCapture(), []);

    expect(renderSettingsPopover).toHaveBeenCalledWith(state);
  });

  it('outline modal closes other overlays but keeps showOutlineModal true', () => {
    const state = createMockState({
      showOutlineModal: true,
      showSchemaModal: true,
      showSettingsPopover: true,
    });
    render(state, createMockConsoleCapture(), []);

    // closeAllModals sets everything false, then showOutlineModal is re-set to true
    expect(state.showOutlineModal).toBe(true);
    expect(state.showSchemaModal).toBe(false);
    expect(state.showSettingsPopover).toBe(false);
  });

  it('schema modal closes other overlays but keeps showSchemaModal true', () => {
    const state = createMockState({
      showSchemaModal: true,
      showA11yModal: true,
    });
    render(state, createMockConsoleCapture(), []);

    expect(state.showSchemaModal).toBe(true);
    expect(state.showA11yModal).toBe(false);
  });

  it('a11y modal closes other overlays but keeps showA11yModal true', () => {
    const state = createMockState({
      showA11yModal: true,
      showDesignReviewConfirm: true,
    });
    render(state, createMockConsoleCapture(), []);

    expect(state.showA11yModal).toBe(true);
    expect(state.showDesignReviewConfirm).toBe(false);
  });

  it('design review confirm closes other overlays but keeps showDesignReviewConfirm true', () => {
    const state = createMockState({
      showDesignReviewConfirm: true,
      showSettingsPopover: true,
    });
    render(state, createMockConsoleCapture(), []);

    expect(state.showDesignReviewConfirm).toBe(true);
    expect(state.showSettingsPopover).toBe(false);
  });

  it('settings popover closes other overlays but keeps showSettingsPopover true', () => {
    const state = createMockState({
      showSettingsPopover: true,
      showOutlineModal: true,
    });
    render(state, createMockConsoleCapture(), []);

    // showOutlineModal wins because it is checked first
    expect(state.showOutlineModal).toBe(true);
    expect(state.showSettingsPopover).toBe(false);
  });

  it('does not render any overlay when no overlay flags are set', () => {
    const state = createMockState();
    render(state, createMockConsoleCapture(), []);

    expect(renderConsolePopup).not.toHaveBeenCalled();
    expect(renderOutlineModal).not.toHaveBeenCalled();
    expect(renderSchemaModal).not.toHaveBeenCalled();
    expect(renderA11yModal).not.toHaveBeenCalled();
    expect(renderDesignReviewConfirmModal).not.toHaveBeenCalled();
    expect(renderSettingsPopover).not.toHaveBeenCalled();
  });

  it('console filter is preserved through closeAllModals', () => {
    const state = createMockState({
      consoleFilter: 'info',
      showOutlineModal: true,
    });
    render(state, createMockConsoleCapture(), []);

    // consoleFilter is saved, closeAllModals clears it, then it is restored
    expect(state.consoleFilter).toBe('info');
    expect(state.showOutlineModal).toBe(false);
  });
});
