/**
 * Performance module tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getResponsiveMetricVisibility,
  setupBreakpointDetection,
  setupPerformanceMonitoring,
} from './performance.js';
import type { DevBarState } from './types.js';

function createMockState(overrides: Partial<DevBarState> = {}): DevBarState {
  return {
    options: {
      showTooltips: true,
      saveLocation: 'auto',
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
        showMetrics: {
          breakpoint: true,
          fcp: true,
          lcp: true,
          cls: true,
          inp: true,
          pageSize: true,
        },
        showScreenshot: true,
        showConsoleBadges: true,
        showTooltips: true,
        saveLocation: 'auto',
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
    // At mobile widths, buttons wrap to second row, freeing horizontal space.
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

describe('setupPerformanceMonitoring', () => {
  let originalReadyState: string;
  let observerCallbacks: Map<string, (list: any) => void>;
  let mockObserverInstances: any[];

  beforeEach(() => {
    vi.useFakeTimers();
    originalReadyState = document.readyState;
    observerCallbacks = new Map();
    mockObserverInstances = [];

    // Mock PerformanceObserver as a proper class (needed for `new` keyword)
    class MockPerformanceObserver {
      callback: any;
      observe: any;
      disconnect: any;
      constructor(callback: any) {
        this.callback = callback;
        this.observe = vi.fn((opts: any) => {
          observerCallbacks.set(opts.type, callback);
        });
        this.disconnect = vi.fn();
        mockObserverInstances.push(this);
      }
    }
    vi.stubGlobal('PerformanceObserver', MockPerformanceObserver);

    // Mock performance API
    vi.spyOn(performance, 'getEntriesByType').mockImplementation((type: string) => {
      if (type === 'paint') {
        return [{ name: 'first-contentful-paint', startTime: 123.456 }] as any;
      }
      if (type === 'navigation') {
        return [{ transferSize: 5000 }] as any;
      }
      if (type === 'resource') {
        return [{ transferSize: 10000 }, { transferSize: 20000 }] as any;
      }
      return [];
    });
  });

  afterEach(() => {
    Object.defineProperty(document, 'readyState', {
      value: originalReadyState,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('schedules updatePerfStats via setTimeout when document is complete', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    const state = createMockState({ lcpValue: 250, clsValue: 0.05, inpValue: 80 });
    setupPerformanceMonitoring(state);

    // Before timer fires, perfStats may still be null
    vi.advanceTimersByTime(100);

    expect(state.perfStats).not.toBeNull();
    expect(state.perfStats!.fcp).toBe('123ms');
    expect(state.perfStats!.lcp).toBe('250ms');
    expect(state.perfStats!.cls).toBe('0.050');
    expect(state.perfStats!.inp).toBe('80ms');
    expect(state.render).toHaveBeenCalled();
    expect(state.debug.perf).toHaveBeenCalledWith('Performance stats updated', expect.any(Object));
  });

  it('registers load event listener when document is not complete', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'loading',
      configurable: true,
      writable: true,
    });

    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const state = createMockState();
    setupPerformanceMonitoring(state);

    expect(addEventListenerSpy).toHaveBeenCalledWith('load', expect.any(Function));
  });

  it('formats FCP as dash when no paint entry exists', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    vi.spyOn(performance, 'getEntriesByType').mockImplementation((type: string) => {
      if (type === 'paint') return [];
      if (type === 'navigation') return [{ transferSize: 0 }] as any;
      if (type === 'resource') return [];
      return [];
    });

    const state = createMockState({ lcpValue: null });
    setupPerformanceMonitoring(state);
    vi.advanceTimersByTime(100);

    expect(state.perfStats!.fcp).toBe('-');
  });

  it('formats LCP as dash when lcpValue is null', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    const state = createMockState({ lcpValue: null });
    setupPerformanceMonitoring(state);
    vi.advanceTimersByTime(100);

    expect(state.perfStats!.lcp).toBe('-');
  });

  it('formats INP as dash when inpValue is 0', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    const state = createMockState({ inpValue: 0 });
    setupPerformanceMonitoring(state);
    vi.advanceTimersByTime(100);

    expect(state.perfStats!.inp).toBe('-');
  });

  it('formats total size in MB when over 1MB', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    vi.spyOn(performance, 'getEntriesByType').mockImplementation((type: string) => {
      if (type === 'paint') return [];
      if (type === 'navigation') return [{ transferSize: 1500000 }] as any;
      if (type === 'resource') return [{ transferSize: 500000 }] as any;
      return [];
    });

    const state = createMockState();
    setupPerformanceMonitoring(state);
    vi.advanceTimersByTime(100);

    expect(state.perfStats!.totalSize).toMatch(/MB$/);
  });

  it('formats total size in KB when under 1MB', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    vi.spyOn(performance, 'getEntriesByType').mockImplementation((type: string) => {
      if (type === 'paint') return [];
      if (type === 'navigation') return [{ transferSize: 5000 }] as any;
      if (type === 'resource') return [{ transferSize: 10000 }] as any;
      return [];
    });

    const state = createMockState();
    setupPerformanceMonitoring(state);
    vi.advanceTimersByTime(100);

    expect(state.perfStats!.totalSize).toMatch(/KB$/);
  });

  it('handles missing navigation entry for total size', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    vi.spyOn(performance, 'getEntriesByType').mockImplementation((type: string) => {
      if (type === 'paint') return [];
      if (type === 'navigation') return [];
      if (type === 'resource') return [{ transferSize: 1024 }] as any;
      return [];
    });

    const state = createMockState();
    setupPerformanceMonitoring(state);
    vi.advanceTimersByTime(100);

    expect(state.perfStats!.totalSize).toBe('1 KB');
  });

  it('creates FCP observer and assigns to state', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    const state = createMockState();
    setupPerformanceMonitoring(state);

    expect(state.fcpObserver).not.toBeNull();
    expect(state.lcpObserver).not.toBeNull();
    expect(state.clsObserver).not.toBeNull();
    expect(state.inpObserver).not.toBeNull();
  });

  it('FCP observer callback triggers updatePerfStats on matching entry', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    const state = createMockState();
    setupPerformanceMonitoring(state);
    vi.advanceTimersByTime(100);
    (state.render as any).mockClear();

    // Trigger the FCP observer callback
    const fcpCallback = observerCallbacks.get('paint');
    expect(fcpCallback).toBeDefined();
    fcpCallback!({
      getEntries: () => [{ name: 'first-contentful-paint', startTime: 200 }],
    });

    expect(state.render).toHaveBeenCalled();
  });

  it('FCP observer callback ignores non-FCP paint entries', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    const state = createMockState();
    setupPerformanceMonitoring(state);
    vi.advanceTimersByTime(100);
    (state.render as any).mockClear();

    const fcpCallback = observerCallbacks.get('paint');
    fcpCallback!({
      getEntries: () => [{ name: 'first-paint', startTime: 50 }],
    });

    // render should not be called for non-FCP paint entries
    expect(state.render).not.toHaveBeenCalled();
  });

  it('LCP observer updates lcpValue and triggers updatePerfStats', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    const state = createMockState({ lcpValue: null });
    setupPerformanceMonitoring(state);
    vi.advanceTimersByTime(100);
    (state.render as any).mockClear();

    const lcpCallback = observerCallbacks.get('largest-contentful-paint');
    expect(lcpCallback).toBeDefined();
    lcpCallback!({
      getEntries: () => [{ startTime: 500 }, { startTime: 750 }],
    });

    expect(state.lcpValue).toBe(750); // Takes last entry
    expect(state.debug.perf).toHaveBeenCalledWith('LCP updated', { lcp: 750 });
    expect(state.render).toHaveBeenCalled();
  });

  it('LCP observer ignores empty entries list', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    const state = createMockState({ lcpValue: null });
    setupPerformanceMonitoring(state);
    vi.advanceTimersByTime(100);
    (state.render as any).mockClear();

    const lcpCallback = observerCallbacks.get('largest-contentful-paint');
    lcpCallback!({ getEntries: () => [] });

    expect(state.lcpValue).toBeNull(); // Unchanged
    expect(state.render).not.toHaveBeenCalled();
  });

  it('CLS observer accumulates layout shift values', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    const state = createMockState({ clsValue: 0 });
    setupPerformanceMonitoring(state);
    vi.advanceTimersByTime(100);
    (state.render as any).mockClear();

    const clsCallback = observerCallbacks.get('layout-shift');
    expect(clsCallback).toBeDefined();

    // First shift
    clsCallback!({
      getEntries: () => [{ hadRecentInput: false, value: 0.1 }],
    });
    expect(state.clsValue).toBeCloseTo(0.1);

    // Second shift accumulates
    clsCallback!({
      getEntries: () => [{ hadRecentInput: false, value: 0.05 }],
    });
    expect(state.clsValue).toBeCloseTo(0.15);
    expect(state.debug.perf).toHaveBeenCalledWith('CLS updated', expect.any(Object));
  });

  it('CLS observer ignores shifts with recent user input', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    const state = createMockState({ clsValue: 0 });
    setupPerformanceMonitoring(state);
    vi.advanceTimersByTime(100);
    (state.render as any).mockClear();

    const clsCallback = observerCallbacks.get('layout-shift');
    clsCallback!({
      getEntries: () => [{ hadRecentInput: true, value: 0.5 }],
    });

    expect(state.clsValue).toBe(0); // Not accumulated
    expect(state.render).not.toHaveBeenCalled();
  });

  it('CLS observer ignores entries with no value', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    const state = createMockState({ clsValue: 0 });
    setupPerformanceMonitoring(state);
    vi.advanceTimersByTime(100);
    (state.render as any).mockClear();

    const clsCallback = observerCallbacks.get('layout-shift');
    clsCallback!({
      getEntries: () => [{ hadRecentInput: false, value: 0 }],
    });

    expect(state.clsValue).toBe(0);
    expect(state.render).not.toHaveBeenCalled();
  });

  it('INP observer tracks the highest duration interaction', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    const state = createMockState({ inpValue: 0 });
    setupPerformanceMonitoring(state);
    vi.advanceTimersByTime(100);
    (state.render as any).mockClear();

    const inpCallback = observerCallbacks.get('event');
    expect(inpCallback).toBeDefined();

    // First interaction
    inpCallback!({
      getEntries: () => [{ duration: 50 }],
    });
    expect(state.inpValue).toBe(50);

    // Higher duration replaces
    inpCallback!({
      getEntries: () => [{ duration: 120 }],
    });
    expect(state.inpValue).toBe(120);

    // Lower duration does NOT replace
    inpCallback!({
      getEntries: () => [{ duration: 30 }],
    });
    expect(state.inpValue).toBe(120);
    expect(state.debug.perf).toHaveBeenCalledWith('INP updated', expect.any(Object));
  });

  it('INP observer ignores entries with no duration', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    const state = createMockState({ inpValue: 0 });
    setupPerformanceMonitoring(state);
    vi.advanceTimersByTime(100);
    (state.render as any).mockClear();

    const inpCallback = observerCallbacks.get('event');
    inpCallback!({
      getEntries: () => [{ duration: 0 }],
    });

    expect(state.inpValue).toBe(0);
    expect(state.render).not.toHaveBeenCalled();
  });

  it('handles PerformanceObserver not supported (catches errors)', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true,
      writable: true,
    });

    // Make PerformanceObserver constructor throw
    vi.stubGlobal(
      'PerformanceObserver',
      vi.fn(() => {
        throw new Error('Not supported');
      })
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const state = createMockState();

    // Should not throw
    expect(() => setupPerformanceMonitoring(state)).not.toThrow();

    // All four observers should have logged warnings (may also include vitest internal warnings)
    expect(
      warnSpy.mock.calls.filter((c) => c[0]?.toString().includes('[GlobalDevBar]'))
    ).toHaveLength(4);
    expect(warnSpy).toHaveBeenCalledWith(
      '[GlobalDevBar] FCP PerformanceObserver not supported',
      expect.any(Error)
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[GlobalDevBar] LCP PerformanceObserver not supported',
      expect.any(Error)
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[GlobalDevBar] CLS PerformanceObserver not supported',
      expect.any(Error)
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[GlobalDevBar] INP PerformanceObserver not supported',
      expect.any(Error)
    );

    // Observers should remain null
    expect(state.fcpObserver).toBeNull();
    expect(state.lcpObserver).toBeNull();
    expect(state.clsObserver).toBeNull();
    expect(state.inpObserver).toBeNull();

    warnSpy.mockRestore();
  });

  it('load event handler fires updatePerfStats after timeout', () => {
    Object.defineProperty(document, 'readyState', {
      value: 'loading',
      configurable: true,
      writable: true,
    });

    const listeners: Record<string, Array<() => void>> = {};
    vi.spyOn(window, 'addEventListener').mockImplementation((event: string, handler: any) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler as () => void);
    });

    const state = createMockState({ lcpValue: 300 });
    setupPerformanceMonitoring(state);

    // perfStats should still be null before load fires
    expect(state.perfStats).toBeNull();

    // Simulate load event
    listeners.load?.forEach((fn) => fn());
    vi.advanceTimersByTime(100);

    expect(state.perfStats).not.toBeNull();
    expect(state.perfStats!.lcp).toBe('300ms');
  });
});
