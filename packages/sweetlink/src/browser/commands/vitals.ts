/**
 * Web Vitals Command Handler
 *
 * Collects Core Web Vitals and performance metrics from the Performance API.
 */

import type { SweetlinkResponse } from '../../types.js';

interface WebVitalsData {
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  pageSize: number | null;
  url: string;
  title: string;
  timestamp: number;
}

/**
 * Collect a single metric value from a buffered PerformanceObserver
 */
function observeMetric(entryType: string): Promise<PerformanceEntry[]> {
  return new Promise((resolve) => {
    try {
      const entries: PerformanceEntry[] = [];
      const observer = new PerformanceObserver((list) => {
        entries.push(...list.getEntries());
      });
      observer.observe({ type: entryType, buffered: true });
      // Give buffered entries a tick to arrive
      setTimeout(() => {
        observer.disconnect();
        resolve(entries);
      }, 0);
    } catch {
      // Observer type not supported
      resolve([]);
    }
  });
}

/**
 * Handle get-vitals command from CLI
 */
export async function handleGetVitals(): Promise<SweetlinkResponse> {
  try {
    const vitals: WebVitalsData = {
      fcp: null,
      lcp: null,
      cls: null,
      inp: null,
      pageSize: null,
      url: window.location.href,
      title: document.title,
      timestamp: Date.now(),
    };

    // FCP from paint entries
    const paintEntries = performance.getEntriesByType('paint');
    const fcpEntry = paintEntries.find((e) => e.name === 'first-contentful-paint');
    if (fcpEntry) {
      vitals.fcp = Math.round(fcpEntry.startTime);
    }

    // LCP, CLS, INP from buffered observers (run in parallel)
    const [lcpEntries, layoutShiftEntries, eventEntries] = await Promise.all([
      observeMetric('largest-contentful-paint'),
      observeMetric('layout-shift'),
      observeMetric('event'),
    ]);

    // LCP: use the last (largest) entry
    if (lcpEntries.length > 0) {
      const lastLcp = lcpEntries[lcpEntries.length - 1] as PerformanceEntry & {
        startTime: number;
      };
      vitals.lcp = Math.round(lastLcp.startTime);
    }

    // CLS: sum of layout shift values (excluding those with recent input)
    if (layoutShiftEntries.length > 0) {
      let clsValue = 0;
      for (const entry of layoutShiftEntries) {
        const shiftEntry = entry as PerformanceEntry & {
          hadRecentInput: boolean;
          value: number;
        };
        if (!shiftEntry.hadRecentInput) {
          clsValue += shiftEntry.value;
        }
      }
      vitals.cls = Math.round(clsValue * 1000) / 1000;
    }

    // INP: approximate as the worst event processing time
    if (eventEntries.length > 0) {
      let worstDuration = 0;
      for (const entry of eventEntries) {
        const eventEntry = entry as PerformanceEntry & {
          processingStart: number;
          processingEnd: number;
          duration: number;
        };
        if (eventEntry.duration > worstDuration) {
          worstDuration = eventEntry.duration;
        }
      }
      vitals.inp = Math.round(worstDuration);
    }

    // Page size from resource entries
    const resourceEntries = performance.getEntriesByType('resource');
    let totalSize = 0;
    for (const entry of resourceEntries) {
      const resourceEntry = entry as PerformanceResourceTiming;
      totalSize += resourceEntry.transferSize || 0;
    }
    if (totalSize > 0) {
      vitals.pageSize = totalSize;
    }

    // Format summary for text output
    const parts: string[] = [];
    if (vitals.fcp !== null) parts.push(`FCP: ${vitals.fcp}ms`);
    if (vitals.lcp !== null) parts.push(`LCP: ${vitals.lcp}ms`);
    if (vitals.cls !== null) parts.push(`CLS: ${vitals.cls}`);
    if (vitals.inp !== null) parts.push(`INP: ${vitals.inp}ms`);
    if (vitals.pageSize !== null) {
      const sizeKB = Math.round(vitals.pageSize / 1024);
      parts.push(`Page size: ${sizeKB}KB`);
    }

    return {
      success: true,
      data: {
        vitals,
        summary: parts.join(', ') || 'No metrics available yet',
      },
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Vitals collection failed',
      timestamp: Date.now(),
    };
  }
}
