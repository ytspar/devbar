/**
 * Performance module tests
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getResponsiveMetricVisibility, setupBreakpointDetection } from './performance.js';
import type { DevBarState } from './types.js';

function createMockState(overrides: Partial<DevBarState> = {}): DevBarState {
  return {
    options: {
      showTooltips: true,
      showScreenshot: true,
      showConsoleBadges: true,
      position: 'bottom-left',
      wsPort: 24680,
    },
    debug: { state: vi.fn(), perf: vi.fn(), ws: vi.fn(), render: vi.fn(), event: vi.fn() },
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
    settingsManager: {
      get: vi.fn(),
      getSettings: vi.fn(() => ({
        version: 1,
        position: 'bottom-left',
        themeMode: 'system',
        compactMode: false,
        showMetrics: { breakpoint: true, fcp: true, lcp: true, cls: true, inp: true, pageSize: true },
        showScreenshot: true,
        showConsoleBadges: true,
        showTooltips: true,
      })),
    } as any,
    render: vi.fn(),
    getLogCounts: vi.fn(() => ({ errorCount: 0, warningCount: 0, infoCount: 0 })),
    ...overrides,
  } as any;
}

describe('setupBreakpointDetection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets breakpoint info based on window width', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    const state = createMockState();
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    setupBreakpointDetection(state);

    expect(state.breakpointInfo).not.toBeNull();
    expect(state.breakpointInfo!.tailwindBreakpoint).toBe('lg');
    expect(state.breakpointInfo!.dimensions).toBe('1024x768');
    expect(state.render).toHaveBeenCalled();
    expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(state.resizeHandler).not.toBeNull();
  });

  it('detects base breakpoint for narrow viewport', () => {
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 568, configurable: true });

    const state = createMockState();
    setupBreakpointDetection(state);

    expect(state.breakpointInfo!.tailwindBreakpoint).toBe('base');
    expect(state.breakpointInfo!.dimensions).toBe('320x568');
  });

  it('detects sm breakpoint at 640px', () => {
    Object.defineProperty(window, 'innerWidth', { value: 640, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 480, configurable: true });

    const state = createMockState();
    setupBreakpointDetection(state);

    expect(state.breakpointInfo!.tailwindBreakpoint).toBe('sm');
  });

  it('detects md breakpoint at 768px', () => {
    Object.defineProperty(window, 'innerWidth', { value: 768, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1024, configurable: true });

    const state = createMockState();
    setupBreakpointDetection(state);

    expect(state.breakpointInfo!.tailwindBreakpoint).toBe('md');
  });

  it('detects xl breakpoint at 1280px', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 720, configurable: true });

    const state = createMockState();
    setupBreakpointDetection(state);

    expect(state.breakpointInfo!.tailwindBreakpoint).toBe('xl');
  });

  it('detects 2xl breakpoint at 1536px', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1536, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 864, configurable: true });

    const state = createMockState();
    setupBreakpointDetection(state);

    expect(state.breakpointInfo!.tailwindBreakpoint).toBe('2xl');
  });

  it('stores the resize handler on state for later cleanup', () => {
    const state = createMockState();
    setupBreakpointDetection(state);
    expect(state.resizeHandler).toBeTypeOf('function');
  });
});

describe('getResponsiveMetricVisibility', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns visible and hidden arrays that sum to 5 metrics', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });

    const state = createMockState();
    const result = getResponsiveMetricVisibility(state);

    expect(result.visible.length + result.hidden.length).toBe(5);
  });

  it('returns all metrics as visible for wide viewport', () => {
    Object.defineProperty(window, 'innerWidth', { value: 2560, configurable: true });

    const state = createMockState();
    const result = getResponsiveMetricVisibility(state);

    expect(result.visible.length).toBe(5);
    expect(result.hidden.length).toBe(0);
    expect(result.visible).toEqual(['fcp', 'lcp', 'cls', 'inp', 'pageSize']);
  });

  it('hides metrics for narrow viewport', () => {
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });

    const state = createMockState();
    const result = getResponsiveMetricVisibility(state);

    // At 400px some metrics should be hidden
    expect(result.visible.length).toBeLessThan(5);
    expect(result.hidden.length).toBeGreaterThan(0);
  });

  it('maintains display order: fcp first, pageSize last', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });

    const state = createMockState();
    const result = getResponsiveMetricVisibility(state);

    if (result.visible.length >= 2) {
      // Verify order is preserved
      const allMetrics = [...result.visible, ...result.hidden];
      expect(allMetrics).toEqual(['fcp', 'lcp', 'cls', 'inp', 'pageSize']);
    }
  });

  it('shows fewer metrics with more badges', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });

    const stateNoBadges = createMockState({
      getLogCounts: vi.fn(() => ({ errorCount: 0, warningCount: 0, infoCount: 0 })),
    });
    const stateWithBadges = createMockState({
      getLogCounts: vi.fn(() => ({ errorCount: 5, warningCount: 3, infoCount: 1 })),
    });

    const noBadges = getResponsiveMetricVisibility(stateNoBadges);
    const withBadges = getResponsiveMetricVisibility(stateWithBadges);

    expect(withBadges.visible.length).toBeLessThanOrEqual(noBadges.visible.length);
  });

  it('gives more space with centered position', () => {
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true });

    const stateLeft = createMockState({
      options: { position: 'bottom-left', showScreenshot: true } as any,
    });
    const stateCenter = createMockState({
      options: { position: 'bottom-center', showScreenshot: true } as any,
    });

    const leftResult = getResponsiveMetricVisibility(stateLeft);
    const centerResult = getResponsiveMetricVisibility(stateCenter);

    // Centered has less margin (32px vs 96px), so more space for metrics
    expect(centerResult.visible.length).toBeGreaterThanOrEqual(leftResult.visible.length);
  });

  it('accounts for button wrapping at narrow viewports', () => {
    // At <640px, buttons wrap to second row, freeing horizontal space
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });

    const state = createMockState();
    const result = getResponsiveMetricVisibility(state);

    // Should still work without errors
    expect(result.visible.length + result.hidden.length).toBe(5);
    expect(result.visible.length).toBeGreaterThanOrEqual(0);
  });

  it('handles no screenshot button reducing action buttons', () => {
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true });

    const stateWithScreenshot = createMockState({
      options: { position: 'bottom-left', showScreenshot: true } as any,
    });
    const stateWithoutScreenshot = createMockState({
      options: { position: 'bottom-left', showScreenshot: false } as any,
    });

    const withScreenshot = getResponsiveMetricVisibility(stateWithScreenshot);
    const withoutScreenshot = getResponsiveMetricVisibility(stateWithoutScreenshot);

    // Without screenshot button, there's more space => more or equal visible metrics
    expect(withoutScreenshot.visible.length).toBeGreaterThanOrEqual(withScreenshot.visible.length);
  });

  it('returns only valid metric keys', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });

    const state = createMockState();
    const result = getResponsiveMetricVisibility(state);
    const validKeys = ['fcp', 'lcp', 'cls', 'inp', 'pageSize'];

    for (const metric of result.visible) {
      expect(validKeys).toContain(metric);
    }
    for (const metric of result.hidden) {
      expect(validKeys).toContain(metric);
    }
  });

  it('handles very narrow viewport without error', () => {
    Object.defineProperty(window, 'innerWidth', { value: 200, configurable: true });

    const state = createMockState({
      getLogCounts: vi.fn(() => ({ errorCount: 10, warningCount: 5, infoCount: 3 })),
    });

    const result = getResponsiveMetricVisibility(state);
    expect(result.visible.length).toBeGreaterThanOrEqual(0);
    expect(result.visible.length + result.hidden.length).toBe(5);
  });
});
