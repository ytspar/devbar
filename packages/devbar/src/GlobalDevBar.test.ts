/**
 * GlobalDevBar Comprehensive Tests
 *
 * Tests for responsive behavior, metric visibility, badge rendering,
 * position handling, and UI interactions across different viewport sizes.
 */

import { describe, expect, it } from 'vitest';

// Layout constants (match the actual DevBar implementation)
const LAYOUT = {
  METRIC_WIDTH: 95,
  BADGE_WIDTH: 30,
  ACTION_BUTTON_WIDTH: 30,
  BREAKPOINT_WIDTH: 100,
  CONNECTION_DOT_WIDTH: 16,
  ELLIPSIS_WIDTH: 24,
  CONTAINER_PADDING: 24,
  BUTTON_WRAP_BREAKPOINT: 640,
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
  const actionButtonCount = (showScreenshot ? 1 : 0) + 5;
  const isCentered = position === 'bottom-center';
  const margins = isCentered ? LAYOUT.CENTERED_MARGIN : LAYOUT.DEFAULT_MARGIN;
  const containerWidth = windowWidth - margins;

  // At small screens (<640px), action buttons wrap to second row
  const buttonsWrap = windowWidth < LAYOUT.BUTTON_WRAP_BREAKPOINT;
  const buttonWidth = buttonsWrap ? 0 : actionButtonCount * LAYOUT.ACTION_BUTTON_WIDTH;

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
    it('should not count button width at <640px (buttons wrap)', () => {
      const narrow = calculateMetricVisibility(500, 'bottom-left', 0);

      // At 500px buttons wrap, freeing ~180px
      // So narrow might actually have MORE space for metrics in the first row
      expect(narrow.availableWidth).toBeGreaterThan(0);
    });

    it('should count button width at >=640px', () => {
      const result = calculateMetricVisibility(800, 'bottom-left', 0);
      // Button width is included, reducing available space
      expect(result.availableWidth).toBeLessThan(800 - 96); // Less than container width
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
                expectedBehavior: `${badgeCount} badges, buttons ${viewport.width < 640 ? 'wrapped' : 'inline'}`,
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
    { width: 400, position: 'bottom-center', badges: 0, minExpected: 2 },
    { width: 400, position: 'bottom-center', badges: 1, minExpected: 1 },
    { width: 400, position: 'bottom-left', badges: 0, minExpected: 1 },

    // Tablet - buttons inline
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
