import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SweetlinkResponse } from '../../types.js';
import { handleGetVitals } from './vitals.js';

// biome-ignore lint/suspicious/noExplicitAny: test helper - SweetlinkResponse.data is unknown
const d = (r: SweetlinkResponse): any => r.data;

describe('handleGetVitals', () => {
  let originalPerformance: Performance;
  let originalPerformanceObserver: typeof PerformanceObserver;

  beforeEach(() => {
    originalPerformance = globalThis.performance;
    originalPerformanceObserver = globalThis.PerformanceObserver;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'performance', { value: originalPerformance, writable: true, configurable: true });
    globalThis.PerformanceObserver = originalPerformanceObserver;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * Helper: create a minimal mock Performance object.
   * Callers can override getEntriesByType for specific scenarios.
   */
  function mockPerformance(overrides: Partial<Performance> = {}): void {
    const base = {
      getEntriesByType: vi.fn().mockReturnValue([]),
      ...overrides,
    } as unknown as Performance;
    Object.defineProperty(globalThis, 'performance', { value: base, writable: true, configurable: true });
  }

  /**
   * Helper: create a mock PerformanceObserver that immediately delivers
   * the given entries when `observe` is called with a matching type.
   */
  function mockObserver(entriesByType: Record<string, PerformanceEntry[]>): void {
    globalThis.PerformanceObserver = class MockPerformanceObserver {
      private callback: PerformanceObserverCallback;
      constructor(callback: PerformanceObserverCallback) {
        this.callback = callback;
      }
      observe(options: PerformanceObserverInit): void {
        const type = (options as { type?: string }).type ?? '';
        const entries = entriesByType[type] ?? [];
        if (entries.length > 0) {
          this.callback(
            {
              getEntries: () => entries,
            } as unknown as PerformanceObserverEntryList,
            this as unknown as PerformanceObserver,
          );
        }
      }
      disconnect(): void {}
      takeRecords(): PerformanceEntryList { return []; }
    } as unknown as typeof PerformanceObserver;
  }

  it('returns expected structure with all vitals fields', async () => {
    mockPerformance();
    mockObserver({});

    const response = await handleGetVitals();

    expect(response.success).toBe(true);
    expect(response.timestamp).toBeGreaterThan(0);

    const vitals = d(response).vitals;
    expect(vitals).toBeDefined();
    expect(vitals).toHaveProperty('fcp');
    expect(vitals).toHaveProperty('lcp');
    expect(vitals).toHaveProperty('cls');
    expect(vitals).toHaveProperty('inp');
    expect(vitals).toHaveProperty('pageSize');
    expect(vitals).toHaveProperty('url');
    expect(vitals).toHaveProperty('title');
    expect(vitals).toHaveProperty('timestamp');
  });

  it('returns null metrics when no performance data is available', async () => {
    mockPerformance();
    mockObserver({});

    const response = await handleGetVitals();

    expect(response.success).toBe(true);
    const vitals = d(response).vitals;
    expect(vitals.fcp).toBeNull();
    expect(vitals.lcp).toBeNull();
    expect(vitals.cls).toBeNull();
    expect(vitals.inp).toBeNull();
    expect(vitals.pageSize).toBeNull();
  });

  it('returns summary "No metrics available yet" when no data', async () => {
    mockPerformance();
    mockObserver({});

    const response = await handleGetVitals();

    expect(d(response).summary).toBe('No metrics available yet');
  });

  it('extracts FCP from paint entries', async () => {
    mockPerformance({
      getEntriesByType: vi.fn((type: string) => {
        if (type === 'paint') {
          return [{ name: 'first-contentful-paint', startTime: 123.7 }];
        }
        return [];
      }),
    });
    mockObserver({});

    const response = await handleGetVitals();

    expect(response.success).toBe(true);
    expect(d(response).vitals.fcp).toBe(124); // Math.round(123.7)
    expect(d(response).summary).toContain('FCP: 124ms');
  });

  it('extracts LCP from buffered observer entries', async () => {
    mockPerformance();
    mockObserver({
      'largest-contentful-paint': [
        { name: '', startTime: 500, entryType: 'largest-contentful-paint', duration: 0, toJSON: () => ({}) },
        { name: '', startTime: 900.4, entryType: 'largest-contentful-paint', duration: 0, toJSON: () => ({}) },
      ] as unknown as PerformanceEntry[],
    });

    const response = await handleGetVitals();

    expect(response.success).toBe(true);
    // Uses the last (largest) entry
    expect(d(response).vitals.lcp).toBe(900);
    expect(d(response).summary).toContain('LCP: 900ms');
  });

  it('computes CLS from layout-shift entries, excluding recent input', async () => {
    mockPerformance();
    mockObserver({
      'layout-shift': [
        { name: '', startTime: 0, entryType: 'layout-shift', duration: 0, toJSON: () => ({}), hadRecentInput: false, value: 0.05 },
        { name: '', startTime: 0, entryType: 'layout-shift', duration: 0, toJSON: () => ({}), hadRecentInput: true, value: 0.3 },
        { name: '', startTime: 0, entryType: 'layout-shift', duration: 0, toJSON: () => ({}), hadRecentInput: false, value: 0.02 },
      ] as unknown as PerformanceEntry[],
    });

    const response = await handleGetVitals();

    expect(response.success).toBe(true);
    // CLS = 0.05 + 0.02 = 0.07, rounded to 3 decimals
    expect(d(response).vitals.cls).toBe(0.07);
    expect(d(response).summary).toContain('CLS: 0.07');
  });

  it('computes INP as worst event duration', async () => {
    mockPerformance();
    mockObserver({
      event: [
        { name: '', startTime: 0, entryType: 'event', duration: 50, toJSON: () => ({}), processingStart: 0, processingEnd: 50 },
        { name: '', startTime: 0, entryType: 'event', duration: 200.8, toJSON: () => ({}), processingStart: 0, processingEnd: 200 },
        { name: '', startTime: 0, entryType: 'event', duration: 100, toJSON: () => ({}), processingStart: 0, processingEnd: 100 },
      ] as unknown as PerformanceEntry[],
    });

    const response = await handleGetVitals();

    expect(response.success).toBe(true);
    expect(d(response).vitals.inp).toBe(201); // Math.round(200.8)
    expect(d(response).summary).toContain('INP: 201ms');
  });

  it('computes page size from resource entries', async () => {
    mockPerformance({
      getEntriesByType: vi.fn((type: string) => {
        if (type === 'resource') {
          return [
            { transferSize: 50000 },
            { transferSize: 25000 },
            { transferSize: 0 },
          ];
        }
        return [];
      }),
    });
    mockObserver({});

    const response = await handleGetVitals();

    expect(response.success).toBe(true);
    expect(d(response).vitals.pageSize).toBe(75000);
    // 75000 / 1024 ~ 73
    expect(d(response).summary).toContain('Page size: 73KB');
  });

  it('leaves pageSize null when total transfer size is 0', async () => {
    mockPerformance({
      getEntriesByType: vi.fn((type: string) => {
        if (type === 'resource') {
          return [{ transferSize: 0 }];
        }
        return [];
      }),
    });
    mockObserver({});

    const response = await handleGetVitals();

    expect(d(response).vitals.pageSize).toBeNull();
  });

  it('includes url and title from the document', async () => {
    mockPerformance();
    mockObserver({});

    const response = await handleGetVitals();

    expect(d(response).vitals.url).toBe(window.location.href);
    expect(d(response).vitals.title).toBe(document.title);
  });

  it('handles missing PerformanceObserver gracefully', async () => {
    mockPerformance();
    // PerformanceObserver throws when constructed
    globalThis.PerformanceObserver = class {
      constructor() {
        throw new Error('PerformanceObserver is not supported');
      }
      observe(): void {}
      disconnect(): void {}
      takeRecords(): PerformanceEntryList { return []; }
    } as unknown as typeof PerformanceObserver;

    const response = await handleGetVitals();

    // Should still succeed; observer metrics are null
    expect(response.success).toBe(true);
    expect(d(response).vitals.lcp).toBeNull();
    expect(d(response).vitals.cls).toBeNull();
    expect(d(response).vitals.inp).toBeNull();
  });

  it('handles observer type not supported (observe throws)', async () => {
    mockPerformance();
    globalThis.PerformanceObserver = class {
      constructor(_cb: PerformanceObserverCallback) {}
      observe(): void {
        throw new DOMException('type not supported');
      }
      disconnect(): void {}
      takeRecords(): PerformanceEntryList { return []; }
    } as unknown as typeof PerformanceObserver;

    const response = await handleGetVitals();

    expect(response.success).toBe(true);
    expect(d(response).vitals.lcp).toBeNull();
    expect(d(response).vitals.cls).toBeNull();
    expect(d(response).vitals.inp).toBeNull();
  });

  it('returns error response when Performance API throws', async () => {
    Object.defineProperty(globalThis, 'performance', {
      get() {
        throw new Error('Performance not available');
      },
      configurable: true,
    });
    mockObserver({});

    const response = await handleGetVitals();

    expect(response.success).toBe(false);
    expect(response.error).toBe('Performance not available');
    expect(response.timestamp).toBeGreaterThan(0);
  });

  it('builds summary string with all available metrics', async () => {
    mockPerformance({
      getEntriesByType: vi.fn((type: string) => {
        if (type === 'paint') {
          return [{ name: 'first-contentful-paint', startTime: 200 }];
        }
        if (type === 'resource') {
          return [{ transferSize: 102400 }];
        }
        return [];
      }),
    });
    mockObserver({
      'largest-contentful-paint': [
        { name: '', startTime: 800, entryType: 'largest-contentful-paint', duration: 0, toJSON: () => ({}) },
      ] as unknown as PerformanceEntry[],
      'layout-shift': [
        { name: '', startTime: 0, entryType: 'layout-shift', duration: 0, toJSON: () => ({}), hadRecentInput: false, value: 0.1 },
      ] as unknown as PerformanceEntry[],
      event: [
        { name: '', startTime: 0, entryType: 'event', duration: 64, toJSON: () => ({}), processingStart: 0, processingEnd: 64 },
      ] as unknown as PerformanceEntry[],
    });

    const response = await handleGetVitals();

    expect(response.success).toBe(true);
    const summary: string = d(response).summary;
    expect(summary).toContain('FCP: 200ms');
    expect(summary).toContain('LCP: 800ms');
    expect(summary).toContain('CLS: 0.1');
    expect(summary).toContain('INP: 64ms');
    expect(summary).toContain('Page size: 100KB');
  });

  it('returns generic error message for non-Error throws', async () => {
    // Force a non-Error throw by making performance.getEntriesByType throw a string
    mockPerformance({
      getEntriesByType: vi.fn(() => {
        // biome-ignore lint/complexity/noUselessLoneBlockStatements: intentional throw of non-Error
        throw 'string error';
      }),
    });
    mockObserver({});

    const response = await handleGetVitals();

    expect(response.success).toBe(false);
    expect(response.error).toBe('Vitals collection failed');
  });
});
