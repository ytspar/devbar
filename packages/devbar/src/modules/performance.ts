/**
 * Performance monitoring: FCP, LCP, CLS, INP observers, breakpoint detection,
 * and responsive metric visibility calculation.
 *
 * Extracted from GlobalDevBar to reduce file size.
 */

import { TAILWIND_BREAKPOINTS } from '../constants.js';
import type { DevBarState } from './types.js';

/**
 * Setup breakpoint detection by tracking window resize events.
 */
export function setupBreakpointDetection(state: DevBarState): void {
  const updateBreakpointInfo = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Determine breakpoint by checking thresholds in descending order
    const breakpointOrder: Array<keyof typeof TAILWIND_BREAKPOINTS> = [
      '2xl',
      'xl',
      'lg',
      'md',
      'sm',
    ];
    const tailwindBreakpoint =
      breakpointOrder.find((bp) => width >= TAILWIND_BREAKPOINTS[bp].min) ?? 'base';

    state.breakpointInfo = {
      tailwindBreakpoint,
      dimensions: `${width}x${height}`,
    };
    state.render();
  };

  updateBreakpointInfo();
  state.resizeHandler = updateBreakpointInfo;
  window.addEventListener('resize', state.resizeHandler);
}

/**
 * Get which metrics should be visible vs hidden based on available space.
 * Dynamically calculates based on window width, number of badges, and other elements.
 * Returns metrics in display order (FCP, LCP, CLS, INP, pageSize).
 * Hides metrics in reverse priority order (pageSize first, then INP, CLS, LCP, FCP).
 */
export function getResponsiveMetricVisibility(state: DevBarState): {
  visible: Array<'fcp' | 'lcp' | 'cls' | 'inp' | 'pageSize'>;
  hidden: Array<'fcp' | 'lcp' | 'cls' | 'inp' | 'pageSize'>;
} {
  type MetricKey = 'fcp' | 'lcp' | 'cls' | 'inp' | 'pageSize';

  // Display order (most important first)
  const displayOrder: MetricKey[] = ['fcp', 'lcp', 'cls', 'inp', 'pageSize'];

  // Approximate widths in pixels (measured from typical rendered output)
  const METRIC_WIDTH = 95; // "FCP 1234MS |" including separator
  const BADGE_WIDTH = 30; // Each console badge
  const ACTION_BUTTON_WIDTH = 30; // Each action button
  const BREAKPOINT_WIDTH = 100; // "MD - 1234x5678 |" (reduced estimate)
  const CONNECTION_DOT_WIDTH = 16; // Connection indicator
  const ELLIPSIS_WIDTH = 24; // "..." button
  const CONTAINER_PADDING = 24; // Internal padding and gaps

  // Count visible badges
  const { errorCount, warningCount, infoCount } = state.getLogCounts();
  const badgeCount =
    (errorCount > 0 ? 1 : 0) + (warningCount > 0 ? 1 : 0) + (infoCount > 0 ? 1 : 0);

  // Count action buttons (screenshot, AI review, outline, schema, settings, collapse)
  const { showScreenshot, position } = state.options;
  const actionButtonCount = (showScreenshot ? 1 : 0) + 5; // 5 always-visible buttons

  // Calculate available width for metrics based on position
  // Centered: 16px margin each side = 32px total
  // Left/right: 80px for Next.js bar + 16px margin = 96px total
  const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const isCentered = position === 'bottom-center';
  const margins = isCentered ? 32 : 96;
  const containerWidth = windowWidth - margins;

  // At small screens (<640px), action buttons wrap to second row and don't take horizontal space
  const buttonsWrap = windowWidth < 640;
  const buttonWidth = buttonsWrap ? 0 : actionButtonCount * ACTION_BUTTON_WIDTH;

  const fixedWidth =
    CONNECTION_DOT_WIDTH +
    BREAKPOINT_WIDTH +
    badgeCount * BADGE_WIDTH +
    buttonWidth +
    CONTAINER_PADDING;

  const availableForMetrics = containerWidth - fixedWidth;

  // Determine how many metrics fit (reserve space for ellipsis if hiding any)
  let maxMetrics = Math.floor(availableForMetrics / METRIC_WIDTH);

  // If we can't show all metrics, reserve space for ellipsis button
  if (maxMetrics < displayOrder.length && maxMetrics > 0) {
    maxMetrics = Math.floor((availableForMetrics - ELLIPSIS_WIDTH) / METRIC_WIDTH);
  }

  // Clamp to valid range
  maxMetrics = Math.max(0, Math.min(maxMetrics, displayOrder.length));

  // Split into visible and hidden (visible gets the first N in display order)
  const visible = displayOrder.slice(0, maxMetrics);
  const hidden = displayOrder.slice(maxMetrics);

  return { visible, hidden };
}

/**
 * Setup performance monitoring with PerformanceObservers for FCP, LCP, CLS, INP.
 */
export function setupPerformanceMonitoring(state: DevBarState): void {
  const updatePerfStats = () => {
    // FCP
    const paintEntries = performance.getEntriesByType('paint');
    const fcpEntry = paintEntries.find((entry) => entry.name === 'first-contentful-paint');
    const fcp = fcpEntry ? `${Math.round(fcpEntry.startTime)}ms` : '-';

    // LCP (from cached value, updated by observer)
    const lcp = state.lcpValue !== null ? `${Math.round(state.lcpValue)}ms` : '-';

    // CLS (cumulative layout shift) - 0 is a valid value meaning no layout shifts
    const cls = state.clsValue.toFixed(3);

    // INP (Interaction to Next Paint)
    const inp = state.inpValue > 0 ? `${Math.round(state.inpValue)}ms` : '-';

    // Total Resource Size
    const resources = performance.getEntriesByType('resource');
    let totalBytes = 0;

    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navEntry) {
      totalBytes += navEntry.transferSize || 0;
    }

    resources.forEach((entry) => {
      const resourceEntry = entry as PerformanceResourceTiming;
      totalBytes += resourceEntry.transferSize || 0;
    });

    const totalSize =
      totalBytes > 1024 * 1024
        ? `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(totalBytes / 1024)} KB`;

    state.perfStats = { fcp, lcp, cls, inp, totalSize };
    state.debug.perf('Performance stats updated', state.perfStats);
    state.render();
  };

  if (document.readyState === 'complete') {
    setTimeout(updatePerfStats, 100);
  } else {
    window.addEventListener('load', () => setTimeout(updatePerfStats, 100));
  }

  // FCP Observer
  try {
    state.fcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if (entry.name === 'first-contentful-paint') {
          updatePerfStats();
        }
      });
    });
    state.fcpObserver.observe({ type: 'paint', buffered: true });
  } catch (e) {
    console.warn('[GlobalDevBar] FCP PerformanceObserver not supported', e);
  }

  // LCP Observer
  try {
    state.lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        state.lcpValue = lastEntry.startTime;
        state.debug.perf('LCP updated', { lcp: state.lcpValue });
        updatePerfStats();
      }
    });
    state.lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {
    console.warn('[GlobalDevBar] LCP PerformanceObserver not supported', e);
  }

  // CLS Observer (Cumulative Layout Shift)
  try {
    state.clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Only count layout shifts without recent user input
        const layoutShift = entry as PerformanceEntry & {
          hadRecentInput?: boolean;
          value?: number;
        };
        if (!layoutShift.hadRecentInput && layoutShift.value) {
          state.clsValue += layoutShift.value;
          state.debug.perf('CLS updated', { cls: state.clsValue });
          updatePerfStats();
        }
      }
    });
    state.clsObserver.observe({ type: 'layout-shift', buffered: true });
  } catch (e) {
    console.warn('[GlobalDevBar] CLS PerformanceObserver not supported', e);
  }

  // INP Observer (Interaction to Next Paint)
  try {
    state.inpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const eventEntry = entry as PerformanceEntry & { duration?: number };
        if (eventEntry.duration && eventEntry.duration > state.inpValue) {
          state.inpValue = eventEntry.duration;
          state.debug.perf('INP updated', { inp: state.inpValue });
          updatePerfStats();
        }
      }
    });
    // durationThreshold filters out very short interactions
    state.inpObserver.observe({
      type: 'event',
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit);
  } catch (e) {
    console.warn('[GlobalDevBar] INP PerformanceObserver not supported', e);
  }
}
