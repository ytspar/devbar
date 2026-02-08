/**
 * Tooltips module tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addTooltipColoredRow,
  addTooltipDescription,
  addTooltipError,
  addTooltipInfoRow,
  addTooltipProgress,
  addTooltipSectionHeader,
  addTooltipShortcut,
  addTooltipSuccess,
  addTooltipTitle,
  addTooltipWarning,
  attachBreakpointTooltip,
  attachClickToggleTooltip,
  attachHtmlTooltip,
  attachInfoTooltip,
  attachMetricTooltip,
  attachTextTooltip,
  clearAllTooltips,
  createTooltipContainer,
  positionTooltip,
  removeTooltip,
} from './tooltips.js';
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
    activeTooltips: new Set(),
    settingsManager: {
      get: vi.fn((key: string) => {
        if (key === 'accentColor') return '#10b981';
        return undefined;
      }),
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
    ...overrides,
  } as any;
}

describe('createTooltipContainer', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('creates a div element with devbar attributes', () => {
    const state = createMockState();
    const tooltip = createTooltipContainer(state);

    expect(tooltip.tagName).toBe('DIV');
    expect(tooltip.getAttribute('data-devbar')).toBe('true');
    expect(tooltip.getAttribute('data-devbar-tooltip')).toBe('true');
  });

  it('applies base tooltip styles', () => {
    const state = createMockState();
    const tooltip = createTooltipContainer(state);

    expect(tooltip.style.position).toBe('fixed');
    expect(tooltip.style.zIndex).toBe('10004');
    expect(tooltip.style.borderRadius).toBe('6px');
    expect(tooltip.style.maxWidth).toBe('280px');
    expect(tooltip.style.pointerEvents).toBe('auto');
  });

  it('adds the tooltip to the active set', () => {
    const state = createMockState();
    expect(state.activeTooltips.size).toBe(0);

    const tooltip = createTooltipContainer(state);
    expect(state.activeTooltips.size).toBe(1);
    expect(state.activeTooltips.has(tooltip)).toBe(true);
  });
});

describe('removeTooltip', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('removes the tooltip from the DOM and the active set', () => {
    const state = createMockState();
    const tooltip = createTooltipContainer(state);
    document.body.appendChild(tooltip);

    expect(document.body.contains(tooltip)).toBe(true);
    expect(state.activeTooltips.has(tooltip)).toBe(true);

    removeTooltip(state, tooltip);

    expect(document.body.contains(tooltip)).toBe(false);
    expect(state.activeTooltips.has(tooltip)).toBe(false);
  });
});

describe('clearAllTooltips', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('removes all tooltips from DOM and clears the set', () => {
    const state = createMockState();
    const t1 = createTooltipContainer(state);
    const t2 = createTooltipContainer(state);
    const t3 = createTooltipContainer(state);
    document.body.appendChild(t1);
    document.body.appendChild(t2);
    document.body.appendChild(t3);

    expect(state.activeTooltips.size).toBe(3);

    clearAllTooltips(state);

    expect(state.activeTooltips.size).toBe(0);
    expect(document.body.contains(t1)).toBe(false);
    expect(document.body.contains(t2)).toBe(false);
    expect(document.body.contains(t3)).toBe(false);
  });

  it('handles empty active set gracefully', () => {
    const state = createMockState();
    clearAllTooltips(state);
    expect(state.activeTooltips.size).toBe(0);
  });
});

describe('addTooltipTitle', () => {
  it('creates a title element with correct text and color', () => {
    const state = createMockState();
    const container = document.createElement('div');

    addTooltipTitle(state, container, 'Test Title');

    const titleEl = container.firstChild as HTMLElement;
    expect(titleEl).toBeTruthy();
    expect(titleEl.textContent).toBe('Test Title');
    expect(titleEl.style.fontWeight).toBe('600');
    expect(titleEl.style.marginBottom).toBe('4px');
  });

  it('uses the accent color from settings', () => {
    const state = createMockState();
    (state.settingsManager.get as any).mockReturnValue('#ff0000');
    const container = document.createElement('div');

    addTooltipTitle(state, container, 'Colored Title');

    const titleEl = container.firstChild as HTMLElement;
    expect(titleEl.style.color).toBe('#ff0000');
  });
});

describe('addTooltipDescription', () => {
  it('creates a description element with correct text', () => {
    const container = document.createElement('div');
    addTooltipDescription(container, 'Some description text');

    const descEl = container.firstChild as HTMLElement;
    expect(descEl.textContent).toBe('Some description text');
    expect(descEl.style.marginBottom).toBe('10px');
    expect(descEl.style.lineHeight).toBe('1.4');
  });
});

describe('addTooltipSectionHeader', () => {
  it('creates a muted uppercase section header', () => {
    const container = document.createElement('div');
    addTooltipSectionHeader(container, 'Thresholds');

    const headerEl = container.firstChild as HTMLElement;
    expect(headerEl.textContent).toBe('Thresholds');
    expect(headerEl.style.textTransform).toBe('uppercase');
    expect(headerEl.style.letterSpacing).toBe('0.05em');
    expect(headerEl.style.fontSize).toBe('0.625rem');
    expect(headerEl.style.marginBottom).toBe('6px');
  });
});

describe('addTooltipColoredRow', () => {
  it('creates a row with dot, label, and value', () => {
    const container = document.createElement('div');
    addTooltipColoredRow(container, 'Good', '<=100ms', '#10b981');

    const row = container.firstChild as HTMLElement;
    expect(row.style.display).toBe('flex');
    expect(row.style.alignItems).toBe('center');

    // Should have 3 children: dot, label, value
    expect(row.children.length).toBe(3);

    const dot = row.children[0] as HTMLElement;
    expect(dot.style.width).toBe('6px');
    expect(dot.style.height).toBe('6px');
    expect(dot.style.borderRadius).toBe('50%');
    expect(dot.style.backgroundColor).toBe('#10b981');

    const label = row.children[1] as HTMLElement;
    expect(label.textContent).toBe('Good');
    expect(label.style.color).toBe('#10b981');
    expect(label.style.minWidth).toBe('70px');

    const value = row.children[2] as HTMLElement;
    expect(value.textContent).toBe('<=100ms');
  });

  it('respects custom labelWidth', () => {
    const container = document.createElement('div');
    addTooltipColoredRow(container, 'Label', 'Value', '#fff', '120px');

    const row = container.firstChild as HTMLElement;
    const label = row.children[1] as HTMLElement;
    expect(label.style.minWidth).toBe('120px');
  });
});

describe('addTooltipInfoRow', () => {
  it('creates a row with label and value', () => {
    const container = document.createElement('div');
    addTooltipInfoRow(container, 'Current:', 'md (768px)');

    const row = container.firstChild as HTMLElement;
    expect(row.style.display).toBe('flex');
    expect(row.children.length).toBe(2);

    const label = row.children[0] as HTMLElement;
    expect(label.textContent).toBe('Current:');

    const value = row.children[1] as HTMLElement;
    expect(value.textContent).toBe('md (768px)');
  });
});

describe('addTooltipShortcut', () => {
  it('creates a shortcut row with key and description', () => {
    const container = document.createElement('div');
    addTooltipShortcut(container, 'Cmd+Shift+S', 'Save screenshot');

    const row = container.firstChild as HTMLElement;
    expect(row.style.display).toBe('flex');
    expect(row.children.length).toBe(2);

    const keySpan = row.children[0] as HTMLElement;
    expect(keySpan.textContent).toBe('Cmd+Shift+S');
    expect(keySpan.style.minWidth).toBe('90px');
    expect(keySpan.style.fontSize).toBe('0.625rem');

    const descSpan = row.children[1] as HTMLElement;
    expect(descSpan.textContent).toBe('Save screenshot');
  });
});

describe('addTooltipWarning', () => {
  it('creates a warning box with icon and text', () => {
    const container = document.createElement('div');
    addTooltipWarning(container, 'This is a warning');

    const warning = container.firstChild as HTMLElement;
    expect(warning.style.display).toBe('flex');
    expect(warning.style.marginTop).toBe('8px');
    expect(warning.style.borderRadius).toBe('4px');
    expect(warning.children.length).toBe(2);

    const icon = warning.children[0] as HTMLElement;
    expect(icon.textContent).toBe('\u26A0');

    const textSpan = warning.children[1] as HTMLElement;
    expect(textSpan.textContent).toBe('This is a warning');
  });
});

describe('addTooltipSuccess', () => {
  it('creates a success box with checkmark and text', () => {
    const container = document.createElement('div');
    addTooltipSuccess(container, 'Operation succeeded');

    const status = container.firstChild as HTMLElement;
    expect(status.style.display).toBe('flex');
    expect(status.children.length).toBe(2);

    const icon = status.children[0] as HTMLElement;
    expect(icon.textContent).toBe('\u2713');

    const textContainer = status.children[1] as HTMLElement;
    const mainText = textContainer.children[0] as HTMLElement;
    expect(mainText.textContent).toBe('Operation succeeded');
  });

  it('includes subtext when provided', () => {
    const container = document.createElement('div');
    addTooltipSuccess(container, 'Saved', '/path/to/file.md');

    const status = container.firstChild as HTMLElement;
    const textContainer = status.children[1] as HTMLElement;
    expect(textContainer.children.length).toBe(2);

    const sub = textContainer.children[1] as HTMLElement;
    expect(sub.textContent).toBe('/path/to/file.md');
    expect(sub.style.wordBreak).toBe('break-all');
  });

  it('omits subtext when not provided', () => {
    const container = document.createElement('div');
    addTooltipSuccess(container, 'Done');

    const status = container.firstChild as HTMLElement;
    const textContainer = status.children[1] as HTMLElement;
    expect(textContainer.children.length).toBe(1);
  });
});

describe('addTooltipError', () => {
  it('creates an error box with X icon, title, and message', () => {
    const container = document.createElement('div');
    addTooltipError(container, 'Error Title', 'Something went wrong');

    const status = container.firstChild as HTMLElement;
    expect(status.style.display).toBe('flex');

    const icon = status.children[0] as HTMLElement;
    expect(icon.textContent).toBe('\u00D7');
    expect(icon.style.fontSize).toBe('0.875rem');

    const textContainer = status.children[1] as HTMLElement;
    const titleEl = textContainer.children[0] as HTMLElement;
    expect(titleEl.textContent).toBe('Error Title');

    const msgEl = textContainer.children[1] as HTMLElement;
    expect(msgEl.textContent).toBe('Something went wrong');
    expect(msgEl.style.fontSize).toBe('0.625rem');
  });
});

describe('addTooltipProgress', () => {
  it('creates a progress indicator with spinner and text', () => {
    const container = document.createElement('div');
    addTooltipProgress(container, 'Processing...');

    const status = container.firstChild as HTMLElement;
    expect(status.style.display).toBe('flex');
    expect(status.style.alignItems).toBe('center');
    expect(status.children.length).toBe(2);

    const spinner = status.children[0] as HTMLElement;
    expect(spinner.textContent).toBe('~');

    const textSpan = status.children[1] as HTMLElement;
    expect(textSpan.textContent).toBe('Processing...');
  });
});

describe('positionTooltip', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('positions tooltip above the anchor element', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    const anchor = document.createElement('div');
    // Set up anchor position on the left side of the screen
    Object.defineProperty(anchor, 'getBoundingClientRect', {
      value: () => ({
        left: 100,
        right: 200,
        top: 600,
        bottom: 630,
        width: 100,
        height: 30,
      }),
    });
    document.body.appendChild(anchor);

    const tooltip = document.createElement('div');
    // Mock tooltip dimensions
    Object.defineProperty(tooltip, 'getBoundingClientRect', {
      value: () => ({
        left: 100,
        right: 300,
        top: 0,
        bottom: 100,
        width: 200,
        height: 100,
      }),
    });

    positionTooltip(tooltip, anchor);

    // Tooltip should be positioned above the anchor
    expect(tooltip.style.bottom).toBe(`${768 - 600 + 8}px`);
    // Left-aligned since anchor is on the left side
    expect(tooltip.style.left).toBe('100px');
    // Tooltip should be appended to body
    expect(document.body.contains(tooltip)).toBe(true);
  });

  it('right-aligns tooltip when anchor is on right side of screen', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    const anchor = document.createElement('div');
    Object.defineProperty(anchor, 'getBoundingClientRect', {
      value: () => ({
        left: 800,
        right: 900,
        top: 600,
        bottom: 630,
        width: 100,
        height: 30,
      }),
    });
    document.body.appendChild(anchor);

    const tooltip = document.createElement('div');
    Object.defineProperty(tooltip, 'getBoundingClientRect', {
      value: () => ({
        left: 700,
        right: 900,
        top: 0,
        bottom: 100,
        width: 200,
        height: 100,
      }),
    });

    positionTooltip(tooltip, anchor);

    // Right-aligned: tooltip left should be rect.right - tooltipWidth = 900 - 200 = 700
    expect(tooltip.style.left).toBe('700px');
  });
});

describe('attachTextTooltip', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('does nothing when showTooltips is false', () => {
    const state = createMockState({
      options: { showTooltips: false } as any,
    });
    const element = document.createElement('div');

    attachTextTooltip(state, element, () => 'Hello');

    // No event listeners should be attached (we check by triggering mouseenter)
    expect(element.onmouseenter).toBeNull();
  });

  it('creates a tooltip with text content on mouseenter', () => {
    const state = createMockState();
    const element = document.createElement('div');

    // Mock getBoundingClientRect for positioning
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({
        left: 100, right: 200, top: 500, bottom: 530, width: 100, height: 30,
      }),
    });
    document.body.appendChild(element);

    attachTextTooltip(state, element, () => 'Tooltip text');

    // Trigger mouseenter
    element.onmouseenter!(new MouseEvent('mouseenter'));

    // Check that a tooltip was created
    expect(state.activeTooltips.size).toBe(1);
    const tooltip = Array.from(state.activeTooltips)[0];
    expect(tooltip.textContent).toBe('Tooltip text');
  });

  it('handles multiline text', () => {
    const state = createMockState();
    const element = document.createElement('div');

    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({
        left: 100, right: 200, top: 500, bottom: 530, width: 100, height: 30,
      }),
    });
    document.body.appendChild(element);

    attachTextTooltip(state, element, () => 'Line 1\nLine 2\nLine 3');

    element.onmouseenter!(new MouseEvent('mouseenter'));

    const tooltip = Array.from(state.activeTooltips)[0];
    // Each line should be in its own div
    expect(tooltip.children.length).toBe(3);
    expect(tooltip.children[0].textContent).toBe('Line 1');
    expect(tooltip.children[1].textContent).toBe('Line 2');
    expect(tooltip.children[2].textContent).toBe('Line 3');
  });
});

describe('attachHtmlTooltip', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('does nothing when showTooltips is false', () => {
    const state = createMockState({
      options: { showTooltips: false } as any,
    });
    const element = document.createElement('div');

    attachHtmlTooltip(state, element, () => {});

    expect(element.onmouseenter).toBeNull();
  });

  it('calls buildContent when tooltip is shown', () => {
    const state = createMockState();
    const element = document.createElement('div');
    const buildContent = vi.fn();

    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({
        left: 100, right: 200, top: 500, bottom: 530, width: 100, height: 30,
      }),
    });
    document.body.appendChild(element);

    attachHtmlTooltip(state, element, buildContent);

    element.onmouseenter!(new MouseEvent('mouseenter'));

    expect(buildContent).toHaveBeenCalledTimes(1);
    expect(buildContent).toHaveBeenCalledWith(expect.any(HTMLDivElement));
  });

  it('calls hoverOptions callbacks', () => {
    const state = createMockState();
    const element = document.createElement('div');
    const onEnter = vi.fn();
    const onLeave = vi.fn();

    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({
        left: 100, right: 200, top: 500, bottom: 530, width: 100, height: 30,
      }),
    });
    document.body.appendChild(element);

    attachHtmlTooltip(state, element, () => {}, { onEnter, onLeave });

    element.onmouseenter!(new MouseEvent('mouseenter'));
    expect(onEnter).toHaveBeenCalledTimes(1);

    element.onmouseleave!(new MouseEvent('mouseleave'));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('removes tooltip on element click', () => {
    const state = createMockState();
    const element = document.createElement('div');

    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({
        left: 100, right: 200, top: 500, bottom: 530, width: 100, height: 30,
      }),
    });
    document.body.appendChild(element);

    attachHtmlTooltip(state, element, (tooltip) => {
      tooltip.textContent = 'test';
    });

    // Show tooltip
    element.onmouseenter!(new MouseEvent('mouseenter'));
    expect(state.activeTooltips.size).toBe(1);

    // Click should remove it
    element.onclick!(new MouseEvent('click'));
    expect(state.activeTooltips.size).toBe(0);
  });
});

describe('attachClickToggleTooltip', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('does nothing when showTooltips is false', () => {
    const state = createMockState({
      options: { showTooltips: false } as any,
    });
    const element = document.createElement('div');

    attachClickToggleTooltip(state, element, () => {});

    expect(element.onclick).toBeNull();
  });

  it('shows tooltip on click and pins it', () => {
    const state = createMockState();
    const element = document.createElement('div');
    element.style.opacity = '0.7';

    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({
        left: 100, right: 200, top: 500, bottom: 530, width: 100, height: 30,
      }),
    });
    document.body.appendChild(element);

    attachClickToggleTooltip(state, element, (tooltip) => {
      tooltip.textContent = 'pinned content';
    });

    // Click to pin
    element.onclick!(new MouseEvent('click', { bubbles: true }));
    expect(state.activeTooltips.size).toBe(1);
    expect(element.style.opacity).toBe('1');
  });

  it('hides tooltip on second click (unpin)', () => {
    const state = createMockState();
    const element = document.createElement('div');
    element.style.opacity = '0.7';

    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({
        left: 100, right: 200, top: 500, bottom: 530, width: 100, height: 30,
      }),
    });
    document.body.appendChild(element);

    attachClickToggleTooltip(state, element, (tooltip) => {
      tooltip.textContent = 'content';
    });

    // First click: pin
    element.onclick!(new MouseEvent('click', { bubbles: true }));
    expect(state.activeTooltips.size).toBe(1);

    // Second click: unpin
    element.onclick!(new MouseEvent('click', { bubbles: true }));
    expect(state.activeTooltips.size).toBe(0);
    expect(element.style.opacity).toBe('0.7');
  });

  it('shows tooltip on hover when not pinned', () => {
    const state = createMockState();
    const element = document.createElement('div');
    element.style.opacity = '0.7';

    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({
        left: 100, right: 200, top: 500, bottom: 530, width: 100, height: 30,
      }),
    });
    document.body.appendChild(element);

    attachClickToggleTooltip(state, element, () => {});

    element.onmouseenter!(new MouseEvent('mouseenter'));
    expect(state.activeTooltips.size).toBe(1);

    element.onmouseleave!(new MouseEvent('mouseleave'));
    expect(state.activeTooltips.size).toBe(0);
  });

  it('keeps tooltip visible on mouseleave when pinned', () => {
    const state = createMockState();
    const element = document.createElement('div');
    element.style.opacity = '0.7';

    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({
        left: 100, right: 200, top: 500, bottom: 530, width: 100, height: 30,
      }),
    });
    document.body.appendChild(element);

    attachClickToggleTooltip(state, element, () => {});

    // Pin via click
    element.onclick!(new MouseEvent('click', { bubbles: true }));
    expect(state.activeTooltips.size).toBe(1);

    // mouseleave should not hide it
    element.onmouseleave!(new MouseEvent('mouseleave'));
    expect(state.activeTooltips.size).toBe(1);
    expect(element.style.opacity).toBe('1');
  });

  it('stores a cleanup function on the element', () => {
    const state = createMockState();
    const element = document.createElement('div') as HTMLElement & { _tooltipCleanup?: () => void };

    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({
        left: 100, right: 200, top: 500, bottom: 530, width: 100, height: 30,
      }),
    });
    document.body.appendChild(element);

    attachClickToggleTooltip(state, element, () => {});

    expect(typeof element._tooltipCleanup).toBe('function');
  });
});

describe('attachMetricTooltip', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('creates a metric tooltip with title, description, and thresholds', () => {
    const state = createMockState();
    const element = document.createElement('div');

    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({
        left: 100, right: 200, top: 500, bottom: 530, width: 100, height: 30,
      }),
    });
    document.body.appendChild(element);

    attachMetricTooltip(state, element, 'FCP', 'First Contentful Paint', {
      good: '<=1.8s',
      needsWork: '1.8s-3.0s',
      poor: '>3.0s',
    });

    // Trigger to show tooltip
    element.onmouseenter!(new MouseEvent('mouseenter'));

    expect(state.activeTooltips.size).toBe(1);
    const tooltip = Array.from(state.activeTooltips)[0];
    expect(tooltip.textContent).toContain('FCP');
    expect(tooltip.textContent).toContain('First Contentful Paint');
    expect(tooltip.textContent).toContain('Thresholds');
    expect(tooltip.textContent).toContain('Good');
    expect(tooltip.textContent).toContain('Needs work');
    expect(tooltip.textContent).toContain('Poor');
    expect(tooltip.textContent).toContain('<=1.8s');
  });
});

describe('attachBreakpointTooltip', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('creates a breakpoint tooltip with current info and reference', () => {
    const state = createMockState();
    const element = document.createElement('div');

    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({
        left: 100, right: 200, top: 500, bottom: 530, width: 100, height: 30,
      }),
    });
    document.body.appendChild(element);

    attachBreakpointTooltip(state, element, 'md', '768x1024', 'Tailwind md: >=768px');

    element.onmouseenter!(new MouseEvent('mouseenter'));

    const tooltip = Array.from(state.activeTooltips)[0];
    expect(tooltip.textContent).toContain('Tailwind Breakpoint');
    expect(tooltip.textContent).toContain('md');
    expect(tooltip.textContent).toContain('768x1024');
    expect(tooltip.textContent).toContain('Breakpoints');
    // Should list all breakpoints
    expect(tooltip.textContent).toContain('base');
    expect(tooltip.textContent).toContain('sm');
    expect(tooltip.textContent).toContain('lg');
    expect(tooltip.textContent).toContain('xl');
    expect(tooltip.textContent).toContain('2xl');
  });
});

describe('attachInfoTooltip', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('creates a simple tooltip with title and description', () => {
    const state = createMockState();
    const element = document.createElement('div');

    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({
        left: 100, right: 200, top: 500, bottom: 530, width: 100, height: 30,
      }),
    });
    document.body.appendChild(element);

    attachInfoTooltip(state, element, 'Info Title', 'Some useful information');

    element.onmouseenter!(new MouseEvent('mouseenter'));

    const tooltip = Array.from(state.activeTooltips)[0];
    expect(tooltip.textContent).toContain('Info Title');
    expect(tooltip.textContent).toContain('Some useful information');
  });
});
