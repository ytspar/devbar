/**
 * H2: Compact state rendering tests
 *
 * Tests the renderCompact function which creates the compact bar
 * with tool buttons, connection indicator, console badges, and
 * expand/collapse behavior.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevBarState } from '../types.js';

// Mock dependencies
vi.mock('../../constants.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../constants.js')>();
  return {
    ...actual,
  };
});

vi.mock('../tooltips.js', () => ({
  attachButtonTooltip: vi.fn(),
  attachTextTooltip: vi.fn(),
}));

vi.mock('./buttons.js', () => ({
  createConsoleBadge: vi.fn((state: any, type: string, count: number, color: string) => {
    const span = document.createElement('span');
    span.className = 'devbar-badge';
    span.dataset.type = type;
    span.textContent = String(count);
    return span;
  }),
  createScreenshotButton: vi.fn(() => {
    const btn = document.createElement('button');
    btn.className = 'devbar-screenshot-btn';
    btn.setAttribute('aria-label', 'Screenshot');
    return btn;
  }),
  createSettingsButton: vi.fn(() => {
    const btn = document.createElement('button');
    btn.className = 'devbar-settings-btn';
    btn.setAttribute('aria-label', 'Settings');
    return btn;
  }),
}));

vi.mock('./common.js', () => ({
  captureDotPosition: vi.fn(),
  createConnectionIndicator: vi.fn((state: any) => {
    const indicator = document.createElement('span');
    indicator.className = 'devbar-clickable';
    const dot = document.createElement('span');
    dot.className = 'devbar-conn-dot';
    indicator.appendChild(dot);
    return indicator;
  }),
}));

import { renderCompact } from './compact.js';
import { attachTextTooltip } from '../tooltips.js';
import { createConsoleBadge, createScreenshotButton, createSettingsButton } from './buttons.js';
import { captureDotPosition, createConnectionIndicator } from './common.js';

function createMockState(overrides: Partial<DevBarState> = {}): DevBarState {
  return {
    options: {
      showTooltips: true,
      saveLocation: 'auto',
      showScreenshot: true,
      showConsoleBadges: true,
      position: 'bottom-left',
      wsPort: 9223,
      accentColor: '#10b981',
      showMetrics: { breakpoint: true, fcp: true, lcp: true, cls: true, inp: true, pageSize: true },
    },
    debug: { state: vi.fn(), perf: vi.fn(), ws: vi.fn(), render: vi.fn(), event: vi.fn() },
    activeTooltips: new Set(),
    settingsManager: { get: vi.fn(), getSettings: vi.fn() } as any,
    render: vi.fn(),
    sweetlinkConnected: false,
    collapsed: false,
    compactMode: true,
    container: document.createElement('div'),
    consoleFilter: null,
    getLogCounts: vi.fn(() => ({ errorCount: 0, warningCount: 0, infoCount: 0 })),
    resetPositionStyles: vi.fn(),
    toggleCompactMode: vi.fn(),
    ...overrides,
  } as any;
}

afterEach(() => {
  document.body.textContent = '';
  vi.clearAllMocks();
});

describe('renderCompact', () => {
  it('returns early when container is null', () => {
    const state = createMockState({ container: null });
    renderCompact(state);
    expect(state.resetPositionStyles).not.toHaveBeenCalled();
  });

  it('calls resetPositionStyles on the wrapper', () => {
    const state = createMockState();
    renderCompact(state);
    expect(state.resetPositionStyles).toHaveBeenCalledWith(state.container);
  });

  it('applies fixed positioning to the wrapper', () => {
    const state = createMockState();
    renderCompact(state);
    expect(state.container!.style.position).toBe('fixed');
  });

  it('sets z-index to 9999', () => {
    const state = createMockState();
    renderCompact(state);
    expect(state.container!.style.zIndex).toBe('9999');
  });

  it('applies rounded pill border radius', () => {
    const state = createMockState();
    renderCompact(state);
    expect(state.container!.style.borderRadius).toBe('20px');
  });

  it('uses accent color for border and text', () => {
    const state = createMockState();
    renderCompact(state);
    expect(state.container!.style.border).toContain('#10b981');
    expect(state.container!.style.color).toBe('#10b981');
  });

  it('uses flex layout with 8px gap', () => {
    const state = createMockState();
    renderCompact(state);
    expect(state.container!.style.display).toBe('flex');
    expect(state.container!.style.alignItems).toBe('center');
    expect(state.container!.style.gap).toBe('8px');
  });

  it('applies padding of 6px 10px', () => {
    const state = createMockState();
    renderCompact(state);
    expect(state.container!.style.padding).toBe('6px 10px');
  });

  // ---- Position styling ----

  it('uses bottom-left position by default', () => {
    const state = createMockState();
    renderCompact(state);
    expect(state.container!.style.bottom).toBe('20px');
    expect(state.container!.style.left).toBe('80px');
  });

  it('uses bottom-right position', () => {
    const state = createMockState({
      options: {
        position: 'bottom-right',
        accentColor: '#10b981',
        showTooltips: true,
        saveLocation: 'auto',
        showScreenshot: true,
        showConsoleBadges: true,
        wsPort: 9223,
        showMetrics: { breakpoint: true, fcp: true, lcp: true, cls: true, inp: true, pageSize: true },
      },
    });
    renderCompact(state);
    expect(state.container!.style.bottom).toBe('20px');
    expect(state.container!.style.right).toBe('16px');
  });

  it('uses top-left position', () => {
    const state = createMockState({
      options: {
        position: 'top-left',
        accentColor: '#10b981',
        showTooltips: true,
        saveLocation: 'auto',
        showScreenshot: true,
        showConsoleBadges: true,
        wsPort: 9223,
        showMetrics: { breakpoint: true, fcp: true, lcp: true, cls: true, inp: true, pageSize: true },
      },
    });
    renderCompact(state);
    expect(state.container!.style.top).toBe('20px');
    expect(state.container!.style.left).toBe('80px');
  });

  it('uses top-right position', () => {
    const state = createMockState({
      options: {
        position: 'top-right',
        accentColor: '#10b981',
        showTooltips: true,
        saveLocation: 'auto',
        showScreenshot: true,
        showConsoleBadges: true,
        wsPort: 9223,
        showMetrics: { breakpoint: true, fcp: true, lcp: true, cls: true, inp: true, pageSize: true },
      },
    });
    renderCompact(state);
    expect(state.container!.style.top).toBe('20px');
    expect(state.container!.style.right).toBe('16px');
  });

  it('uses bottom-center position with transform', () => {
    const state = createMockState({
      options: {
        position: 'bottom-center',
        accentColor: '#10b981',
        showTooltips: true,
        saveLocation: 'auto',
        showScreenshot: true,
        showConsoleBadges: true,
        wsPort: 9223,
        showMetrics: { breakpoint: true, fcp: true, lcp: true, cls: true, inp: true, pageSize: true },
      },
    });
    renderCompact(state);
    expect(state.container!.style.bottom).toBe('12px');
    expect(state.container!.style.left).toBe('50%');
  });

  it('falls back to bottom-left for unknown position', () => {
    const state = createMockState({
      options: {
        position: 'invalid' as any,
        accentColor: '#10b981',
        showTooltips: true,
        saveLocation: 'auto',
        showScreenshot: true,
        showConsoleBadges: true,
        wsPort: 9223,
        showMetrics: { breakpoint: true, fcp: true, lcp: true, cls: true, inp: true, pageSize: true },
      },
    });
    renderCompact(state);
    expect(state.container!.style.bottom).toBe('20px');
    expect(state.container!.style.left).toBe('80px');
  });

  // ---- Connection indicator ----

  it('creates a connection indicator', () => {
    const state = createMockState();
    renderCompact(state);
    expect(createConnectionIndicator).toHaveBeenCalledWith(state);
  });

  it('appends connection indicator as first child', () => {
    const state = createMockState();
    renderCompact(state);
    const firstChild = state.container!.children[0] as HTMLElement;
    expect(firstChild.className).toBe('devbar-clickable');
  });

  it('attaches tooltip to connection indicator', () => {
    const state = createMockState();
    renderCompact(state);
    expect(attachTextTooltip).toHaveBeenCalled();

    const tooltipCall = vi.mocked(attachTextTooltip).mock.calls[0];
    const tooltipFn = tooltipCall[2] as () => string;
    expect(tooltipFn()).toBe('Sweetlink disconnected');
  });

  it('tooltip shows "connected" when sweetlink is connected', () => {
    const state = createMockState({ sweetlinkConnected: true });
    renderCompact(state);

    const tooltipCall = vi.mocked(attachTextTooltip).mock.calls[0];
    const tooltipFn = tooltipCall[2] as () => string;
    expect(tooltipFn()).toBe('Sweetlink connected');
  });

  it('collapses devbar when connection indicator is clicked', () => {
    const state = createMockState();
    renderCompact(state);

    const connIndicator = state.container!.children[0] as HTMLElement;
    connIndicator.onclick!(new MouseEvent('click'));

    expect(state.collapsed).toBe(true);
    expect(state.render).toHaveBeenCalled();
    expect(captureDotPosition).toHaveBeenCalled();
  });

  it('logs debug message when collapsing from compact mode', () => {
    const state = createMockState();
    renderCompact(state);

    const connIndicator = state.container!.children[0] as HTMLElement;
    connIndicator.onclick!(new MouseEvent('click'));

    expect(state.debug.state).toHaveBeenCalledWith('Collapsed DevBar from compact mode');
  });

  // ---- Console badges ----

  it('does not create error badge when errorCount is 0', () => {
    const state = createMockState({
      getLogCounts: vi.fn(() => ({ errorCount: 0, warningCount: 0, infoCount: 0 })),
    } as any);
    renderCompact(state);

    const badgeCalls = vi.mocked(createConsoleBadge).mock.calls;
    const errorCalls = badgeCalls.filter((c) => c[1] === 'error');
    expect(errorCalls.length).toBe(0);
  });

  it('creates error badge when errors exist', () => {
    const state = createMockState({
      getLogCounts: vi.fn(() => ({ errorCount: 5, warningCount: 0, infoCount: 0 })),
    } as any);
    renderCompact(state);
    expect(createConsoleBadge).toHaveBeenCalledWith(state, 'error', 5, expect.any(String));
  });

  it('creates warning badge when warnings exist', () => {
    const state = createMockState({
      getLogCounts: vi.fn(() => ({ errorCount: 0, warningCount: 3, infoCount: 0 })),
    } as any);
    renderCompact(state);
    expect(createConsoleBadge).toHaveBeenCalledWith(state, 'warn', 3, expect.any(String));
  });

  it('creates info badge when info logs exist', () => {
    const state = createMockState({
      getLogCounts: vi.fn(() => ({ errorCount: 0, warningCount: 0, infoCount: 8 })),
    } as any);
    renderCompact(state);
    expect(createConsoleBadge).toHaveBeenCalledWith(state, 'info', 8, expect.any(String));
  });

  it('creates all three badges when all log types have counts', () => {
    const state = createMockState({
      getLogCounts: vi.fn(() => ({ errorCount: 2, warningCount: 4, infoCount: 1 })),
    } as any);
    renderCompact(state);
    expect(createConsoleBadge).toHaveBeenCalledTimes(3);
  });

  it('creates no badges when all counts are 0', () => {
    const state = createMockState({
      getLogCounts: vi.fn(() => ({ errorCount: 0, warningCount: 0, infoCount: 0 })),
    } as any);
    renderCompact(state);
    expect(createConsoleBadge).not.toHaveBeenCalled();
  });

  // ---- Screenshot button ----

  it('creates screenshot button when showScreenshot is true', () => {
    const state = createMockState();
    renderCompact(state);
    expect(createScreenshotButton).toHaveBeenCalledWith(state, '#10b981');
  });

  it('does not create screenshot button when showScreenshot is false', () => {
    const state = createMockState({
      options: {
        position: 'bottom-left',
        accentColor: '#10b981',
        showTooltips: true,
        saveLocation: 'auto',
        showScreenshot: false,
        showConsoleBadges: true,
        wsPort: 9223,
        showMetrics: { breakpoint: true, fcp: true, lcp: true, cls: true, inp: true, pageSize: true },
      },
    });
    renderCompact(state);
    expect(createScreenshotButton).not.toHaveBeenCalled();
  });

  // ---- Settings button ----

  it('creates settings button', () => {
    const state = createMockState();
    renderCompact(state);
    expect(createSettingsButton).toHaveBeenCalledWith(state);
  });

  it('appends settings button to wrapper', () => {
    const state = createMockState();
    renderCompact(state);

    const settingsBtn = state.container!.querySelector('.devbar-settings-btn');
    expect(settingsBtn).toBeTruthy();
  });

  // ---- Expand button ----

  it('creates an expand button with double-arrow character', () => {
    const state = createMockState();
    renderCompact(state);

    const buttons = state.container!.querySelectorAll('button');
    const expandBtn = Array.from(buttons).find((b) => b.textContent === '\u27EB');
    expect(expandBtn).toBeTruthy();
  });

  it('expand button has 18x18 circular styling', () => {
    const state = createMockState();
    renderCompact(state);

    const buttons = state.container!.querySelectorAll('button');
    const expandBtn = Array.from(buttons).find((b) => b.textContent === '\u27EB')!;
    expect(expandBtn.style.width).toBe('18px');
    expect(expandBtn.style.height).toBe('18px');
    expect(expandBtn.style.borderRadius).toBe('50%');
  });

  it('expand button calls toggleCompactMode on click', () => {
    const state = createMockState();
    renderCompact(state);

    const buttons = state.container!.querySelectorAll('button');
    const expandBtn = Array.from(buttons).find((b) => b.textContent === '\u27EB')!;
    expandBtn.onclick!(new MouseEvent('click'));

    expect(state.toggleCompactMode).toHaveBeenCalled();
  });

  it('expand button has tooltip attached', () => {
    const state = createMockState();
    renderCompact(state);

    // The expand button should get a tooltip saying "Expand DevBar"
    const tooltipCalls = vi.mocked(attachTextTooltip).mock.calls;
    const expandTooltipCall = tooltipCalls.find((call) => {
      const fn = call[2] as () => string;
      return fn() === 'Expand DevBar';
    });
    expect(expandTooltipCall).toBeTruthy();
  });

  it('expand button has cursor pointer style', () => {
    const state = createMockState();
    renderCompact(state);

    const buttons = state.container!.querySelectorAll('button');
    const expandBtn = Array.from(buttons).find((b) => b.textContent === '\u27EB')!;
    expect(expandBtn.style.cursor).toBe('pointer');
  });

  // ---- Child ordering ----

  it('has connection indicator as first element', () => {
    const state = createMockState();
    renderCompact(state);

    const first = state.container!.children[0] as HTMLElement;
    expect(first.className).toBe('devbar-clickable');
  });

  it('places expand button as last element', () => {
    const state = createMockState();
    renderCompact(state);

    const children = state.container!.children;
    const last = children[children.length - 1] as HTMLElement;
    expect(last.textContent).toBe('\u27EB');
  });
});
