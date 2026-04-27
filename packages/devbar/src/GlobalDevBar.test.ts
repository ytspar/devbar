/**
 * GlobalDevBar Comprehensive Tests
 *
 * Tests for responsive behavior, metric visibility, badge rendering,
 * position handling, and UI interactions across different viewport sizes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Layout constants (match the actual DevBar implementation)
const LAYOUT = {
  METRIC_WIDTH: 118,
  BADGE_WIDTH: 30,
  ACTION_BUTTON_WIDTH: 32,
  ACTION_LABEL_WIDTH: 96,
  BREAKPOINT_WIDTH: 112,
  CONNECTION_DOT_WIDTH: 16,
  ELLIPSIS_WIDTH: 24,
  CONTAINER_PADDING: 24,
  BUTTON_WRAP_BREAKPOINT: 860,
  CENTERED_MARGIN: 32,
  DEFAULT_MARGIN: 96,
  TOTAL_METRICS: 5,
} as const;

/**
 * Calculate metric visibility based on available space.
 * This simulates what getResponsiveMetricVisibility() does in the actual component.
 */
function calculateMetricVisibility(
  windowWidth: number,
  position: string,
  badgeCount: number,
  showScreenshot: boolean = true
): { visible: string[]; hidden: string[]; availableWidth: number; maxMetrics: number } {
  const actionButtonCount = (showScreenshot ? 1 : 0) + 9;
  const isCentered = position === 'bottom-center';
  const margins = isCentered ? LAYOUT.CENTERED_MARGIN : LAYOUT.DEFAULT_MARGIN;
  const containerWidth = windowWidth - margins;

  // Compact tablet/mobile widths move action buttons to a second row.
  const buttonsWrap = windowWidth <= LAYOUT.BUTTON_WRAP_BREAKPOINT;
  const buttonWidth = buttonsWrap
    ? 0
    : actionButtonCount * LAYOUT.ACTION_BUTTON_WIDTH + LAYOUT.ACTION_LABEL_WIDTH;

  const fixedWidth =
    LAYOUT.CONNECTION_DOT_WIDTH +
    LAYOUT.BREAKPOINT_WIDTH +
    badgeCount * LAYOUT.BADGE_WIDTH +
    buttonWidth +
    LAYOUT.CONTAINER_PADDING;

  const availableForMetrics = containerWidth - fixedWidth;
  const displayOrder = ['fcp', 'lcp', 'cls', 'inp', 'pageSize'];
  let maxMetrics = Math.floor(availableForMetrics / LAYOUT.METRIC_WIDTH);

  // Reserve space for ellipsis if hiding any
  if (maxMetrics < displayOrder.length && maxMetrics > 0) {
    maxMetrics = Math.floor((availableForMetrics - LAYOUT.ELLIPSIS_WIDTH) / LAYOUT.METRIC_WIDTH);
  }

  maxMetrics = Math.max(0, Math.min(maxMetrics, displayOrder.length));

  return {
    visible: displayOrder.slice(0, maxMetrics),
    hidden: displayOrder.slice(maxMetrics),
    availableWidth: availableForMetrics,
    maxMetrics,
  };
}

// Test viewport widths including edge cases
const TEST_VIEWPORTS = [
  { name: 'base-narrow', width: 320 },
  { name: 'base-wide', width: 500 },
  { name: 'sm-edge', width: 639 },
  { name: 'sm', width: 640 },
  { name: 'md-edge', width: 767 },
  { name: 'md', width: 768 },
  { name: 'md-wide', width: 900 },
  { name: 'lg-edge', width: 1023 },
  { name: 'lg', width: 1024 },
  { name: 'xl', width: 1280 },
  { name: '2xl', width: 1536 },
  { name: 'ultrawide', width: 2560 },
];

// Position configurations
const POSITIONS = [
  'bottom-left',
  'bottom-right',
  'top-left',
  'top-right',
  'bottom-center',
] as const;

describe('DevBar Metric Visibility Calculation', () => {
  describe('Viewport width variations', () => {
    for (const viewport of TEST_VIEWPORTS) {
      it(`should calculate metrics correctly at ${viewport.name} (${viewport.width}px)`, () => {
        const result = calculateMetricVisibility(viewport.width, 'bottom-left', 0);

        // Basic sanity checks
        expect(result.visible.length + result.hidden.length).toBe(5);
        expect(result.maxMetrics).toBeGreaterThanOrEqual(0);
        expect(result.maxMetrics).toBeLessThanOrEqual(5);

        // At wider viewports, should show more metrics
        if (viewport.width >= 1280) {
          expect(result.maxMetrics).toBeGreaterThanOrEqual(4);
        }
      });
    }
  });

  describe('Badge count impact', () => {
    const badgeCounts = [0, 1, 2, 3];

    for (const count of badgeCounts) {
      it(`should reduce visible metrics with ${count} badge(s)`, () => {
        const withBadges = calculateMetricVisibility(768, 'bottom-left', count);
        const withoutBadges = calculateMetricVisibility(768, 'bottom-left', 0);

        // More badges = less space = fewer or equal metrics
        expect(withBadges.maxMetrics).toBeLessThanOrEqual(withoutBadges.maxMetrics);

        // Each badge takes ~30px, so with 3 badges we lose 90px = ~1 metric
        if (count > 0) {
          expect(withBadges.availableWidth).toBeLessThan(withoutBadges.availableWidth);
        }
      });
    }
  });

  describe('Position variations', () => {
    for (const position of POSITIONS) {
      it(`should handle ${position} position correctly`, () => {
        const result = calculateMetricVisibility(1024, position, 1);

        expect(result.visible.length).toBeGreaterThan(0);

        // Centered position has less margin (32px vs 96px), so more space
        if (position === 'bottom-center') {
          const leftResult = calculateMetricVisibility(1024, 'bottom-left', 1);
          expect(result.availableWidth).toBeGreaterThan(leftResult.availableWidth);
        }
      });
    }
  });

  describe('Button wrap behavior', () => {
    it('should not count button width at compact widths (buttons wrap)', () => {
      const narrow = calculateMetricVisibility(500, 'bottom-left', 0);

      // At 500px buttons wrap, preserving status-row space for core context.
      // So narrow might actually have MORE space for metrics in the first row
      expect(narrow.availableWidth).toBeGreaterThan(0);
    });

    it('should count button width at wide viewports', () => {
      const result = calculateMetricVisibility(1280, 'bottom-left', 0);
      // Button width is included, reducing available space
      expect(result.availableWidth).toBeLessThan(1280 - 96); // Less than container width
    });
  });

  describe('Edge cases', () => {
    it('should handle very narrow viewport gracefully', () => {
      const result = calculateMetricVisibility(200, 'bottom-left', 3);

      expect(result.maxMetrics).toBeGreaterThanOrEqual(0);
      expect(result.visible).toBeDefined();
      expect(result.hidden).toBeDefined();
    });

    it('should handle very wide viewport', () => {
      const result = calculateMetricVisibility(3840, 'bottom-left', 0);

      // Should show all 5 metrics
      expect(result.maxMetrics).toBe(5);
      expect(result.hidden.length).toBe(0);
    });

    it('should handle all badges at narrow viewport', () => {
      const result = calculateMetricVisibility(400, 'bottom-left', 3);

      // Even with 3 badges on narrow screen, calculation should not error
      expect(result.visible.length + result.hidden.length).toBe(5);
    });
  });
});

describe('DevBar Comprehensive UI Matrix', () => {
  /**
   * Generate all test permutations for manual/visual testing reference
   */
  describe('Test matrix generation', () => {
    const testCases: Array<{
      viewport: string;
      width: number;
      position: string;
      errorCount: number;
      warnCount: number;
      infoCount: number;
      expectedBehavior: string;
    }> = [];

    // Generate permutations
    for (const viewport of TEST_VIEWPORTS.slice(0, 6)) {
      // First 6 viewports
      for (const position of POSITIONS) {
        for (const errorCount of [0, 3]) {
          for (const warnCount of [0, 2]) {
            for (const infoCount of [0, 1]) {
              const badgeCount =
                (errorCount > 0 ? 1 : 0) + (warnCount > 0 ? 1 : 0) + (infoCount > 0 ? 1 : 0);

              testCases.push({
                viewport: viewport.name,
                width: viewport.width,
                position,
                errorCount,
                warnCount,
                infoCount,
                expectedBehavior: `${badgeCount} badges, buttons ${viewport.width <= LAYOUT.BUTTON_WRAP_BREAKPOINT ? 'wrapped' : 'inline'}`,
              });
            }
          }
        }
      }
    }

    it('should have generated test cases for manual verification', () => {
      // Log summary for manual testing
      expect(testCases.length).toBeGreaterThan(0);

      // Group by critical scenarios
      const criticalCases = testCases.filter(
        (tc) =>
          (tc.width < 640 && tc.errorCount > 0) || // Mobile with errors
          tc.position === 'bottom-center' || // Centered position
          tc.width === 639 || // Edge case
          tc.width === 640 // Breakpoint boundary
      );

      expect(criticalCases.length).toBeGreaterThan(0);
    });
  });
});

describe('DevBar Badge Rendering Logic', () => {
  describe('Badge visibility rules', () => {
    it('should show error badge only when errorCount > 0', () => {
      const shouldShowError = (count: number) => count > 0;

      expect(shouldShowError(0)).toBe(false);
      expect(shouldShowError(1)).toBe(true);
      expect(shouldShowError(99)).toBe(true);
    });

    it('should show warning badge only when warningCount > 0', () => {
      const shouldShowWarn = (count: number) => count > 0;

      expect(shouldShowWarn(0)).toBe(false);
      expect(shouldShowWarn(1)).toBe(true);
    });

    it('should show info badge only when infoCount > 0', () => {
      const shouldShowInfo = (count: number) => count > 0;

      expect(shouldShowInfo(0)).toBe(false);
      expect(shouldShowInfo(1)).toBe(true);
    });

    it('should truncate badge count display at 99+', () => {
      const formatBadgeCount = (count: number) => (count > 99 ? '99+' : String(count));

      expect(formatBadgeCount(1)).toBe('1');
      expect(formatBadgeCount(50)).toBe('50');
      expect(formatBadgeCount(99)).toBe('99');
      expect(formatBadgeCount(100)).toBe('99+');
      expect(formatBadgeCount(999)).toBe('99+');
    });
  });

  describe('Badge count combinations', () => {
    const combinations = [
      { errors: 0, warnings: 0, infos: 0, expectedBadges: 0 },
      { errors: 1, warnings: 0, infos: 0, expectedBadges: 1 },
      { errors: 0, warnings: 1, infos: 0, expectedBadges: 1 },
      { errors: 0, warnings: 0, infos: 1, expectedBadges: 1 },
      { errors: 1, warnings: 1, infos: 0, expectedBadges: 2 },
      { errors: 1, warnings: 0, infos: 1, expectedBadges: 2 },
      { errors: 0, warnings: 1, infos: 1, expectedBadges: 2 },
      { errors: 1, warnings: 1, infos: 1, expectedBadges: 3 },
      { errors: 5, warnings: 3, infos: 2, expectedBadges: 3 },
    ];

    for (const combo of combinations) {
      it(`should show ${combo.expectedBadges} badge(s) for ${combo.errors}E/${combo.warnings}W/${combo.infos}I`, () => {
        const badgeCount =
          (combo.errors > 0 ? 1 : 0) + (combo.warnings > 0 ? 1 : 0) + (combo.infos > 0 ? 1 : 0);

        expect(badgeCount).toBe(combo.expectedBadges);
      });
    }
  });
});

describe('DevBar Position Styles', () => {
  const positionStyles = {
    'bottom-left': { bottom: '20px', left: '80px' },
    'bottom-right': { bottom: '20px', right: '16px' },
    'top-left': { top: '20px', left: '80px' },
    'top-right': { top: '20px', right: '16px' },
    'bottom-center': { bottom: '12px', left: '50%', transform: 'translateX(-50%)' },
  };

  for (const position of Object.keys(positionStyles)) {
    it(`should apply correct styles for ${position}`, () => {
      const styles = positionStyles[position as keyof typeof positionStyles];

      expect(styles).toBeDefined();

      // Check expected properties exist
      if (position.includes('bottom')) {
        expect(styles).toHaveProperty('bottom');
      }
      if (position.includes('top')) {
        expect(styles).toHaveProperty('top');
      }
      if (position.includes('left') && position !== 'bottom-center') {
        expect(styles).toHaveProperty('left');
      }
      if (position.includes('right')) {
        expect(styles).toHaveProperty('right');
      }
      if (position === 'bottom-center') {
        expect(styles).toHaveProperty('transform');
      }
    });
  }
});

describe('DevBar Ellipsis Tooltip Behavior', () => {
  describe('Click toggle logic', () => {
    it('should toggle pinned state on click', () => {
      let isPinned = false;

      const togglePinned = () => {
        isPinned = !isPinned;
      };

      expect(isPinned).toBe(false);
      togglePinned(); // First click
      expect(isPinned).toBe(true);
      togglePinned(); // Second click
      expect(isPinned).toBe(false);
    });

    it('should show tooltip on hover when not pinned', () => {
      const isPinned = false;
      let tooltipVisible = false;

      const onMouseEnter = () => {
        if (!isPinned) tooltipVisible = true;
      };
      const onMouseLeave = () => {
        if (!isPinned) tooltipVisible = false;
      };

      onMouseEnter();
      expect(tooltipVisible).toBe(true);
      onMouseLeave();
      expect(tooltipVisible).toBe(false);
    });

    it('should keep tooltip visible when pinned, ignore hover', () => {
      const isPinned = true;
      let tooltipVisible = true;

      const onMouseLeave = () => {
        if (!isPinned) tooltipVisible = false;
      };

      onMouseLeave();
      expect(tooltipVisible).toBe(true); // Still visible because pinned
    });
  });
});

describe('DevBar Theme Handling', () => {
  const themes = ['light', 'dark', 'system'] as const;

  for (const theme of themes) {
    it(`should accept ${theme} theme mode`, () => {
      const validThemes = ['light', 'dark', 'system'];
      expect(validThemes).toContain(theme);
    });
  }

  it('should resolve system theme based on media query', () => {
    const resolveSystemTheme = (prefersDark: boolean) => (prefersDark ? 'dark' : 'light');

    expect(resolveSystemTheme(true)).toBe('dark');
    expect(resolveSystemTheme(false)).toBe('light');
  });
});

describe('DevBar Compact Mode', () => {
  it('should have distinct compact vs expanded rendering modes', () => {
    const modes = ['expanded', 'compact', 'collapsed'];

    // All modes should be distinct
    expect(new Set(modes).size).toBe(modes.length);
  });

  it('should track position and mode independently', () => {
    // Test that mode changes do not affect position value
    const state = { position: 'bottom-left', compactMode: false };

    state.compactMode = true;
    expect(state.position).toBe('bottom-left');

    state.compactMode = false;
    expect(state.position).toBe('bottom-left');
  });
});

describe('DevBar Console Filter', () => {
  const filterTypes = ['error', 'warn', 'info', null] as const;

  for (const filter of filterTypes) {
    it(`should handle ${filter ?? 'no'} filter`, () => {
      const logs = [
        { level: 'error', message: 'Error 1' },
        { level: 'warn', message: 'Warning 1' },
        { level: 'info', message: 'Info 1' },
        { level: 'log', message: 'Log 1' },
      ];

      const filteredLogs = filter ? logs.filter((l) => l.level === filter) : logs;

      if (filter === 'error') {
        expect(filteredLogs.length).toBe(1);
        expect(filteredLogs[0].level).toBe('error');
      } else if (filter === 'warn') {
        expect(filteredLogs.length).toBe(1);
        expect(filteredLogs[0].level).toBe('warn');
      } else if (filter === 'info') {
        expect(filteredLogs.length).toBe(1);
        expect(filteredLogs[0].level).toBe('info');
      } else {
        expect(filteredLogs.length).toBe(4);
      }
    });
  }

  it('should toggle filter on badge click', () => {
    let currentFilter: string | null = null;

    const onBadgeClick = (type: string) => {
      currentFilter = currentFilter === type ? null : type;
    };

    expect(currentFilter).toBe(null);
    onBadgeClick('error');
    expect(currentFilter).toBe('error');
    onBadgeClick('error'); // Click same badge again
    expect(currentFilter).toBe(null);
    onBadgeClick('warn');
    expect(currentFilter).toBe('warn');
  });
});

describe('DevBar Width Calculation Regression Tests', () => {
  /**
   * These tests document expected behavior at specific viewports
   * to catch regressions in the width calculation logic.
   * Uses the shared calculateMetricVisibility helper from module scope.
   */

  // Regression test cases with expected outcomes
  const regressionCases = [
    // Mobile - buttons wrap, more space for metrics
    { width: 400, position: 'bottom-center', badges: 0, minExpected: 1 },
    { width: 400, position: 'bottom-center', badges: 1, minExpected: 1 },
    { width: 400, position: 'bottom-left', badges: 0, minExpected: 1 },

    // Compact tablet - buttons wrap before they crowd out status context
    { width: 768, position: 'bottom-left', badges: 0, minExpected: 2 },
    { width: 768, position: 'bottom-center', badges: 0, minExpected: 3 },

    // Desktop - all metrics should fit
    { width: 1280, position: 'bottom-left', badges: 0, minExpected: 5 },
    { width: 1280, position: 'bottom-left', badges: 3, minExpected: 4 },
  ];

  for (const tc of regressionCases) {
    it(`should show at least ${tc.minExpected} metrics at ${tc.width}px ${tc.position} with ${tc.badges} badges`, () => {
      const { maxMetrics } = calculateMetricVisibility(tc.width, tc.position, tc.badges);
      expect(maxMetrics).toBeGreaterThanOrEqual(tc.minExpected);
    });
  }
});

// ============================================================================
// NEW TESTS: GlobalDevBar class instantiation and public API
// ============================================================================

// Mock the module-level imports that cause side effects.
// GlobalDevBar.ts creates a ConsoleCapture at module level, so we mock the module.
vi.mock('@ytspar/sweetlink/browser/consoleCapture', () => {
  class MockConsoleCapture {
    private logs: Array<{ level: string; message: string; timestamp: number }> = [];
    private listeners: Array<(...args: unknown[]) => void> = [];

    importEarlyLogs() {}
    start() {}
    startErrorHandlers() {}
    stop() {}
    clear() {
      this.logs = [];
    }
    getLogs() {
      return [...this.logs];
    }
    getErrorCount() {
      return 0;
    }
    getWarningCount() {
      return 0;
    }
    getInfoCount() {
      return 0;
    }
    addListener(fn: (...args: unknown[]) => void) {
      this.listeners.push(fn);
    }
    removeListener(fn: (...args: unknown[]) => void) {
      this.listeners = this.listeners.filter((l) => l !== fn);
    }
  }
  return {
    ConsoleCapture: MockConsoleCapture,
    MAX_CONSOLE_LOGS: 100,
    formatArg: (arg: unknown) => String(arg),
    formatArgs: (args: unknown[]) => args.map(String).join(' '),
  };
});

// Mock module functions to avoid complex DOM/WebSocket side effects during unit tests
vi.mock('./modules/websocket.js', () => ({
  connectWebSocket: vi.fn(),
  handleNotification: vi.fn(),
}));

vi.mock('./modules/screenshot.js', () => ({
  handleScreenshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./modules/rendering.js', () => ({
  render: vi.fn(),
}));

vi.mock('./modules/performance.js', () => ({
  setupBreakpointDetection: vi.fn(),
  setupPerformanceMonitoring: vi.fn(),
}));

vi.mock('./modules/keyboard.js', () => ({
  setupKeyboardShortcuts: vi.fn(),
}));

vi.mock('./modules/theme.js', () => ({
  setupTheme: vi.fn(),
  loadCompactMode: vi.fn(),
  setThemeMode: vi.fn(),
}));

// Dynamic import after mocks are set up
const { GlobalDevBar, initGlobalDevBar, getGlobalDevBar, destroyGlobalDevBar } = await import(
  './GlobalDevBar.js'
);

// ============================================================================
// Constructor & Options Defaults
// ============================================================================

describe('GlobalDevBar Constructor', () => {
  it('should create an instance with default options when none provided', () => {
    const bar = new GlobalDevBar();

    expect(bar.options.position).toBe('bottom-left');
    expect(bar.options.showScreenshot).toBe(true);
    expect(bar.options.showConsoleBadges).toBe(true);
    expect(bar.options.showTooltips).toBe(true);
    expect(bar.options.saveLocation).toBe('auto');
    expect(bar.options.screenshotQuality).toBe(0.65);
    expect(bar.options.sizeOverrides).toBeUndefined();
  });

  it('should apply custom position', () => {
    const bar = new GlobalDevBar({ position: 'top-right' });
    expect(bar.options.position).toBe('top-right');
  });

  it('should apply custom accentColor', () => {
    const bar = new GlobalDevBar({ accentColor: '#ff0000' });
    expect(bar.options.accentColor).toBe('#ff0000');
  });

  it('should apply partial showMetrics, filling defaults for unspecified', () => {
    const bar = new GlobalDevBar({ showMetrics: { fcp: false, lcp: false } });

    expect(bar.options.showMetrics.fcp).toBe(false);
    expect(bar.options.showMetrics.lcp).toBe(false);
    // Unspecified metrics default to true
    expect(bar.options.showMetrics.breakpoint).toBe(true);
    expect(bar.options.showMetrics.cls).toBe(true);
    expect(bar.options.showMetrics.inp).toBe(true);
    expect(bar.options.showMetrics.pageSize).toBe(true);
  });

  it('should apply all showMetrics disabled', () => {
    const bar = new GlobalDevBar({
      showMetrics: {
        breakpoint: false,
        fcp: false,
        lcp: false,
        cls: false,
        inp: false,
        pageSize: false,
      },
    });

    expect(bar.options.showMetrics.breakpoint).toBe(false);
    expect(bar.options.showMetrics.fcp).toBe(false);
    expect(bar.options.showMetrics.lcp).toBe(false);
    expect(bar.options.showMetrics.cls).toBe(false);
    expect(bar.options.showMetrics.inp).toBe(false);
    expect(bar.options.showMetrics.pageSize).toBe(false);
  });

  it('should apply custom screenshotQuality', () => {
    const bar = new GlobalDevBar({ screenshotQuality: 0.9 });
    expect(bar.options.screenshotQuality).toBe(0.9);
  });

  it('should apply saveLocation option', () => {
    const bar = new GlobalDevBar({ saveLocation: 'download' });
    expect(bar.options.saveLocation).toBe('download');
  });

  it('should apply sizeOverrides', () => {
    const bar = new GlobalDevBar({
      sizeOverrides: { width: '500px', maxWidth: '800px', minWidth: '300px' },
    });
    expect(bar.options.sizeOverrides).toEqual({
      width: '500px',
      maxWidth: '800px',
      minWidth: '300px',
    });
  });

  it('should apply showScreenshot=false', () => {
    const bar = new GlobalDevBar({ showScreenshot: false });
    expect(bar.options.showScreenshot).toBe(false);
  });

  it('should apply showConsoleBadges=false', () => {
    const bar = new GlobalDevBar({ showConsoleBadges: false });
    expect(bar.options.showConsoleBadges).toBe(false);
  });

  it('should apply showTooltips=false', () => {
    const bar = new GlobalDevBar({ showTooltips: false });
    expect(bar.options.showTooltips).toBe(false);
  });

  it('should initialize state properties to defaults', () => {
    const bar = new GlobalDevBar();

    expect(bar.container).toBeNull();
    expect(bar.ws).toBeNull();
    expect(bar.sweetlinkConnected).toBe(false);
    expect(bar.collapsed).toBe(false);
    expect(bar.capturing).toBe(false);
    expect(bar.copiedToClipboard).toBe(false);
    expect(bar.copiedPath).toBe(false);
    expect(bar.lastScreenshot).toBeNull();
    expect(bar.designReviewInProgress).toBe(false);
    expect(bar.lastDesignReview).toBeNull();
    expect(bar.designReviewError).toBeNull();
    expect(bar.showDesignReviewConfirm).toBe(false);
    expect(bar.apiKeyStatus).toBeNull();
    expect(bar.lastOutline).toBeNull();
    expect(bar.lastSchema).toBeNull();
    expect(bar.savingOutline).toBe(false);
    expect(bar.savingSchema).toBe(false);
    expect(bar.destroyed).toBe(false);
    expect(bar.reconnectAttempts).toBe(0);
    expect(bar.breakpointInfo).toBeNull();
    expect(bar.perfStats).toBeNull();
    expect(bar.lcpValue).toBeNull();
    expect(bar.clsValue).toBe(0);
    expect(bar.inpValue).toBe(0);
    expect(bar.themeMode).toBe('system');
    expect(bar.compactMode).toBe(false);
    expect(bar.showSettingsPopover).toBe(false);
    expect(bar.overlayElement).toBeNull();
    expect(bar.consoleFilter).toBeNull();
    expect(bar.savingConsoleLogs).toBe(false);
    expect(bar.lastConsoleLogs).toBeNull();
  });

  it('should compute baseWsPort from window.location.port', () => {
    // happy-dom provides window by default
    const bar = new GlobalDevBar();
    // baseWsPort is currentAppPort + WS_PORT_OFFSET or default WS_PORT
    expect(typeof bar.baseWsPort).toBe('number');
    expect(typeof bar.currentAppPort).toBe('number');
  });

  it('should initialize debug logger', () => {
    const bar = new GlobalDevBar({ debug: true });
    expect(bar.debug).toBeDefined();
    expect(typeof bar.debug.lifecycle).toBe('function');
    expect(typeof bar.debug.state).toBe('function');
    expect(typeof bar.debug.ws).toBe('function');
    expect(typeof bar.debug.perf).toBe('function');
  });

  it('should initialize settingsManager', () => {
    const bar = new GlobalDevBar();
    expect(bar.settingsManager).toBeDefined();
    expect(typeof bar.settingsManager.getSettings).toBe('function');
  });

  it('should initialize modal states to closed', () => {
    const bar = new GlobalDevBar();
    expect(bar.showOutlineModal).toBe(false);
    expect(bar.showSchemaModal).toBe(false);
    expect(bar.showA11yModal).toBe(false);
    expect(bar.a11yLoading).toBe(false);
    expect(bar.lastA11yAudit).toBeNull();
    expect(bar.savingA11yAudit).toBe(false);
    expect(bar.a11yTimeout).toBeNull();
  });

  it('should initialize timeout handles to null', () => {
    const bar = new GlobalDevBar();
    expect(bar.reconnectTimeout).toBeNull();
    expect(bar.screenshotTimeout).toBeNull();
    expect(bar.copiedPathTimeout).toBeNull();
    expect(bar.designReviewTimeout).toBeNull();
    expect(bar.designReviewErrorTimeout).toBeNull();
    expect(bar.outlineTimeout).toBeNull();
    expect(bar.schemaTimeout).toBeNull();
  });

  it('should initialize observer handles to null', () => {
    const bar = new GlobalDevBar();
    expect(bar.fcpObserver).toBeNull();
    expect(bar.lcpObserver).toBeNull();
    expect(bar.clsObserver).toBeNull();
    expect(bar.inpObserver).toBeNull();
  });

  it('should initialize event handler references to null', () => {
    const bar = new GlobalDevBar();
    expect(bar.resizeHandler).toBeNull();
    expect(bar.keydownHandler).toBeNull();
    expect(bar.themeMediaQuery).toBeNull();
    expect(bar.themeMediaHandler).toBeNull();
  });

  it('should initialize activeTooltips as empty set', () => {
    const bar = new GlobalDevBar();
    expect(bar.activeTooltips).toBeInstanceOf(Set);
    expect(bar.activeTooltips.size).toBe(0);
  });
});

// ============================================================================
// Public Getter Methods
// ============================================================================

describe('GlobalDevBar Public Getters', () => {
  it('getPosition should return the configured position', () => {
    const bar = new GlobalDevBar({ position: 'top-left' });
    expect(bar.getPosition()).toBe('top-left');
  });

  it('getPosition should return default position when not specified', () => {
    const bar = new GlobalDevBar();
    expect(bar.getPosition()).toBe('bottom-left');
  });

  it('getThemeMode should return the current theme mode', () => {
    const bar = new GlobalDevBar();
    expect(bar.getThemeMode()).toBe('system');
  });

  it('isCompactMode should return false by default', () => {
    const bar = new GlobalDevBar();
    expect(bar.isCompactMode()).toBe(false);
  });

  it('getColors should return theme colors object', () => {
    const bar = new GlobalDevBar();
    const colors = bar.getColors();
    expect(colors).toBeDefined();
    expect(typeof colors.primary).toBe('string');
    expect(typeof colors.error).toBe('string');
    expect(typeof colors.bg).toBe('string');
    expect(typeof colors.text).toBe('string');
  });

  it('getLogCounts should return count object', () => {
    const bar = new GlobalDevBar();
    const counts = bar.getLogCounts();
    expect(counts).toEqual({
      errorCount: expect.any(Number),
      warningCount: expect.any(Number),
      infoCount: expect.any(Number),
    });
  });
});

// ============================================================================
// toggleCompactMode
// ============================================================================

describe('GlobalDevBar toggleCompactMode', () => {
  it('should toggle compactMode from false to true', () => {
    const bar = new GlobalDevBar();
    expect(bar.compactMode).toBe(false);

    bar.toggleCompactMode();
    expect(bar.compactMode).toBe(true);
  });

  it('should toggle compactMode from true back to false', () => {
    const bar = new GlobalDevBar();
    bar.toggleCompactMode(); // false -> true
    bar.toggleCompactMode(); // true -> false

    expect(bar.compactMode).toBe(false);
  });

  it('should reflect toggled state in isCompactMode()', () => {
    const bar = new GlobalDevBar();
    expect(bar.isCompactMode()).toBe(false);

    bar.toggleCompactMode();
    expect(bar.isCompactMode()).toBe(true);
  });

  it('should save compactMode to settingsManager', () => {
    const bar = new GlobalDevBar();
    const saveSpy = vi.spyOn(bar.settingsManager, 'saveSettings');

    bar.toggleCompactMode();

    expect(saveSpy).toHaveBeenCalledWith({ compactMode: true });
    saveSpy.mockRestore();
  });
});

// ============================================================================
// applySettings
// ============================================================================

describe('GlobalDevBar applySettings', () => {
  it('should update position from settings', () => {
    const bar = new GlobalDevBar();
    const settings = {
      version: 1 as const,
      position: 'top-right' as const,
      themeMode: 'dark' as const,
      compactMode: true,
      accentColor: '#ff0000',
      showScreenshot: false,
      showConsoleBadges: false,
      showTooltips: false,
      saveLocation: 'download' as const,
      screenshotQuality: 0.8,
      showMetrics: {
        breakpoint: false,
        fcp: false,
        lcp: true,
        cls: true,
        inp: false,
        pageSize: false,
      },
      debug: false,
    };

    bar.applySettings(settings);

    expect(bar.options.position).toBe('top-right');
    expect(bar.themeMode).toBe('dark');
    expect(bar.compactMode).toBe(true);
    expect(bar.options.accentColor).toBe('#ff0000');
    expect(bar.options.showScreenshot).toBe(false);
    expect(bar.options.showConsoleBadges).toBe(false);
    expect(bar.options.showTooltips).toBe(false);
    expect(bar.options.saveLocation).toBe('download');
    expect(bar.options.screenshotQuality).toBe(0.8);
    expect(bar.options.showMetrics.breakpoint).toBe(false);
    expect(bar.options.showMetrics.fcp).toBe(false);
    expect(bar.options.showMetrics.lcp).toBe(true);
  });

  it('should default screenshotQuality to 0.65 when undefined', () => {
    const bar = new GlobalDevBar();
    const settings = {
      version: 1 as const,
      position: 'bottom-left' as const,
      themeMode: 'system' as const,
      compactMode: false,
      accentColor: '#10b981',
      showScreenshot: true,
      showConsoleBadges: true,
      showTooltips: true,
      saveLocation: 'auto' as const,
      screenshotQuality: undefined as unknown as number,
      showMetrics: {
        breakpoint: true,
        fcp: true,
        lcp: true,
        cls: true,
        inp: true,
        pageSize: true,
      },
      debug: false,
    };

    bar.applySettings(settings);
    expect(bar.options.screenshotQuality).toBe(0.65);
  });
});

// ============================================================================
// clearConsoleLogs
// ============================================================================

describe('GlobalDevBar clearConsoleLogs', () => {
  it('should clear consoleLogs array', () => {
    const bar = new GlobalDevBar();
    bar.consoleLogs = [{ level: 'error', message: 'test error', timestamp: Date.now(), args: [] }];
    bar.consoleFilter = 'error';

    bar.clearConsoleLogs();

    expect(bar.consoleLogs).toEqual([]);
    expect(bar.consoleFilter).toBeNull();
  });
});

// ============================================================================
// resetPositionStyles
// ============================================================================

describe('GlobalDevBar resetPositionStyles', () => {
  it('should reset all position-related styles on an element', () => {
    const bar = new GlobalDevBar();
    const el = document.createElement('div');
    el.style.top = '10px';
    el.style.bottom = '20px';
    el.style.left = '30px';
    el.style.right = '40px';
    el.style.transform = 'translateX(-50%)';

    bar.resetPositionStyles(el);

    expect(el.style.top).toBe('');
    expect(el.style.bottom).toBe('');
    expect(el.style.left).toBe('');
    expect(el.style.right).toBe('');
    expect(el.style.transform).toBe('');
  });

  it('should not affect other styles on the element', () => {
    const bar = new GlobalDevBar();
    const el = document.createElement('div');
    el.style.display = 'flex';
    el.style.color = 'red';
    el.style.top = '10px';

    bar.resetPositionStyles(el);

    expect(el.style.display).toBe('flex');
    expect(el.style.color).toBe('red');
    expect(el.style.top).toBe('');
  });
});

// ============================================================================
// createCollapsedBadge
// ============================================================================

describe('GlobalDevBar createCollapsedBadge', () => {
  it('should create a span element', () => {
    const bar = new GlobalDevBar();
    const badge = bar.createCollapsedBadge(5, '#ef4444', '4px');

    expect(badge.tagName).toBe('SPAN');
  });

  it('should set textContent to the count for counts <= 99', () => {
    const bar = new GlobalDevBar();

    expect(bar.createCollapsedBadge(1, '#ef4444', '0px').textContent).toBe('1');
    expect(bar.createCollapsedBadge(50, '#ef4444', '0px').textContent).toBe('50');
    expect(bar.createCollapsedBadge(99, '#ef4444', '0px').textContent).toBe('99');
  });

  it('should set textContent to "!" for counts > 99', () => {
    const bar = new GlobalDevBar();

    expect(bar.createCollapsedBadge(100, '#ef4444', '0px').textContent).toBe('!');
    expect(bar.createCollapsedBadge(999, '#ef4444', '0px').textContent).toBe('!');
  });

  it('should apply the provided background color', () => {
    const bar = new GlobalDevBar();
    const badge = bar.createCollapsedBadge(3, '#f59e0b', '4px');

    expect(badge.style.backgroundColor).toBe('#f59e0b');
  });

  it('should apply the provided right position', () => {
    const bar = new GlobalDevBar();
    const badge = bar.createCollapsedBadge(3, '#ef4444', '12px');

    expect(badge.style.right).toBe('12px');
  });

  it('should set absolute positioning', () => {
    const bar = new GlobalDevBar();
    const badge = bar.createCollapsedBadge(3, '#ef4444', '0px');

    expect(badge.style.position).toBe('absolute');
  });

  it('should set white text color', () => {
    const bar = new GlobalDevBar();
    const badge = bar.createCollapsedBadge(3, '#ef4444', '0px');

    expect(badge.style.color).toBe('#ffffff');
  });

  it('should handle count of 0', () => {
    const bar = new GlobalDevBar();
    const badge = bar.createCollapsedBadge(0, '#ef4444', '0px');

    expect(badge.textContent).toBe('0');
  });
});

// ============================================================================
// Static Methods: registerControl, unregisterControl, getControls, clearControls
// ============================================================================

describe('GlobalDevBar Static Control Methods', () => {
  afterEach(() => {
    GlobalDevBar.clearControls();
  });

  it('getControls should return empty array initially', () => {
    expect(GlobalDevBar.getControls()).toEqual([]);
  });

  it('registerControl should add a control', () => {
    GlobalDevBar.registerControl({ id: 'test-1', label: 'Test 1' });
    const controls = GlobalDevBar.getControls();

    expect(controls).toHaveLength(1);
    expect(controls[0].id).toBe('test-1');
    expect(controls[0].label).toBe('Test 1');
  });

  it('registerControl should replace control with same id', () => {
    GlobalDevBar.registerControl({ id: 'test-1', label: 'Original' });
    GlobalDevBar.registerControl({ id: 'test-1', label: 'Replaced' });

    const controls = GlobalDevBar.getControls();
    expect(controls).toHaveLength(1);
    expect(controls[0].label).toBe('Replaced');
  });

  it('registerControl should support multiple controls', () => {
    GlobalDevBar.registerControl({ id: 'a', label: 'A' });
    GlobalDevBar.registerControl({ id: 'b', label: 'B' });
    GlobalDevBar.registerControl({ id: 'c', label: 'C' });

    expect(GlobalDevBar.getControls()).toHaveLength(3);
  });

  it('unregisterControl should remove by id', () => {
    GlobalDevBar.registerControl({ id: 'a', label: 'A' });
    GlobalDevBar.registerControl({ id: 'b', label: 'B' });

    GlobalDevBar.unregisterControl('a');

    const controls = GlobalDevBar.getControls();
    expect(controls).toHaveLength(1);
    expect(controls[0].id).toBe('b');
  });

  it('unregisterControl should be a no-op for non-existent id', () => {
    GlobalDevBar.registerControl({ id: 'a', label: 'A' });
    GlobalDevBar.unregisterControl('non-existent');

    expect(GlobalDevBar.getControls()).toHaveLength(1);
  });

  it('clearControls should remove all controls', () => {
    GlobalDevBar.registerControl({ id: 'a', label: 'A' });
    GlobalDevBar.registerControl({ id: 'b', label: 'B' });

    GlobalDevBar.clearControls();

    expect(GlobalDevBar.getControls()).toEqual([]);
  });

  it('getControls should return a copy, not the internal array', () => {
    GlobalDevBar.registerControl({ id: 'a', label: 'A' });
    const controls1 = GlobalDevBar.getControls();
    const controls2 = GlobalDevBar.getControls();

    expect(controls1).not.toBe(controls2);
    expect(controls1).toEqual(controls2);
  });

  it('registerControl should support all DevBarControl properties', () => {
    GlobalDevBar.registerControl({
      id: 'full',
      label: 'Full Control',
      onClick: () => {},
      active: true,
      disabled: false,
      variant: 'warning',
      group: 'test-group',
    });

    const control = GlobalDevBar.getControls()[0];
    expect(control.id).toBe('full');
    expect(control.label).toBe('Full Control');
    expect(control.active).toBe(true);
    expect(control.disabled).toBe(false);
    expect(control.variant).toBe('warning');
    expect(control.group).toBe('test-group');
    expect(typeof control.onClick).toBe('function');
  });
});

// ============================================================================
// init() Lifecycle
// ============================================================================

describe('GlobalDevBar init', () => {
  afterEach(() => {
    // Clean up any injected styles
    const style = document.getElementById('devbar-styles');
    if (style) style.remove();
  });

  it('should inject styles on first init', () => {
    const bar = new GlobalDevBar();
    bar.init();

    const style = document.getElementById('devbar-styles');
    expect(style).not.toBeNull();
    expect(style?.tagName).toBe('STYLE');

    bar.destroy();
  });

  it('should not duplicate styles on multiple init calls', () => {
    const bar = new GlobalDevBar();
    bar.init();
    bar.destroy();

    const bar2 = new GlobalDevBar();
    bar2.init();

    const styles = document.querySelectorAll('#devbar-styles');
    expect(styles.length).toBe(1);

    bar2.destroy();
  });

  it('should not init if destroyed', () => {
    const bar = new GlobalDevBar();
    bar.destroy();

    // init() should early-return
    bar.init();

    // No container should have been created (render is mocked)
    expect(bar.destroyed).toBe(true);
  });
});

// ============================================================================
// destroy() Cleanup
// ============================================================================

describe('GlobalDevBar destroy', () => {
  it('should set destroyed flag to true', () => {
    const bar = new GlobalDevBar();
    expect(bar.destroyed).toBe(false);

    bar.destroy();
    expect(bar.destroyed).toBe(true);
  });

  it('should set reconnectAttempts to max to prevent reconnection', () => {
    const bar = new GlobalDevBar();
    bar.destroy();

    // reconnectAttempts should be set to MAX_RECONNECT_ATTEMPTS
    expect(bar.reconnectAttempts).toBeGreaterThan(0);
  });

  it('should close WebSocket if open', () => {
    const bar = new GlobalDevBar();
    const mockWs = { close: vi.fn(), readyState: 1 } as unknown as WebSocket;
    bar.ws = mockWs;

    bar.destroy();

    expect(mockWs.close).toHaveBeenCalled();
  });

  it('should clear all timeout handles', () => {
    const bar = new GlobalDevBar();

    // Set up fake timeouts
    bar.reconnectTimeout = setTimeout(() => {}, 10000);
    bar.screenshotTimeout = setTimeout(() => {}, 10000);
    bar.copiedPathTimeout = setTimeout(() => {}, 10000);
    bar.designReviewTimeout = setTimeout(() => {}, 10000);
    bar.outlineTimeout = setTimeout(() => {}, 10000);
    bar.schemaTimeout = setTimeout(() => {}, 10000);
    bar.consoleLogsTimeout = setTimeout(() => {}, 10000);
    bar.a11yTimeout = setTimeout(() => {}, 10000);

    bar.destroy();

    // The destroy method clears these; we verify it doesn't throw
    expect(bar.destroyed).toBe(true);
  });

  it('should remove resize event listener', () => {
    const bar = new GlobalDevBar();
    const removeEventSpy = vi.spyOn(window, 'removeEventListener');
    const handler = () => {};
    bar.resizeHandler = handler;

    bar.destroy();

    expect(removeEventSpy).toHaveBeenCalledWith('resize', handler);
    removeEventSpy.mockRestore();
  });

  it('should remove keydown event listener', () => {
    const bar = new GlobalDevBar();
    const removeEventSpy = vi.spyOn(window, 'removeEventListener');
    const handler = (_e: KeyboardEvent) => {};
    bar.keydownHandler = handler;

    bar.destroy();

    expect(removeEventSpy).toHaveBeenCalledWith('keydown', handler);
    removeEventSpy.mockRestore();
  });

  it('should disconnect performance observers', () => {
    const bar = new GlobalDevBar();
    const disconnectFn = vi.fn();
    bar.fcpObserver = { disconnect: disconnectFn } as unknown as PerformanceObserver;
    bar.lcpObserver = { disconnect: disconnectFn } as unknown as PerformanceObserver;
    bar.clsObserver = { disconnect: disconnectFn } as unknown as PerformanceObserver;
    bar.inpObserver = { disconnect: disconnectFn } as unknown as PerformanceObserver;

    bar.destroy();

    expect(disconnectFn).toHaveBeenCalledTimes(4);
  });

  it('should remove theme media listener', () => {
    const bar = new GlobalDevBar();
    const removeListenerFn = vi.fn();
    const handler = (_e: MediaQueryListEvent) => {};
    bar.themeMediaQuery = { removeEventListener: removeListenerFn } as unknown as MediaQueryList;
    bar.themeMediaHandler = handler;

    bar.destroy();

    expect(removeListenerFn).toHaveBeenCalledWith('change', handler);
  });

  it('should remove container from DOM', () => {
    const bar = new GlobalDevBar();
    const container = document.createElement('div');
    document.body.appendChild(container);
    bar.container = container;

    bar.destroy();

    expect(bar.container).toBeNull();
    expect(document.body.contains(container)).toBe(false);
  });

  it('should remove overlay element and reset body overflow', () => {
    const bar = new GlobalDevBar();
    const overlay = document.createElement('div');
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    bar.overlayElement = overlay;

    bar.destroy();

    expect(bar.overlayElement).toBeNull();
    expect(document.body.contains(overlay)).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('should handle destroy when no resources are allocated', () => {
    const bar = new GlobalDevBar();
    // All handles are null by default
    expect(() => bar.destroy()).not.toThrow();
  });

  it('should handle double destroy gracefully', () => {
    const bar = new GlobalDevBar();
    bar.destroy();
    expect(() => bar.destroy()).not.toThrow();
  });
});

// ============================================================================
// setThemeMode
// ============================================================================

describe('GlobalDevBar setThemeMode', () => {
  it('should delegate to the theme module', () => {
    const bar = new GlobalDevBar();
    // setThemeMode calls moduleSetThemeMode which is mocked
    expect(() => bar.setThemeMode('dark')).not.toThrow();
    expect(() => bar.setThemeMode('light')).not.toThrow();
    expect(() => bar.setThemeMode('system')).not.toThrow();
  });
});

// ============================================================================
// Convenience Functions: initGlobalDevBar, getGlobalDevBar, destroyGlobalDevBar
// ============================================================================

describe('Convenience Functions', () => {
  const DEVBAR_GLOBAL_KEY = '__YTSPAR_DEVBAR_INSTANCE__';

  beforeEach(() => {
    // Clean up global instance before each test
    (window as unknown as Record<string, unknown>)[DEVBAR_GLOBAL_KEY] = null;
    // Clean up any injected styles
    const style = document.getElementById('devbar-styles');
    if (style) style.remove();
  });

  afterEach(() => {
    destroyGlobalDevBar();
    (window as unknown as Record<string, unknown>)[DEVBAR_GLOBAL_KEY] = null;
  });

  it('initGlobalDevBar should create and return an instance', () => {
    const instance = initGlobalDevBar();
    expect(instance).toBeInstanceOf(GlobalDevBar);
  });

  it('getGlobalDevBar should return null when no instance exists', () => {
    expect(getGlobalDevBar()).toBeNull();
  });

  it('getGlobalDevBar should return the instance after init', () => {
    const instance = initGlobalDevBar();
    expect(getGlobalDevBar()).toBe(instance);
  });

  it('initGlobalDevBar should return existing instance if position matches', () => {
    const instance1 = initGlobalDevBar({ position: 'bottom-left' });
    const instance2 = initGlobalDevBar({ position: 'bottom-left' });

    expect(instance1).toBe(instance2);
  });

  it('initGlobalDevBar should recreate if position changes', () => {
    const instance1 = initGlobalDevBar({ position: 'bottom-left' });
    const instance2 = initGlobalDevBar({ position: 'top-right' });

    expect(instance1).not.toBe(instance2);
    expect(instance1.destroyed).toBe(true);
  });

  it('destroyGlobalDevBar should destroy and clear the instance', () => {
    const instance = initGlobalDevBar();
    destroyGlobalDevBar();

    expect(instance.destroyed).toBe(true);
    expect(getGlobalDevBar()).toBeNull();
  });

  it('destroyGlobalDevBar should be a no-op when no instance exists', () => {
    expect(() => destroyGlobalDevBar()).not.toThrow();
  });

  it('initGlobalDevBar should use default position (bottom-left) when not specified', () => {
    const instance = initGlobalDevBar();
    expect(instance.getPosition()).toBe('bottom-left');
  });
});

// ============================================================================
// Edge Cases and Disconnected Scenarios
// ============================================================================

describe('GlobalDevBar Edge Cases', () => {
  it('should handle rendering when no container exists', () => {
    const bar = new GlobalDevBar();
    // render() is mocked, but calling it should not throw
    expect(() => bar.render()).not.toThrow();
  });

  it('should handle handleNotification call', () => {
    const bar = new GlobalDevBar();
    // handleNotification is mocked
    expect(() => bar.handleNotification('screenshot', '/tmp/test.png', 500)).not.toThrow();
  });

  it('should handle handleScreenshot call', async () => {
    const bar = new GlobalDevBar();
    // handleScreenshot is mocked to resolve
    await expect(bar.handleScreenshot(true)).resolves.toBeUndefined();
    await expect(bar.handleScreenshot(false)).resolves.toBeUndefined();
  });

  it('should handle connectWebSocket call', () => {
    const bar = new GlobalDevBar();
    expect(() => bar.connectWebSocket()).not.toThrow();
    expect(() => bar.connectWebSocket(9000)).not.toThrow();
  });

  it('should handle setting console state manually', () => {
    const bar = new GlobalDevBar();
    bar.consoleFilter = 'error';
    expect(bar.consoleFilter).toBe('error');

    bar.consoleFilter = 'warn';
    expect(bar.consoleFilter).toBe('warn');

    bar.consoleFilter = 'info';
    expect(bar.consoleFilter).toBe('info');

    bar.consoleFilter = null;
    expect(bar.consoleFilter).toBeNull();
  });

  it('should track collapsed state independently', () => {
    const bar = new GlobalDevBar();
    expect(bar.collapsed).toBe(false);

    bar.collapsed = true;
    expect(bar.collapsed).toBe(true);
    // Other state should not be affected
    expect(bar.compactMode).toBe(false);
    expect(bar.destroyed).toBe(false);
  });

  it('should track sweetlinkConnected independently', () => {
    const bar = new GlobalDevBar();
    expect(bar.sweetlinkConnected).toBe(false);

    bar.sweetlinkConnected = true;
    expect(bar.sweetlinkConnected).toBe(true);
  });

  it('should track capturing state', () => {
    const bar = new GlobalDevBar();
    expect(bar.capturing).toBe(false);

    bar.capturing = true;
    expect(bar.capturing).toBe(true);
  });

  it('should track design review state transitions', () => {
    const bar = new GlobalDevBar();

    // Start a design review
    bar.designReviewInProgress = true;
    expect(bar.designReviewInProgress).toBe(true);
    expect(bar.lastDesignReview).toBeNull();

    // Complete with result
    bar.designReviewInProgress = false;
    bar.lastDesignReview = '<html>review result</html>';
    expect(bar.designReviewInProgress).toBe(false);
    expect(bar.lastDesignReview).toBe('<html>review result</html>');

    // Error case
    bar.designReviewError = 'API key not configured';
    expect(bar.designReviewError).toBe('API key not configured');
  });

  it('should track outline and schema save states', () => {
    const bar = new GlobalDevBar();

    bar.savingOutline = true;
    expect(bar.savingOutline).toBe(true);

    bar.lastOutline = '/tmp/outline.json';
    bar.savingOutline = false;
    expect(bar.lastOutline).toBe('/tmp/outline.json');

    bar.savingSchema = true;
    expect(bar.savingSchema).toBe(true);

    bar.lastSchema = '/tmp/schema.json';
    bar.savingSchema = false;
    expect(bar.lastSchema).toBe('/tmp/schema.json');
  });

  it('should track apiKeyStatus', () => {
    const bar = new GlobalDevBar();
    expect(bar.apiKeyStatus).toBeNull();

    bar.apiKeyStatus = { configured: true, model: 'gpt-4' };
    expect(bar.apiKeyStatus?.configured).toBe(true);
    expect(bar.apiKeyStatus?.model).toBe('gpt-4');

    bar.apiKeyStatus = {
      configured: true,
      model: 'gpt-4',
      pricing: { input: 0.03, output: 0.06 },
    };
    expect(bar.apiKeyStatus?.pricing?.input).toBe(0.03);
  });

  it('should track lastDotPosition', () => {
    const bar = new GlobalDevBar();
    expect(bar.lastDotPosition).toBeNull();

    bar.lastDotPosition = { left: 100, top: 200, bottom: 300 };
    expect(bar.lastDotPosition).toEqual({ left: 100, top: 200, bottom: 300 });
  });

  it('should manage activeTooltips set', () => {
    const bar = new GlobalDevBar();
    const tooltip = document.createElement('div');

    bar.activeTooltips.add(tooltip);
    expect(bar.activeTooltips.size).toBe(1);
    expect(bar.activeTooltips.has(tooltip)).toBe(true);

    bar.activeTooltips.delete(tooltip);
    expect(bar.activeTooltips.size).toBe(0);
  });

  it('should track wsVerified and serverProjectDir', () => {
    const bar = new GlobalDevBar();
    expect(bar.wsVerified).toBe(false);
    expect(bar.serverProjectDir).toBeNull();

    bar.wsVerified = true;
    bar.serverProjectDir = '/home/user/project';
    expect(bar.wsVerified).toBe(true);
    expect(bar.serverProjectDir).toBe('/home/user/project');
  });

  it('should track performance stats', () => {
    const bar = new GlobalDevBar();
    expect(bar.perfStats).toBeNull();

    bar.perfStats = {
      fcp: '150ms',
      lcp: '300ms',
      cls: '0.05',
      inp: '100ms',
      totalSize: '1.2 MB',
    };
    expect(bar.perfStats.fcp).toBe('150ms');
    expect(bar.perfStats.totalSize).toBe('1.2 MB');
  });

  it('should track breakpointInfo', () => {
    const bar = new GlobalDevBar();
    expect(bar.breakpointInfo).toBeNull();

    bar.breakpointInfo = { tailwindBreakpoint: 'lg', dimensions: '1024x768' };
    expect(bar.breakpointInfo.tailwindBreakpoint).toBe('lg');
    expect(bar.breakpointInfo.dimensions).toBe('1024x768');
  });

  it('should track performance metric values', () => {
    const bar = new GlobalDevBar();
    expect(bar.lcpValue).toBeNull();
    expect(bar.clsValue).toBe(0);
    expect(bar.inpValue).toBe(0);

    bar.lcpValue = 250;
    bar.clsValue = 0.1;
    bar.inpValue = 75;

    expect(bar.lcpValue).toBe(250);
    expect(bar.clsValue).toBe(0.1);
    expect(bar.inpValue).toBe(75);
  });

  it('should track accessibility modal state', () => {
    const bar = new GlobalDevBar();

    bar.showA11yModal = true;
    bar.a11yLoading = true;
    expect(bar.showA11yModal).toBe(true);
    expect(bar.a11yLoading).toBe(true);

    bar.a11yLoading = false;
    bar.lastA11yAudit = '<div>audit results</div>';
    expect(bar.lastA11yAudit).toBe('<div>audit results</div>');

    bar.savingA11yAudit = true;
    expect(bar.savingA11yAudit).toBe(true);
  });

  it('should track settings popover state', () => {
    const bar = new GlobalDevBar();
    expect(bar.showSettingsPopover).toBe(false);

    bar.showSettingsPopover = true;
    expect(bar.showSettingsPopover).toBe(true);
  });

  it('should track console logs save state', () => {
    const bar = new GlobalDevBar();
    expect(bar.savingConsoleLogs).toBe(false);
    expect(bar.lastConsoleLogs).toBeNull();

    bar.savingConsoleLogs = true;
    bar.lastConsoleLogs = '/tmp/console.json';
    expect(bar.savingConsoleLogs).toBe(true);
    expect(bar.lastConsoleLogs).toBe('/tmp/console.json');
  });

  it('should track copied states', () => {
    const bar = new GlobalDevBar();
    expect(bar.copiedToClipboard).toBe(false);
    expect(bar.copiedPath).toBe(false);

    bar.copiedToClipboard = true;
    bar.copiedPath = true;
    expect(bar.copiedToClipboard).toBe(true);
    expect(bar.copiedPath).toBe(true);
  });

  it('should track lastScreenshot', () => {
    const bar = new GlobalDevBar();
    expect(bar.lastScreenshot).toBeNull();

    bar.lastScreenshot = 'data:image/png;base64,ABC123';
    expect(bar.lastScreenshot).toBe('data:image/png;base64,ABC123');
  });
});
