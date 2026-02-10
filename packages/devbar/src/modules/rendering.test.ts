/**
 * Rendering module tests
 *
 * Tests for the main render dispatch and key rendering functions.
 * Verifies DOM structure, classes, and key behaviors.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from './rendering.js';
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
    ...overrides,
  } as any;
}

/** Create a mock ConsoleCapture for testing */
function createMockConsoleCapture() {
  return {
    getLogs: vi.fn(() => []),
    clear: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as any;
}

describe('render (main dispatch)', () => {
  afterEach(() => {
    // Clean up any DOM elements appended during tests
    document.querySelectorAll('[data-devbar]').forEach((el) => el.remove());
  });

  it('does nothing when destroyed', () => {
    const state = createMockState({ destroyed: true });
    render(state, createMockConsoleCapture(), []);

    expect(state.container).toBeNull();
    expect(document.querySelector('[data-devbar]')).toBeNull();
  });

  it('removes existing container before creating a new one', () => {
    const state = createMockState();
    const existingContainer = document.createElement('div');
    existingContainer.setAttribute('data-devbar', 'true');
    document.body.appendChild(existingContainer);
    state.container = existingContainer as HTMLDivElement;

    render(state, createMockConsoleCapture(), []);

    // Old container should have been removed, new one created
    expect(document.querySelectorAll('[data-devbar]').length).toBeGreaterThanOrEqual(1);
    expect(state.container).not.toBe(existingContainer);
  });

  it('removes existing overlay before rendering', () => {
    const state = createMockState();
    const existingOverlay = document.createElement('div');
    document.body.appendChild(existingOverlay);
    state.overlayElement = existingOverlay as HTMLDivElement;

    render(state, createMockConsoleCapture(), []);

    expect(existingOverlay.parentElement).toBeNull();
  });

  it('creates container with data-devbar attribute', () => {
    const state = createMockState();
    render(state, createMockConsoleCapture(), []);

    expect(state.container).not.toBeNull();
    expect(state.container!.getAttribute('data-devbar')).toBe('true');
  });

  it('appends container to document.body', () => {
    const state = createMockState();
    render(state, createMockConsoleCapture(), []);

    expect(state.container!.parentElement).toBe(document.body);
  });
});

describe('render collapsed state', () => {
  afterEach(() => {
    document.querySelectorAll('[data-devbar]').forEach((el) => el.remove());
  });

  it('renders collapsed circle when collapsed is true', () => {
    const state = createMockState({ collapsed: true });
    render(state, createMockConsoleCapture(), []);

    const container = state.container!;
    expect(container.className).toBe('devbar-collapse');
    expect(container.style.position).toBe('fixed');
    expect(container.style.borderRadius).toBe('50%');
    expect(container.style.width).toBe('26px');
    expect(container.style.height).toBe('26px');
    expect(container.style.cursor).toBe('pointer');
  });

  it('uses default bottom-left position when no dot position captured', () => {
    const state = createMockState({ collapsed: true });
    render(state, createMockConsoleCapture(), []);

    const container = state.container!;
    expect(container.style.bottom).toBe('27px');
    expect(container.style.left).toBe('86px');
  });

  it('uses accent color for border', () => {
    const state = createMockState({ collapsed: true });
    state.options.accentColor = '#ff0000';
    render(state, createMockConsoleCapture(), []);

    const container = state.container!;
    expect(container.style.border).toContain('#ff0000');
  });

  it('contains a connection indicator dot', () => {
    const state = createMockState({ collapsed: true });
    render(state, createMockConsoleCapture(), []);

    const container = state.container!;
    const spans = container.querySelectorAll('span');
    // Should have inner container, dot, and chevron
    expect(spans.length).toBeGreaterThanOrEqual(2);
  });

  it('shows error badge when errorCount > 0', () => {
    const state = createMockState({
      collapsed: true,
    });
    state.getLogCounts = vi.fn(() => ({ errorCount: 3, warningCount: 0, infoCount: 0 }));
    render(state, createMockConsoleCapture(), []);

    expect(state.createCollapsedBadge).toHaveBeenCalledWith(
      3,
      'rgba(239, 68, 68, 0.95)',
      '-6px',
    );
  });

  it('shifts error badge position when warning badge also exists', () => {
    const state = createMockState({ collapsed: true });
    state.getLogCounts = vi.fn(() => ({ errorCount: 2, warningCount: 1, infoCount: 0 }));
    render(state, createMockConsoleCapture(), []);

    // Error badge should be shifted left (12px instead of -6px)
    expect(state.createCollapsedBadge).toHaveBeenCalledWith(
      2,
      'rgba(239, 68, 68, 0.95)',
      '12px',
    );
    // Warning badge at standard position
    expect(state.createCollapsedBadge).toHaveBeenCalledWith(
      1,
      'rgba(245, 158, 11, 0.95)',
      '-6px',
    );
  });

  it('expands on click', () => {
    const state = createMockState({ collapsed: true });
    render(state, createMockConsoleCapture(), []);

    state.container!.onclick!(new PointerEvent('click'));

    expect(state.collapsed).toBe(false);
    expect(state.render).toHaveBeenCalled();
  });
});

describe('render compact state', () => {
  afterEach(() => {
    document.querySelectorAll('[data-devbar]').forEach((el) => el.remove());
  });

  it('renders compact pill when compactMode is true', () => {
    const state = createMockState({ compactMode: true });
    render(state, createMockConsoleCapture(), []);

    const container = state.container!;
    expect(container.style.position).toBe('fixed');
    expect(container.style.borderRadius).toBe('20px');
    expect(container.style.display).toBe('flex');
    expect(container.style.alignItems).toBe('center');
  });

  it('contains a connection indicator with devbar-clickable class', () => {
    const state = createMockState({ compactMode: true });
    render(state, createMockConsoleCapture(), []);

    const connIndicator = state.container!.querySelector('.devbar-clickable');
    expect(connIndicator).not.toBeNull();
  });

  it('contains connection dot with correct color when connected', () => {
    const state = createMockState({ compactMode: true, sweetlinkConnected: true });
    render(state, createMockConsoleCapture(), []);

    const connDot = state.container!.querySelector('.devbar-conn-dot') as HTMLElement;
    expect(connDot).not.toBeNull();
    expect(connDot.style.backgroundColor).toBe('var(--devbar-color-primary)');
  });

  it('contains connection dot with muted color when disconnected', () => {
    const state = createMockState({ compactMode: true, sweetlinkConnected: false });
    render(state, createMockConsoleCapture(), []);

    const connDot = state.container!.querySelector('.devbar-conn-dot') as HTMLElement;
    expect(connDot).not.toBeNull();
    expect(connDot.style.backgroundColor).toBe('var(--devbar-color-text-muted)');
  });

  it('includes screenshot button when showScreenshot is true', () => {
    const state = createMockState({ compactMode: true });
    state.options.showScreenshot = true;
    render(state, createMockConsoleCapture(), []);

    const buttons = state.container!.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('includes expand button', () => {
    const state = createMockState({ compactMode: true });
    render(state, createMockConsoleCapture(), []);

    const buttons = state.container!.querySelectorAll('button');
    // Find the expand button (last button, contains double-arrow)
    const lastBtn = buttons[buttons.length - 1];
    expect(lastBtn).toBeTruthy();
  });

  it('renders error badges when errorCount > 0', () => {
    const state = createMockState({ compactMode: true });
    state.getLogCounts = vi.fn(() => ({ errorCount: 5, warningCount: 0, infoCount: 0 }));
    render(state, createMockConsoleCapture(), []);

    // Error badges are spans with devbar-badge class
    const badges = state.container!.querySelectorAll('.devbar-badge');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});

describe('render expanded state', () => {
  afterEach(() => {
    document.querySelectorAll('[data-devbar]').forEach((el) => el.remove());
  });

  it('renders expanded bar by default (not collapsed, not compact)', () => {
    const state = createMockState();
    render(state, createMockConsoleCapture(), []);

    const container = state.container!;
    expect(container.style.position).toBe('fixed');
    expect(container.style.borderRadius).toBe('12px');
    expect(container.style.zIndex).toBe('9999');
  });

  it('contains a main row with devbar-main class', () => {
    const state = createMockState();
    render(state, createMockConsoleCapture(), []);

    const mainRow = state.container!.querySelector('.devbar-main');
    expect(mainRow).not.toBeNull();
    expect((mainRow as HTMLElement).style.display).toBe('flex');
  });

  it('contains a status row with connection indicator', () => {
    const state = createMockState();
    render(state, createMockConsoleCapture(), []);

    const statusRow = state.container!.querySelector('.devbar-status');
    expect(statusRow).not.toBeNull();
    const connDot = statusRow!.querySelector('.devbar-conn-dot');
    expect(connDot).not.toBeNull();
  });

  it('contains an actions container with devbar-actions class', () => {
    const state = createMockState();
    render(state, createMockConsoleCapture(), []);

    const actions = state.container!.querySelector('.devbar-actions');
    expect(actions).not.toBeNull();
    // display:flex is set via CSS class, not inline style
    expect(actions!.className).toBe('devbar-actions');
  });

  it('renders action buttons in the actions container', () => {
    const state = createMockState();
    render(state, createMockConsoleCapture(), []);

    const actions = state.container!.querySelector('.devbar-actions');
    const buttons = actions!.querySelectorAll('button');
    // Should have: screenshot, AI review, outline, schema, settings, compact toggle
    expect(buttons.length).toBeGreaterThanOrEqual(5);
  });

  it('renders info section with devbar-info class', () => {
    const state = createMockState();
    render(state, createMockConsoleCapture(), []);

    const infoSection = state.container!.querySelector('.devbar-info');
    expect(infoSection).not.toBeNull();
  });

  it('renders breakpoint info when available', () => {
    const state = createMockState({
      breakpointInfo: { tailwindBreakpoint: 'md', dimensions: '768x1024' },
    });
    render(state, createMockConsoleCapture(), []);

    const infoSection = state.container!.querySelector('.devbar-info') as HTMLElement;
    expect(infoSection.textContent).toContain('md');
  });

  it('renders console badges when counts > 0 and showConsoleBadges is true', () => {
    const state = createMockState();
    state.getLogCounts = vi.fn(() => ({ errorCount: 2, warningCount: 1, infoCount: 3 }));
    state.options.showConsoleBadges = true;
    render(state, createMockConsoleCapture(), []);

    const badges = state.container!.querySelectorAll('.devbar-badge');
    expect(badges.length).toBe(3);
  });

  it('does not render console badges when showConsoleBadges is false', () => {
    const state = createMockState();
    state.getLogCounts = vi.fn(() => ({ errorCount: 2, warningCount: 1, infoCount: 3 }));
    state.options.showConsoleBadges = false;
    render(state, createMockConsoleCapture(), []);

    const badges = state.container!.querySelectorAll('.devbar-badge');
    expect(badges.length).toBe(0);
  });

  it('renders custom controls row when custom controls provided', () => {
    const state = createMockState();
    const controls = [
      { id: 'test', label: 'Test Button', onClick: vi.fn() },
    ];
    render(state, createMockConsoleCapture(), controls);

    const buttons = state.container!.querySelectorAll('button');
    const testBtn = Array.from(buttons).find((btn) => btn.textContent === 'Test Button');
    expect(testBtn).toBeTruthy();
  });

  it('applies correct position styles for bottom-right', () => {
    const state = createMockState();
    state.options.position = 'bottom-right';
    render(state, createMockConsoleCapture(), []);

    const container = state.container!;
    expect(container.style.bottom).toBe('20px');
    expect(container.style.right).toBe('16px');
  });

  it('applies correct position styles for bottom-center', () => {
    const state = createMockState();
    state.options.position = 'bottom-center';
    render(state, createMockConsoleCapture(), []);

    const container = state.container!;
    expect(container.style.bottom).toBe('12px');
    expect(container.style.left).toBe('50%');
    expect(container.style.transform).toBe('translateX(-50%)');
  });

  it('collapses on double-click', () => {
    const state = createMockState();
    render(state, createMockConsoleCapture(), []);

    state.container!.ondblclick!(new MouseEvent('dblclick'));

    expect(state.collapsed).toBe(true);
    expect(state.render).toHaveBeenCalled();
  });
});

describe('render overlays', () => {
  afterEach(() => {
    document.querySelectorAll('[data-devbar]').forEach((el) => el.remove());
    document.querySelectorAll('[data-devbar-overlay]').forEach((el) => el.remove());
  });

  it('renders settings popover when showSettingsPopover is true', () => {
    const state = createMockState({ showSettingsPopover: true });
    render(state, createMockConsoleCapture(), []);

    const popover = document.querySelector('[data-devbar-overlay]');
    expect(popover).not.toBeNull();
    expect(state.overlayElement).not.toBeNull();
  });

  it('does not render overlay when no overlay flags are set', () => {
    const state = createMockState();
    render(state, createMockConsoleCapture(), []);

    expect(state.overlayElement).toBeNull();
  });

  it('ensures only one overlay at a time (console filter takes priority)', () => {
    const state = createMockState({
      consoleFilter: 'error',
      showSettingsPopover: true,
      showOutlineModal: true,
    });
    render(state, createMockConsoleCapture(), []);

    // Console filter should win, other flags should be cleared
    expect(state.showOutlineModal).toBe(false);
    expect(state.showSettingsPopover).toBe(false);
  });
});
