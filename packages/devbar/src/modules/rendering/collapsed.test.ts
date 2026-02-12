/**
 * H2: Collapsed state rendering tests
 *
 * Tests the renderCollapsed function which creates the collapsed
 * devbar pill/dot, including connection indicator, error badges,
 * click-to-expand behavior, and position styling.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevBarState } from '../types.js';

// Mock tooltips module
vi.mock('../tooltips.js', () => ({
  attachTextTooltip: vi.fn(),
}));

import { renderCollapsed } from './collapsed.js';
import { attachTextTooltip } from '../tooltips.js';

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
    collapsed: true,
    container: document.createElement('div'),
    lastDotPosition: null,
    getLogCounts: vi.fn(() => ({ errorCount: 0, warningCount: 0, infoCount: 0 })),
    resetPositionStyles: vi.fn(),
    createCollapsedBadge: vi.fn((count: number, bgColor: string, rightPos: string) => {
      const badge = document.createElement('span');
      badge.className = 'devbar-collapsed-badge';
      badge.textContent = String(count);
      badge.dataset.bgColor = bgColor;
      badge.dataset.rightPos = rightPos;
      return badge;
    }),
    ...overrides,
  } as any;
}

afterEach(() => {
  document.body.textContent = '';
  vi.clearAllMocks();
});

describe('renderCollapsed', () => {
  it('returns early when container is null', () => {
    const state = createMockState({ container: null });
    renderCollapsed(state);
    expect(state.resetPositionStyles).not.toHaveBeenCalled();
  });

  it('sets the wrapper className to devbar-collapse', () => {
    const state = createMockState();
    renderCollapsed(state);
    expect(state.container!.className).toBe('devbar-collapse');
  });

  it('applies fixed positioning to the wrapper', () => {
    const state = createMockState();
    renderCollapsed(state);
    expect(state.container!.style.position).toBe('fixed');
  });

  it('sets z-index to 9999', () => {
    const state = createMockState();
    renderCollapsed(state);
    expect(state.container!.style.zIndex).toBe('9999');
  });

  it('makes the wrapper a 26x26 circle', () => {
    const state = createMockState();
    renderCollapsed(state);
    expect(state.container!.style.width).toBe('26px');
    expect(state.container!.style.height).toBe('26px');
    expect(state.container!.style.borderRadius).toBe('50%');
  });

  it('applies accent color as border and text color', () => {
    const state = createMockState();
    renderCollapsed(state);
    expect(state.container!.style.border).toContain('#10b981');
    expect(state.container!.style.color).toBe('#10b981');
  });

  it('uses custom accent color when provided', () => {
    const state = createMockState({
      options: {
        position: 'bottom-left',
        accentColor: '#ff0000',
        showTooltips: true,
        saveLocation: 'auto',
        showScreenshot: true,
        showConsoleBadges: true,
        wsPort: 9223,
        showMetrics: { breakpoint: true, fcp: true, lcp: true, cls: true, inp: true, pageSize: true },
      },
    });
    renderCollapsed(state);
    expect(state.container!.style.color).toBe('#ff0000');
    expect(state.container!.style.border).toContain('#ff0000');
  });

  it('sets CSS variable for accent color on wrapper', () => {
    const state = createMockState();
    renderCollapsed(state);
    expect(state.container!.style.getPropertyValue('--devbar-color-accent')).toBe('#10b981');
  });

  it('sets cursor to pointer', () => {
    const state = createMockState();
    renderCollapsed(state);
    expect(state.container!.style.cursor).toBe('pointer');
  });

  it('applies flex centering for the wrapper', () => {
    const state = createMockState();
    renderCollapsed(state);
    expect(state.container!.style.display).toBe('flex');
    expect(state.container!.style.alignItems).toBe('center');
    expect(state.container!.style.justifyContent).toBe('center');
  });

  it('calls resetPositionStyles before applying styles', () => {
    const state = createMockState();
    renderCollapsed(state);
    expect(state.resetPositionStyles).toHaveBeenCalledWith(state.container);
  });

  // ---- Click handler ----

  it('expands the devbar when clicked', () => {
    const state = createMockState();
    renderCollapsed(state);
    state.container!.onclick!(new MouseEvent('click'));

    expect(state.collapsed).toBe(false);
    expect(state.render).toHaveBeenCalled();
  });

  it('logs debug state message on expand', () => {
    const state = createMockState();
    renderCollapsed(state);
    state.container!.onclick!(new MouseEvent('click'));

    expect(state.debug.state).toHaveBeenCalledWith('Expanded DevBar');
  });

  // ---- Inner container structure ----

  it('creates an inner container span with a connection dot', () => {
    const state = createMockState();
    renderCollapsed(state);

    const inner = state.container!.querySelector('span');
    expect(inner).toBeTruthy();
    expect(inner!.style.display).toBe('flex');
    expect(inner!.style.position).toBe('relative');
  });

  it('inner container contains two children: dot and chevron', () => {
    const state = createMockState();
    renderCollapsed(state);

    const inner = state.container!.children[0] as HTMLElement;
    expect(inner.children.length).toBe(2);
  });

  // ---- Connection indicator ----

  it('shows muted dot color when sweetlink is not connected', () => {
    const state = createMockState({ sweetlinkConnected: false });
    renderCollapsed(state);

    const inner = state.container!.children[0] as HTMLElement;
    const dot = inner.children[0] as HTMLElement;
    expect(dot.style.boxShadow).toBe('none');
    // Should use CSS_COLORS.textMuted (var reference)
    expect(dot.style.backgroundColor).toBe('var(--devbar-color-text-muted)');
  });

  it('shows primary dot color with glow when sweetlink is connected', () => {
    const state = createMockState({ sweetlinkConnected: true });
    renderCollapsed(state);

    const inner = state.container!.children[0] as HTMLElement;
    const dot = inner.children[0] as HTMLElement;
    expect(dot.style.backgroundColor).toBe('var(--devbar-color-primary)');
    expect(dot.style.boxShadow).toContain('0 0 6px');
  });

  it('renders the connection dot as a 6x6 circle', () => {
    const state = createMockState();
    renderCollapsed(state);

    const inner = state.container!.children[0] as HTMLElement;
    const dot = inner.children[0] as HTMLElement;
    expect(dot.style.width).toBe('6px');
    expect(dot.style.height).toBe('6px');
    expect(dot.style.borderRadius).toBe('50%');
  });

  // ---- Chevron ----

  it('creates a chevron indicator that starts hidden', () => {
    const state = createMockState();
    renderCollapsed(state);

    const inner = state.container!.children[0] as HTMLElement;
    const chevron = inner.children[1] as HTMLElement;
    expect(chevron.style.opacity).toBe('0');
    expect(chevron.textContent).toBe('\u2197');
  });

  // ---- Tooltip ----

  it('attaches a text tooltip to the wrapper', () => {
    const state = createMockState();
    renderCollapsed(state);

    expect(attachTextTooltip).toHaveBeenCalledTimes(1);
    expect(attachTextTooltip).toHaveBeenCalledWith(
      state,
      state.container,
      expect.any(Function),
      expect.objectContaining({
        onEnter: expect.any(Function),
        onLeave: expect.any(Function),
      })
    );
  });

  it('tooltip text includes "Click to expand DevBar"', () => {
    const state = createMockState({ sweetlinkConnected: true });
    renderCollapsed(state);

    const tooltipFn = vi.mocked(attachTextTooltip).mock.calls[0][2] as () => string;
    const text = tooltipFn();
    expect(text).toContain('Click to expand DevBar');
    expect(text).toContain('Sweetlink connected');
  });

  it('tooltip text mentions disconnected when sweetlink is not connected', () => {
    const state = createMockState({ sweetlinkConnected: false });
    renderCollapsed(state);

    const tooltipFn = vi.mocked(attachTextTooltip).mock.calls[0][2] as () => string;
    const text = tooltipFn();
    expect(text).toContain('Sweetlink not connected');
  });

  it('tooltip text mentions error count when errors exist', () => {
    const state = createMockState({
      getLogCounts: vi.fn(() => ({ errorCount: 3, warningCount: 0, infoCount: 0 })),
    } as any);
    renderCollapsed(state);

    const tooltipFn = vi.mocked(attachTextTooltip).mock.calls[0][2] as () => string;
    const text = tooltipFn();
    expect(text).toContain('3 console errors');
  });

  it('tooltip text uses singular "error" for count of 1', () => {
    const state = createMockState({
      getLogCounts: vi.fn(() => ({ errorCount: 1, warningCount: 0, infoCount: 0 })),
    } as any);
    renderCollapsed(state);

    const tooltipFn = vi.mocked(attachTextTooltip).mock.calls[0][2] as () => string;
    const text = tooltipFn();
    expect(text).toContain('1 console error');
    expect(text).not.toContain('errors');
  });

  // ---- Error badge ----

  it('does not show error badge when errorCount is 0', () => {
    const state = createMockState({
      getLogCounts: vi.fn(() => ({ errorCount: 0, warningCount: 0, infoCount: 0 })),
    } as any);
    renderCollapsed(state);
    expect(state.createCollapsedBadge).not.toHaveBeenCalled();
  });

  it('shows error badge when errors exist', () => {
    const state = createMockState({
      getLogCounts: vi.fn(() => ({ errorCount: 5, warningCount: 0, infoCount: 0 })),
    } as any);
    renderCollapsed(state);
    expect(state.createCollapsedBadge).toHaveBeenCalledWith(
      5,
      'rgba(239, 68, 68, 0.95)',
      '-6px'
    );
  });

  it('shifts error badge left when warnings also exist', () => {
    const state = createMockState({
      getLogCounts: vi.fn(() => ({ errorCount: 3, warningCount: 2, infoCount: 0 })),
    } as any);
    renderCollapsed(state);

    // Error badge call should use '12px' instead of '-6px' when warnings exist
    const calls = vi.mocked(state.createCollapsedBadge).mock.calls;
    const errorCall = calls.find((c) => c[1] === 'rgba(239, 68, 68, 0.95)');
    expect(errorCall).toBeTruthy();
    expect(errorCall![2]).toBe('12px');
  });

  // ---- Warning badge ----

  it('shows warning badge when warnings exist', () => {
    const state = createMockState({
      getLogCounts: vi.fn(() => ({ errorCount: 0, warningCount: 7, infoCount: 0 })),
    } as any);
    renderCollapsed(state);
    expect(state.createCollapsedBadge).toHaveBeenCalledWith(
      7,
      'rgba(245, 158, 11, 0.95)',
      '-6px'
    );
  });

  it('shows both error and warning badges when both have counts', () => {
    const state = createMockState({
      getLogCounts: vi.fn(() => ({ errorCount: 2, warningCount: 4, infoCount: 0 })),
    } as any);
    renderCollapsed(state);

    expect(state.createCollapsedBadge).toHaveBeenCalledTimes(2);
    // Wrapper should contain: innerContainer + error badge + warning badge
    expect(state.container!.children.length).toBe(3);
  });

  it('does not show warning badge when warningCount is 0', () => {
    const state = createMockState({
      getLogCounts: vi.fn(() => ({ errorCount: 0, warningCount: 0, infoCount: 0 })),
    } as any);
    renderCollapsed(state);
    expect(state.createCollapsedBadge).not.toHaveBeenCalled();
  });

  // ---- Position styling (fallback presets) ----

  it('uses bottom-left preset position by default', () => {
    const state = createMockState();
    renderCollapsed(state);
    expect(state.container!.style.bottom).toBe('27px');
    expect(state.container!.style.left).toBe('86px');
  });

  it('uses bottom-right preset position', () => {
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
    renderCollapsed(state);
    expect(state.container!.style.bottom).toBe('27px');
    expect(state.container!.style.right).toBe('29px');
  });

  it('uses top-left preset position', () => {
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
    renderCollapsed(state);
    expect(state.container!.style.top).toBe('27px');
    expect(state.container!.style.left).toBe('86px');
  });

  it('uses top-right preset position', () => {
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
    renderCollapsed(state);
    expect(state.container!.style.top).toBe('27px');
    expect(state.container!.style.right).toBe('29px');
  });

  it('uses bottom-center preset with transform', () => {
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
    renderCollapsed(state);
    expect(state.container!.style.bottom).toBe('19px');
    expect(state.container!.style.left).toBe('50%');
  });

  it('falls back to bottom-left for unknown position', () => {
    const state = createMockState({
      options: {
        position: 'unknown-position' as any,
        accentColor: '#10b981',
        showTooltips: true,
        saveLocation: 'auto',
        showScreenshot: true,
        showConsoleBadges: true,
        wsPort: 9223,
        showMetrics: { breakpoint: true, fcp: true, lcp: true, cls: true, inp: true, pageSize: true },
      },
    });
    renderCollapsed(state);
    expect(state.container!.style.bottom).toBe('27px');
    expect(state.container!.style.left).toBe('86px');
  });

  // ---- Position styling (captured dot position) ----

  it('uses captured dot position for bottom-* positions', () => {
    const state = createMockState({
      lastDotPosition: { left: 200, top: 500, bottom: 300 },
    });
    renderCollapsed(state);

    // bottom position: bottom = 300 - 13 = 287, left = 200 - 13 = 187
    expect(state.container!.style.bottom).toBe('287px');
    expect(state.container!.style.left).toBe('187px');
  });

  it('uses captured dot position for top-* positions', () => {
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
      lastDotPosition: { left: 150, top: 80, bottom: 720 },
    });
    renderCollapsed(state);

    // top position: top = 80 - 13 = 67, left = 150 - 13 = 137
    expect(state.container!.style.top).toBe('67px');
    expect(state.container!.style.left).toBe('137px');
  });

  it('clears lastDotPosition after using it', () => {
    const state = createMockState({
      lastDotPosition: { left: 200, top: 500, bottom: 300 },
    });
    renderCollapsed(state);
    expect(state.lastDotPosition).toBeNull();
  });

  // ---- Animation ----

  it('applies collapse and pulse animations', () => {
    const state = createMockState();
    renderCollapsed(state);
    expect(state.container!.style.animation).toContain('devbar-collapse');
    expect(state.container!.style.animation).toContain('devbar-collapsed-pulse');
  });
});
