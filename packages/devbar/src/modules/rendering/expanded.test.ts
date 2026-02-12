/**
 * Expanded state rendering tests
 *
 * Tests the renderExpanded function which creates the expanded devbar container
 * with connection indicator, breakpoint/metric info, console badges, action
 * buttons, and custom controls.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevBarState } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../constants.js', () => ({
  BUTTON_COLORS: {
    screenshot: '#10b981',
    review: '#a855f7',
    outline: '#06b6d4',
    schema: '#f59e0b',
    a11y: '#ec4899',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  },
  CSS_COLORS: {
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: '#6b7280',
    bg: '#0a0f1a',
    bgInput: 'rgba(10, 15, 26, 0.8)',
    border: 'rgba(16, 185, 129, 0.2)',
    primary: '#10b981',
    primaryGlow: 'rgba(16, 185, 129, 0.4)',
  },
  FONT_MONO: 'monospace',
  TAILWIND_BREAKPOINTS: {
    base: { min: 0, label: 'Tailwind base: <640px' },
    sm: { min: 640, label: 'Tailwind sm: >=640px' },
    md: { min: 768, label: 'Tailwind md: >=768px' },
    lg: { min: 1024, label: 'Tailwind lg: >=1024px' },
    xl: { min: 1280, label: 'Tailwind xl: >=1280px' },
    '2xl': { min: 1536, label: 'Tailwind 2xl: >=1536px' },
  },
  withAlpha: (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`,
}));

vi.mock('../performance.js', () => ({
  getResponsiveMetricVisibility: vi.fn(() => ({
    visible: ['fcp', 'lcp', 'cls', 'inp', 'pageSize'] as const,
    hidden: [] as const,
  })),
}));

vi.mock('../tooltips.js', () => ({
  attachTextTooltip: vi.fn(),
  attachBreakpointTooltip: vi.fn(),
  attachMetricTooltip: vi.fn(),
  attachInfoTooltip: vi.fn(),
  attachClickToggleTooltip: vi.fn(),
  addTooltipTitle: vi.fn(),
  attachButtonTooltip: vi.fn(),
}));

vi.mock('./buttons.js', () => {
  const makeBtn = (label: string) => {
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', label);
    btn.className = `devbar-btn-${label.toLowerCase().replace(/\s+/g, '-')}`;
    return btn;
  };
  return {
    createScreenshotButton: vi.fn((_state: any, _color: string) => makeBtn('Screenshot')),
    createAIReviewButton: vi.fn(() => makeBtn('AI Design Review')),
    createOutlineButton: vi.fn(() => makeBtn('Document Outline')),
    createSchemaButton: vi.fn(() => makeBtn('Page Schema')),
    createA11yButton: vi.fn(() => makeBtn('Accessibility Audit')),
    createSettingsButton: vi.fn(() => makeBtn('Settings')),
    createCompactToggleButton: vi.fn(() => makeBtn('compact-toggle')),
    createConsoleBadge: vi.fn((_state: any, type: string, count: number, _color: string) => {
      const badge = document.createElement('span');
      badge.className = 'devbar-badge';
      badge.textContent = String(count);
      badge.setAttribute('data-badge-type', type);
      return badge;
    }),
  };
});

vi.mock('./common.js', () => ({
  captureDotPosition: vi.fn(),
  createConnectionIndicator: vi.fn((state: any) => {
    const span = document.createElement('span');
    span.className = 'devbar-clickable';
    span.setAttribute('data-testid', 'conn-indicator');
    span.setAttribute('data-connected', String(state.sweetlinkConnected));
    return span;
  }),
}));

import { renderExpanded } from './expanded.js';
import {
  createScreenshotButton,
  createAIReviewButton,
  createOutlineButton,
  createSchemaButton,
  createA11yButton,
  createSettingsButton,
  createCompactToggleButton,
  createConsoleBadge,
} from './buttons.js';
import { createConnectionIndicator, captureDotPosition } from './common.js';
import { getResponsiveMetricVisibility } from '../performance.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function createMockState(overrides: Partial<DevBarState> = {}): DevBarState {
  const container = document.createElement('div');
  container.setAttribute('data-devbar', 'true');
  document.body.appendChild(container);

  return {
    options: {
      showTooltips: true,
      saveLocation: 'auto',
      showScreenshot: true,
      showConsoleBadges: true,
      position: 'bottom-left',
      wsPort: 9223,
      accentColor: '#10b981',
      screenshotQuality: 0.65,
      showMetrics: {
        breakpoint: true,
        fcp: true,
        lcp: true,
        cls: true,
        inp: true,
        pageSize: true,
      },
      sizeOverrides: undefined,
    },
    debug: { state: vi.fn(), perf: vi.fn(), ws: vi.fn(), render: vi.fn(), event: vi.fn() },
    activeTooltips: new Set(),
    settingsManager: {
      get: vi.fn(),
      getSettings: vi.fn(),
      saveSettings: vi.fn(),
    } as any,
    render: vi.fn(),
    sweetlinkConnected: false,
    container,
    overlayElement: null,
    collapsed: false,
    compactMode: false,
    showSettingsPopover: false,
    lastDotPosition: null,
    breakpointInfo: null,
    perfStats: null,
    consoleLogs: [],
    consoleFilter: null,
    getLogCounts: vi.fn(() => ({ errorCount: 0, warningCount: 0, infoCount: 0 })),
    resetPositionStyles: vi.fn(),
    toggleCompactMode: vi.fn(),
    handleScreenshot: vi.fn(),
    ...overrides,
  } as any;
}

afterEach(() => {
  document.body.textContent = '';
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderExpanded', () => {
  // ---- Early exit --------------------------------------------------------

  it('returns early when state.container is null', () => {
    const state = createMockState({ container: null });
    renderExpanded(state, []);

    // No DOM mutation expected — createConnectionIndicator should not be called
    expect(createConnectionIndicator).not.toHaveBeenCalled();
  });

  // ---- Wrapper styling ---------------------------------------------------

  it('styles the container as a fixed positioned element', () => {
    const state = createMockState();
    renderExpanded(state, []);

    expect(state.container!.style.position).toBe('fixed');
    expect(state.container!.style.zIndex).toBe('9999');
  });

  it('applies border with accent color', () => {
    const state = createMockState();
    renderExpanded(state, []);

    expect(state.container!.style.border).toContain('#10b981');
  });

  it('applies border radius of 12px', () => {
    const state = createMockState();
    renderExpanded(state, []);

    expect(state.container!.style.borderRadius).toBe('12px');
  });

  it('calls resetPositionStyles before styling', () => {
    const state = createMockState();
    renderExpanded(state, []);

    expect(state.resetPositionStyles).toHaveBeenCalledWith(state.container);
  });

  // ---- Position computation ----------------------------------------------

  it('positions at bottom-left by default', () => {
    const state = createMockState();
    renderExpanded(state, []);

    expect(state.container!.style.bottom).toBe('20px');
    expect(state.container!.style.left).toBe('80px');
  });

  it('positions at top-right when configured', () => {
    const state = createMockState();
    state.options.position = 'top-right';
    renderExpanded(state, []);

    expect(state.container!.style.top).toBe('20px');
    expect(state.container!.style.right).toBe('16px');
  });

  it('positions centered when bottom-center', () => {
    const state = createMockState();
    state.options.position = 'bottom-center';
    renderExpanded(state, []);

    expect(state.container!.style.bottom).toBe('12px');
    expect(state.container!.style.left).toBe('50%');
  });

  it('uses lastDotPosition when available for left-aligned position', () => {
    const state = createMockState();
    state.options.position = 'bottom-left';
    state.lastDotPosition = { left: 150, top: 400, bottom: 400 };
    renderExpanded(state, []);

    // DOT_OFFSET_LEFT = 19, DOT_OFFSET_TOP = 15
    expect(state.container!.style.top).toBe('385px'); // 400 - 15
    expect(state.container!.style.left).toBe('131px'); // 150 - 19
    // lastDotPosition should be cleared after use
    expect(state.lastDotPosition).toBeNull();
  });

  it('falls back to default position for right-aligned with lastDotPosition', () => {
    const state = createMockState();
    state.options.position = 'bottom-right';
    state.lastDotPosition = { left: 150, top: 400, bottom: 400 };
    renderExpanded(state, []);

    // Should fall back to default right-aligned position
    expect(state.container!.style.right).toBe('16px');
    expect(state.container!.style.bottom).toBe('20px');
    // lastDotPosition should still be cleared
    expect(state.lastDotPosition).toBeNull();
  });

  // ---- Main row ----------------------------------------------------------

  it('creates a main row with devbar-main class', () => {
    const state = createMockState();
    renderExpanded(state, []);

    const mainRow = state.container!.querySelector('.devbar-main');
    expect(mainRow).toBeTruthy();
    expect((mainRow as HTMLElement).style.display).toBe('flex');
  });

  // ---- Connection indicator ----------------------------------------------

  it('creates a connection indicator', () => {
    const state = createMockState();
    renderExpanded(state, []);

    expect(createConnectionIndicator).toHaveBeenCalledWith(state);
    const indicator = state.container!.querySelector('[data-testid="conn-indicator"]');
    expect(indicator).toBeTruthy();
  });

  it('connection indicator is inside the status row', () => {
    const state = createMockState();
    renderExpanded(state, []);

    const statusRow = state.container!.querySelector('.devbar-status');
    expect(statusRow).toBeTruthy();
    const indicator = statusRow!.querySelector('[data-testid="conn-indicator"]');
    expect(indicator).toBeTruthy();
  });

  // ---- Info section (breakpoint + metrics) -------------------------------

  it('creates an info section with devbar-info class', () => {
    const state = createMockState();
    renderExpanded(state, []);

    const infoSection = state.container!.querySelector('.devbar-info');
    expect(infoSection).toBeTruthy();
  });

  it('shows breakpoint text when breakpointInfo is set', () => {
    const state = createMockState({
      breakpointInfo: { tailwindBreakpoint: 'lg', dimensions: '1024x768' },
    });
    renderExpanded(state, []);

    const infoSection = state.container!.querySelector('.devbar-info');
    expect(infoSection!.textContent).toContain('lg');
  });

  it('hides breakpoint info when showMetrics.breakpoint is false', () => {
    const state = createMockState({
      breakpointInfo: { tailwindBreakpoint: 'lg', dimensions: '1024x768' },
    });
    state.options.showMetrics.breakpoint = false;
    renderExpanded(state, []);

    const infoSection = state.container!.querySelector('.devbar-info');
    expect(infoSection!.textContent).not.toContain('lg');
  });

  it('renders performance metrics when perfStats is available', () => {
    const state = createMockState({
      perfStats: { fcp: '1.2s', lcp: '2.5s', cls: '0.05', inp: '120ms', totalSize: '1.5MB' },
    });
    renderExpanded(state, []);

    expect(getResponsiveMetricVisibility).toHaveBeenCalledWith(state);
    const infoSection = state.container!.querySelector('.devbar-info');
    // Metrics should include "FCP 1.2s" etc.
    expect(infoSection!.textContent).toContain('FCP 1.2s');
    expect(infoSection!.textContent).toContain('LCP 2.5s');
  });

  it('does not render metrics when perfStats is null', () => {
    const state = createMockState({ perfStats: null });
    renderExpanded(state, []);

    expect(getResponsiveMetricVisibility).not.toHaveBeenCalled();
  });

  it('renders separator pipes between metrics', () => {
    const state = createMockState({
      perfStats: { fcp: '1.2s', lcp: '2.5s', cls: '0.05', inp: '120ms', totalSize: '1.5MB' },
    });
    renderExpanded(state, []);

    const infoSection = state.container!.querySelector('.devbar-info');
    const separators = Array.from(infoSection!.querySelectorAll('span')).filter(
      (s) => s.textContent === '|'
    );
    expect(separators.length).toBeGreaterThan(0);
  });

  it('skips metrics where showMetrics is false', () => {
    const state = createMockState({
      perfStats: { fcp: '1.2s', lcp: '2.5s', cls: '0.05', inp: '120ms', totalSize: '1.5MB' },
    });
    state.options.showMetrics.fcp = false;
    renderExpanded(state, []);

    const infoSection = state.container!.querySelector('.devbar-info');
    expect(infoSection!.textContent).not.toContain('FCP');
    expect(infoSection!.textContent).toContain('LCP 2.5s');
  });

  // ---- Console badges ----------------------------------------------------

  it('shows error badges when showConsoleBadges is true and errors exist', () => {
    const state = createMockState();
    (state.getLogCounts as any).mockReturnValue({
      errorCount: 3,
      warningCount: 0,
      infoCount: 0,
    });
    renderExpanded(state, []);

    expect(createConsoleBadge).toHaveBeenCalledWith(state, 'error', 3, '#ef4444');
  });

  it('shows warning badges when warnings exist', () => {
    const state = createMockState();
    (state.getLogCounts as any).mockReturnValue({
      errorCount: 0,
      warningCount: 5,
      infoCount: 0,
    });
    renderExpanded(state, []);

    expect(createConsoleBadge).toHaveBeenCalledWith(state, 'warn', 5, '#f59e0b');
  });

  it('shows info badges when info logs exist', () => {
    const state = createMockState();
    (state.getLogCounts as any).mockReturnValue({
      errorCount: 0,
      warningCount: 0,
      infoCount: 2,
    });
    renderExpanded(state, []);

    expect(createConsoleBadge).toHaveBeenCalledWith(state, 'info', 2, '#3b82f6');
  });

  it('does not show badges when counts are zero', () => {
    const state = createMockState();
    (state.getLogCounts as any).mockReturnValue({
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
    });
    renderExpanded(state, []);

    expect(createConsoleBadge).not.toHaveBeenCalled();
  });

  it('hides badges when showConsoleBadges is false', () => {
    const state = createMockState();
    state.options.showConsoleBadges = false;
    (state.getLogCounts as any).mockReturnValue({
      errorCount: 10,
      warningCount: 5,
      infoCount: 3,
    });
    renderExpanded(state, []);

    expect(createConsoleBadge).not.toHaveBeenCalled();
  });

  // ---- Action buttons ----------------------------------------------------

  it('creates an actions container with devbar-actions class', () => {
    const state = createMockState();
    renderExpanded(state, []);

    const actions = state.container!.querySelector('.devbar-actions');
    expect(actions).toBeTruthy();
  });

  it('includes screenshot button when showScreenshot is true', () => {
    const state = createMockState();
    state.options.showScreenshot = true;
    renderExpanded(state, []);

    expect(createScreenshotButton).toHaveBeenCalledWith(state, '#10b981');
  });

  it('excludes screenshot button when showScreenshot is false', () => {
    const state = createMockState();
    state.options.showScreenshot = false;
    renderExpanded(state, []);

    expect(createScreenshotButton).not.toHaveBeenCalled();
  });

  it('always includes AI review button', () => {
    const state = createMockState();
    renderExpanded(state, []);

    expect(createAIReviewButton).toHaveBeenCalledWith(state);
  });

  it('always includes outline button', () => {
    const state = createMockState();
    renderExpanded(state, []);

    expect(createOutlineButton).toHaveBeenCalledWith(state);
  });

  it('always includes schema button', () => {
    const state = createMockState();
    renderExpanded(state, []);

    expect(createSchemaButton).toHaveBeenCalledWith(state);
  });

  it('always includes a11y button', () => {
    const state = createMockState();
    renderExpanded(state, []);

    expect(createA11yButton).toHaveBeenCalledWith(state);
  });

  it('always includes settings button', () => {
    const state = createMockState();
    renderExpanded(state, []);

    expect(createSettingsButton).toHaveBeenCalledWith(state);
  });

  it('always includes compact toggle button', () => {
    const state = createMockState();
    renderExpanded(state, []);

    expect(createCompactToggleButton).toHaveBeenCalledWith(state);
  });

  // ---- Double-click to collapse ------------------------------------------

  it('double-click on wrapper collapses the devbar', () => {
    const state = createMockState();
    renderExpanded(state, []);

    const dblClickEvent = new MouseEvent('dblclick', { bubbles: true });
    Object.defineProperty(dblClickEvent, 'target', { value: state.container });
    state.container!.ondblclick!(dblClickEvent);

    expect(state.collapsed).toBe(true);
    expect(state.render).toHaveBeenCalled();
    expect(state.debug.state).toHaveBeenCalledWith('Collapsed DevBar (double-click)');
  });

  it('double-click on a button does NOT collapse', () => {
    const state = createMockState();
    renderExpanded(state, []);

    const btn = document.createElement('button');
    state.container!.appendChild(btn);

    const dblClickEvent = new MouseEvent('dblclick', { bubbles: true });
    Object.defineProperty(dblClickEvent, 'target', { value: btn });
    state.container!.ondblclick!(dblClickEvent);

    expect(state.collapsed).toBe(false);
  });

  it('double-click on an input does NOT collapse', () => {
    const state = createMockState();
    renderExpanded(state, []);

    const input = document.createElement('input');
    state.container!.appendChild(input);

    const dblClickEvent = new MouseEvent('dblclick', { bubbles: true });
    Object.defineProperty(dblClickEvent, 'target', { value: input });
    state.container!.ondblclick!(dblClickEvent);

    expect(state.collapsed).toBe(false);
  });

  // ---- Custom controls ---------------------------------------------------

  it('does not render custom controls row when array is empty', () => {
    const state = createMockState();
    renderExpanded(state, []);

    // Main row + no extra rows
    expect(state.container!.children.length).toBe(1);
  });

  it('renders custom controls row when controls are provided', () => {
    const state = createMockState();
    const onClick = vi.fn();
    renderExpanded(state, [
      { id: 'test', label: 'Test Button', onClick },
    ]);

    // Main row + custom controls row
    expect(state.container!.children.length).toBe(2);
    const customRow = state.container!.children[1] as HTMLElement;
    expect(customRow.textContent).toContain('Test Button');
  });

  it('custom control button calls onClick handler', () => {
    const state = createMockState();
    const onClick = vi.fn();
    renderExpanded(state, [
      { id: 'my-btn', label: 'My Action', onClick },
    ]);

    const customRow = state.container!.children[1] as HTMLElement;
    const btn = customRow.querySelector('button') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();

    expect(onClick).toHaveBeenCalled();
  });

  it('disabled custom control does not call onClick', () => {
    const state = createMockState();
    const onClick = vi.fn();
    renderExpanded(state, [
      { id: 'disabled-btn', label: 'Disabled', onClick, disabled: true },
    ]);

    const customRow = state.container!.children[1] as HTMLElement;
    const btn = customRow.querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    btn.click();

    expect(onClick).not.toHaveBeenCalled();
  });

  it('active custom control has styled background', () => {
    const state = createMockState();
    renderExpanded(state, [
      { id: 'active', label: 'Active', onClick: vi.fn(), active: true },
    ]);

    const customRow = state.container!.children[1] as HTMLElement;
    const btn = customRow.querySelector('button') as HTMLButtonElement;
    // Active button should have background color set
    expect(btn.style.backgroundColor).not.toBe('transparent');
  });

  it('warning variant custom control uses warning color', () => {
    const state = createMockState();
    renderExpanded(state, [
      { id: 'warn', label: 'Warning', onClick: vi.fn(), variant: 'warning', active: true },
    ]);

    const customRow = state.container!.children[1] as HTMLElement;
    const btn = customRow.querySelector('button') as HTMLButtonElement;
    // Active + warning: color is set directly to BUTTON_COLORS.warning
    expect(btn.style.color).toBe('#f59e0b');
  });

  it('renders multiple custom controls', () => {
    const state = createMockState();
    renderExpanded(state, [
      { id: 'btn1', label: 'First', onClick: vi.fn() },
      { id: 'btn2', label: 'Second', onClick: vi.fn() },
      { id: 'btn3', label: 'Third', onClick: vi.fn() },
    ]);

    const customRow = state.container!.children[1] as HTMLElement;
    const buttons = customRow.querySelectorAll('button');
    expect(buttons.length).toBe(3);
  });

  // ---- Size overrides ----------------------------------------------------

  it('applies sizeOverrides when provided', () => {
    const state = createMockState();
    state.options.sizeOverrides = { width: '500px', maxWidth: '600px', minWidth: '400px' };
    renderExpanded(state, []);

    expect(state.container!.style.width).toBe('500px');
    expect(state.container!.style.maxWidth).toBe('600px');
    expect(state.container!.style.minWidth).toBe('400px');
  });

  it('uses fit-content width when no sizeOverrides', () => {
    const state = createMockState();
    renderExpanded(state, []);

    expect(state.container!.style.width).toBe('fit-content');
  });

  // ---- Breakpoint text formatting ----------------------------------------

  it('shows dimensions in breakpoint text for md and above', () => {
    const state = createMockState({
      breakpointInfo: { tailwindBreakpoint: 'md', dimensions: '768x1024' },
    });
    renderExpanded(state, []);

    const infoSection = state.container!.querySelector('.devbar-info');
    expect(infoSection!.textContent).toContain('md - 768x1024');
  });

  it('shows only width for sm breakpoint', () => {
    const state = createMockState({
      breakpointInfo: { tailwindBreakpoint: 'sm', dimensions: '640x480' },
    });
    renderExpanded(state, []);

    const infoSection = state.container!.querySelector('.devbar-info');
    expect(infoSection!.textContent).toContain('sm - 640');
    // Should not show full dimensions
    expect(infoSection!.textContent).not.toContain('640x480');
  });

  it('shows only "base" for base breakpoint', () => {
    const state = createMockState({
      breakpointInfo: { tailwindBreakpoint: 'base', dimensions: '320x568' },
    });
    renderExpanded(state, []);

    const infoSection = state.container!.querySelector('.devbar-info');
    expect(infoSection!.textContent).toBe('base');
  });

  // ---- Hidden metrics ellipsis -------------------------------------------

  it('renders ellipsis button when some metrics are hidden', () => {
    vi.mocked(getResponsiveMetricVisibility).mockReturnValueOnce({
      visible: ['fcp', 'lcp'],
      hidden: ['cls', 'inp', 'pageSize'],
    });

    const state = createMockState({
      perfStats: { fcp: '1.2s', lcp: '2.5s', cls: '0.05', inp: '120ms', totalSize: '1.5MB' },
    });
    renderExpanded(state, []);

    const infoSection = state.container!.querySelector('.devbar-info');
    const ellipsis = Array.from(infoSection!.querySelectorAll('span')).find(
      (s) => s.textContent === '\u00B7\u00B7\u00B7'
    );
    expect(ellipsis).toBeTruthy();
  });

  // ---- Custom controls hover effects ------------------------------------

  it('custom control hover sets color to accent on mouseenter', () => {
    const state = createMockState();
    renderExpanded(state, [
      { id: 'hover', label: 'Hoverable', onClick: vi.fn() },
    ]);

    const customRow = state.container!.children[1] as HTMLElement;
    const btn = customRow.querySelector('button') as HTMLButtonElement;

    btn.onmouseenter!(new MouseEvent('mouseenter'));
    // On hover, color should be set to accent color
    expect(btn.style.color).toBe('#10b981');
    expect(btn.style.borderColor).toBe('#10b981');
  });
});
