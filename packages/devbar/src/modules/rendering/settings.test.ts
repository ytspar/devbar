/**
 * Settings popover rendering tests
 *
 * Tests the renderSettingsPopover function and its internal
 * section builders (position picker, compact mode toggle,
 * accent color picker, screenshot quality slider, theme, features, metrics, reset).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevBarState } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../constants.js', () => ({
  CSS_COLORS: {
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: '#6b7280',
    bg: '#0a0f1a',
    bgInput: 'rgba(10, 15, 26, 0.8)',
    border: 'rgba(16, 185, 129, 0.2)',
    primary: '#10b981',
  },
  FONT_MONO: 'monospace',
  withAlpha: (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`,
}));

vi.mock('../../settings.js', () => ({
  ACCENT_COLOR_PRESETS: [
    { name: 'Emerald', value: '#10b981' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Purple', value: '#a855f7' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Amber', value: '#f59e0b' },
    { name: 'Cyan', value: '#06b6d4' },
  ],
  DEFAULT_SETTINGS: {
    version: 1,
    position: 'bottom-left',
    themeMode: 'system',
    compactMode: false,
    accentColor: '#10b981',
    showScreenshot: true,
    showConsoleBadges: true,
    showTooltips: true,
    saveLocation: 'auto',
    screenshotQuality: 0.65,
    showMetrics: {
      breakpoint: true,
      fcp: true,
      lcp: true,
      cls: true,
      inp: true,
      pageSize: true,
    },
    debug: false,
  },
}));

vi.mock('../../ui/index.js', () => ({
  createCloseButton: vi.fn((onClick: () => void) => {
    const btn = document.createElement('button');
    btn.className = 'close-button';
    btn.onclick = onClick;
    return btn;
  }),
  createStyledButton: vi.fn(
    (opts: { color: string; text: string; padding: string; fontSize: string }) => {
      const btn = document.createElement('button');
      btn.className = 'styled-button';
      btn.textContent = opts.text;
      return btn;
    }
  ),
}));

vi.mock('../theme.js', () => ({
  setThemeMode: vi.fn(),
}));

import { renderSettingsPopover } from './settings.js';
import { setThemeMode } from '../theme.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

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
      screenshotQuality: 0.65,
      showMetrics: {
        breakpoint: true,
        fcp: true,
        lcp: true,
        cls: true,
        inp: true,
        pageSize: true,
      },
    },
    debug: { state: vi.fn(), perf: vi.fn(), ws: vi.fn(), render: vi.fn(), event: vi.fn() },
    activeTooltips: new Set(),
    settingsManager: {
      get: vi.fn(),
      getSettings: vi.fn(),
      saveSettings: vi.fn(),
      resetToDefaults: vi.fn(),
    } as any,
    render: vi.fn(),
    sweetlinkConnected: false,
    container: null,
    overlayElement: null,
    themeMode: 'system',
    compactMode: false,
    showSettingsPopover: true,
    toggleCompactMode: vi.fn(),
    applySettings: vi.fn(),
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

describe('renderSettingsPopover', () => {
  // ---- Basic structure ---------------------------------------------------

  it('appends an overlay to document.body', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const overlay = document.querySelector('[data-devbar-overlay]');
    expect(overlay).toBeTruthy();
    expect(overlay!.parentElement).toBe(document.body);
  });

  it('stores the overlay element on state.overlayElement', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    expect(state.overlayElement).toBeTruthy();
    expect(state.overlayElement!.getAttribute('data-devbar-overlay')).toBe('true');
  });

  it('overlay has fixed positioning covering the viewport', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const overlay = state.overlayElement!;
    expect(overlay.style.position).toBe('fixed');
    expect(overlay.style.top).toBe('0px');
    expect(overlay.style.left).toBe('0px');
    expect(overlay.style.right).toBe('0px');
    expect(overlay.style.bottom).toBe('0px');
  });

  it('clicking the overlay background closes the popover and re-renders', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const overlay = state.overlayElement!;
    // Simulate clicking the overlay itself (not a child)
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: overlay });
    overlay.onclick!(event);

    expect(state.showSettingsPopover).toBe(false);
    expect(state.render).toHaveBeenCalled();
  });

  it('clicking inside the popover does NOT close it', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const overlay = state.overlayElement!;
    const popover = overlay.querySelector('[data-devbar]:not([data-devbar-overlay])');
    expect(popover).toBeTruthy();

    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: popover });
    overlay.onclick!(event);

    // showSettingsPopover should remain true
    expect(state.showSettingsPopover).toBe(true);
  });

  it('popover has fixed positioning with zIndex 10003', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const overlay = state.overlayElement!;
    const popover = overlay.firstElementChild as HTMLElement;
    expect(popover.style.position).toBe('fixed');
    expect(popover.style.zIndex).toBe('10003');
  });

  // ---- Header ------------------------------------------------------------

  it('contains a header with "Settings" title', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const overlay = state.overlayElement!;
    const spans = overlay.querySelectorAll('span');
    const settingsTitle = Array.from(spans).find((s) => s.textContent === 'Settings');
    expect(settingsTitle).toBeTruthy();
  });

  it('header contains a close button', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const overlay = state.overlayElement!;
    const closeBtn = overlay.querySelector('.close-button');
    expect(closeBtn).toBeTruthy();
  });

  it('close button hides popover and re-renders', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const closeBtn = state.overlayElement!.querySelector('.close-button') as HTMLButtonElement;
    closeBtn.click();

    expect(state.showSettingsPopover).toBe(false);
    expect(state.render).toHaveBeenCalled();
  });

  // ---- Two-column grid ---------------------------------------------------

  it('renders a two-column settings grid', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const grid = state.overlayElement!.querySelector('.devbar-settings-grid') as HTMLElement;
    expect(grid).toBeTruthy();
    expect(grid.style.display).toBe('grid');
    expect(grid.style.gridTemplateColumns).toBe('1fr 1fr');
  });

  it('grid has two column children', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const grid = state.overlayElement!.querySelector('.devbar-settings-grid')!;
    expect(grid.children.length).toBe(2);
  });

  // ---- Theme section -----------------------------------------------------

  it('contains Theme section with system/dark/light radio buttons', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const overlay = state.overlayElement!;
    const allText = overlay.textContent!;
    expect(allText).toContain('Theme');
    // Radio buttons for theme modes
    const buttons = Array.from(overlay.querySelectorAll('button'));
    const themeButtons = buttons.filter((b) =>
      ['system', 'dark', 'light'].includes(b.textContent?.toLowerCase() ?? '')
    );
    expect(themeButtons.length).toBe(3);
  });

  it('clicking a theme button calls setThemeMode', () => {
    const state = createMockState({ themeMode: 'system' });
    renderSettingsPopover(state);

    const buttons = Array.from(state.overlayElement!.querySelectorAll('button'));
    const darkBtn = buttons.find((b) => b.textContent?.toLowerCase() === 'dark');
    expect(darkBtn).toBeTruthy();
    darkBtn!.click();

    expect(setThemeMode).toHaveBeenCalledWith(state, 'dark');
  });

  it('active theme button has accent-colored border', () => {
    const state = createMockState({ themeMode: 'system' });
    renderSettingsPopover(state);

    const buttons = Array.from(state.overlayElement!.querySelectorAll('button'));
    const systemBtn = buttons.find((b) => b.textContent?.toLowerCase() === 'system');
    expect(systemBtn).toBeTruthy();
    // Active button should have accent border
    expect(systemBtn!.style.borderColor || systemBtn!.style.border).toBeTruthy();
  });

  // ---- Display section: Position picker ----------------------------------

  it('contains a "Position" label', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const allText = state.overlayElement!.textContent!;
    expect(allText).toContain('Position');
  });

  it('position picker has 5 position buttons', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const posButtons = state.overlayElement!.querySelectorAll('[data-position]');
    expect(posButtons.length).toBe(5);
  });

  it('position buttons have correct data-position attributes', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const posButtons = state.overlayElement!.querySelectorAll('[data-position]');
    const positions = Array.from(posButtons).map((b) => b.getAttribute('data-position'));
    expect(positions).toContain('top-left');
    expect(positions).toContain('top-right');
    expect(positions).toContain('bottom-left');
    expect(positions).toContain('bottom-right');
    expect(positions).toContain('bottom-center');
  });

  it('active position button has full opacity', () => {
    const state = createMockState();
    state.options.position = 'bottom-right';
    renderSettingsPopover(state);

    const activeBtn = state.overlayElement!.querySelector(
      '[data-position="bottom-right"]'
    ) as HTMLElement;
    expect(activeBtn.style.opacity).toBe('1');
  });

  it('inactive position button has reduced opacity', () => {
    const state = createMockState();
    state.options.position = 'bottom-right';
    renderSettingsPopover(state);

    const inactiveBtn = state.overlayElement!.querySelector(
      '[data-position="top-left"]'
    ) as HTMLElement;
    expect(inactiveBtn.style.opacity).toBe('0.5');
  });

  it('clicking a position button updates state and saves settings', () => {
    const state = createMockState();
    state.options.position = 'bottom-left';
    renderSettingsPopover(state);

    const topRightBtn = state.overlayElement!.querySelector(
      '[data-position="top-right"]'
    ) as HTMLButtonElement;
    topRightBtn.click();

    expect(state.options.position).toBe('top-right');
    expect(state.settingsManager.saveSettings).toHaveBeenCalledWith({ position: 'top-right' });
    expect(state.render).toHaveBeenCalled();
  });

  // ---- Display section: Compact mode toggle ------------------------------

  it('contains a "Compact Mode" toggle row', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const allText = state.overlayElement!.textContent!;
    expect(allText).toContain('Compact Mode');
  });

  it('compact mode toggle calls toggleCompactMode on click', () => {
    const state = createMockState({ compactMode: false });
    renderSettingsPopover(state);

    // Find the toggle button adjacent to the "Compact Mode" label
    const spans = Array.from(state.overlayElement!.querySelectorAll('span'));
    const compactLabel = spans.find((s) => s.textContent === 'Compact Mode');
    expect(compactLabel).toBeTruthy();
    // The toggle is a sibling button in the same row div
    const row = compactLabel!.parentElement!;
    const toggleBtn = row.querySelector('button');
    expect(toggleBtn).toBeTruthy();
    toggleBtn!.click();

    expect(state.toggleCompactMode).toHaveBeenCalled();
  });

  it('shows keyboard shortcut hint for compact mode', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const allText = state.overlayElement!.textContent!;
    expect(allText).toContain('Cmd or Ctrl+Shift+M');
  });

  // ---- Display section: Accent color picker ------------------------------

  it('contains an "Accent Color" label', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const allText = state.overlayElement!.textContent!;
    expect(allText).toContain('Accent Color');
  });

  it('renders 6 color swatch buttons', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    // Color swatches are circular buttons with borderRadius 50%
    const buttons = Array.from(state.overlayElement!.querySelectorAll('button'));
    const swatches = buttons.filter((b) => b.style.borderRadius === '50%' && b.title);
    // 6 accent presets
    expect(swatches.length).toBeGreaterThanOrEqual(6);
  });

  it('active swatch has white border', () => {
    const state = createMockState();
    state.options.accentColor = '#10b981';
    renderSettingsPopover(state);

    const buttons = Array.from(state.overlayElement!.querySelectorAll('button'));
    const emeraldSwatch = buttons.find((b) => b.title === 'Emerald');
    expect(emeraldSwatch).toBeTruthy();
    expect(emeraldSwatch!.style.border).toContain('#fff');
  });

  it('inactive swatch has transparent border', () => {
    const state = createMockState();
    state.options.accentColor = '#10b981';
    renderSettingsPopover(state);

    const buttons = Array.from(state.overlayElement!.querySelectorAll('button'));
    const blueSwatch = buttons.find((b) => b.title === 'Blue');
    expect(blueSwatch).toBeTruthy();
    expect(blueSwatch!.style.border).toContain('transparent');
  });

  it('clicking a swatch updates accent color and saves', () => {
    const state = createMockState();
    state.options.accentColor = '#10b981';
    renderSettingsPopover(state);

    const buttons = Array.from(state.overlayElement!.querySelectorAll('button'));
    const purpleSwatch = buttons.find((b) => b.title === 'Purple');
    expect(purpleSwatch).toBeTruthy();
    purpleSwatch!.click();

    expect(state.options.accentColor).toBe('#a855f7');
    expect(state.settingsManager.saveSettings).toHaveBeenCalledWith({ accentColor: '#a855f7' });
    expect(state.render).toHaveBeenCalled();
  });

  // ---- Display section: Screenshot quality slider ------------------------

  it('contains a "Screenshot Quality" label', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const allText = state.overlayElement!.textContent!;
    expect(allText).toContain('Screenshot Quality');
  });

  it('renders a range input for quality', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const slider = state.overlayElement!.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).toBeTruthy();
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('1');
    expect(slider.step).toBe('0.01');
  });

  it('quality slider reflects current screenshotQuality value', () => {
    const state = createMockState();
    state.options.screenshotQuality = 0.8;
    renderSettingsPopover(state);

    const slider = state.overlayElement!.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider.value).toBe('0.8');
  });

  it('displays quality value as text', () => {
    const state = createMockState();
    state.options.screenshotQuality = 0.65;
    renderSettingsPopover(state);

    const allText = state.overlayElement!.textContent!;
    expect(allText).toContain('0.65');
  });

  it('quality slider input event updates state and display', () => {
    const state = createMockState();
    state.options.screenshotQuality = 0.65;
    renderSettingsPopover(state);

    const slider = state.overlayElement!.querySelector('input[type="range"]') as HTMLInputElement;
    slider.value = '0.42';
    slider.oninput!(new Event('input'));

    expect(state.options.screenshotQuality).toBe(0.42);
  });

  it('quality slider change event persists setting', () => {
    const state = createMockState();
    state.options.screenshotQuality = 0.65;
    renderSettingsPopover(state);

    const slider = state.overlayElement!.querySelector('input[type="range"]') as HTMLInputElement;
    slider.value = '0.9';
    slider.oninput!(new Event('input'));
    slider.onchange!(new Event('change'));

    expect(state.settingsManager.saveSettings).toHaveBeenCalledWith({ screenshotQuality: 0.9 });
  });

  // ---- Features section --------------------------------------------------

  it('contains Features section with toggle rows', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const allText = state.overlayElement!.textContent!;
    expect(allText).toContain('Features');
    expect(allText).toContain('Screenshot Button');
    expect(allText).toContain('Console Badges');
    expect(allText).toContain('Tooltips');
  });

  it('toggling Screenshot Button updates options and re-renders', () => {
    const state = createMockState();
    state.options.showScreenshot = true;
    renderSettingsPopover(state);

    const spans = Array.from(state.overlayElement!.querySelectorAll('span'));
    const screenshotLabel = spans.find((s) => s.textContent === 'Screenshot Button');
    expect(screenshotLabel).toBeTruthy();
    const row = screenshotLabel!.parentElement!;
    const toggleBtn = row.querySelector('button');
    expect(toggleBtn).toBeTruthy();
    toggleBtn!.click();

    expect(state.options.showScreenshot).toBe(false);
    expect(state.settingsManager.saveSettings).toHaveBeenCalledWith({ showScreenshot: false });
    expect(state.render).toHaveBeenCalled();
  });

  it('contains Save Method selector with Auto, Download, Local options', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const allText = state.overlayElement!.textContent!;
    expect(allText).toContain('Save Method');
    expect(allText).toContain('Auto');
    expect(allText).toContain('Download');
    expect(allText).toContain('Local');
  });

  it('Local save option is disabled when sweetlink not connected', () => {
    const state = createMockState({ sweetlinkConnected: false });
    renderSettingsPopover(state);

    const buttons = Array.from(state.overlayElement!.querySelectorAll('button'));
    const localBtn = buttons.find((b) => b.textContent === 'Local');
    expect(localBtn).toBeTruthy();
    expect(localBtn!.style.cursor).toBe('not-allowed');
    expect(localBtn!.style.opacity).toBe('0.5');
  });

  it('Local save option is enabled when sweetlink is connected', () => {
    const state = createMockState({ sweetlinkConnected: true });
    renderSettingsPopover(state);

    const buttons = Array.from(state.overlayElement!.querySelectorAll('button'));
    const localBtn = buttons.find((b) => b.textContent === 'Local');
    expect(localBtn).toBeTruthy();
    expect(localBtn!.style.cursor).toBe('pointer');
  });

  it('clicking a save method button updates saveLocation and saves', () => {
    const state = createMockState();
    state.options.saveLocation = 'auto';
    renderSettingsPopover(state);

    const buttons = Array.from(state.overlayElement!.querySelectorAll('button'));
    const downloadBtn = buttons.find((b) => b.textContent === 'Download');
    expect(downloadBtn).toBeTruthy();
    downloadBtn!.click();

    expect(state.options.saveLocation).toBe('download');
    expect(state.settingsManager.saveSettings).toHaveBeenCalledWith({ saveLocation: 'download' });
    expect(state.render).toHaveBeenCalled();
  });

  // ---- Metrics section ---------------------------------------------------

  it('contains Metrics section with all metric toggles', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const allText = state.overlayElement!.textContent!;
    expect(allText).toContain('Metrics');
    expect(allText).toContain('Breakpoint');
    expect(allText).toContain('FCP');
    expect(allText).toContain('LCP');
    expect(allText).toContain('CLS');
    expect(allText).toContain('INP');
    expect(allText).toContain('Page Size');
  });

  it('toggling a metric updates showMetrics, saves, and re-renders', () => {
    const state = createMockState();
    state.options.showMetrics.fcp = true;
    renderSettingsPopover(state);

    const spans = Array.from(state.overlayElement!.querySelectorAll('span'));
    const fcpLabel = spans.find((s) => s.textContent === 'FCP');
    expect(fcpLabel).toBeTruthy();
    const row = fcpLabel!.parentElement!;
    const toggleBtn = row.querySelector('button');
    expect(toggleBtn).toBeTruthy();
    toggleBtn!.click();

    expect(state.options.showMetrics.fcp).toBe(false);
    expect(state.settingsManager.saveSettings).toHaveBeenCalled();
    expect(state.render).toHaveBeenCalled();
  });

  // ---- Reset section -----------------------------------------------------

  it('contains a "Reset to Defaults" button', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const allText = state.overlayElement!.textContent!;
    expect(allText).toContain('Reset to Defaults');
  });

  it('clicking reset calls resetToDefaults and applySettings', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const buttons = Array.from(state.overlayElement!.querySelectorAll('button'));
    // The styled-button with "Reset to Defaults" text comes from createStyledButton mock
    const resetBtn = buttons.find((b) => b.textContent === 'Reset to Defaults');
    expect(resetBtn).toBeTruthy();
    resetBtn!.click();

    expect(state.settingsManager.resetToDefaults).toHaveBeenCalled();
    expect(state.applySettings).toHaveBeenCalled();
  });

  // ---- Positioning -------------------------------------------------------

  it('positions popover at bottom when position starts with "bottom"', () => {
    const state = createMockState();
    state.options.position = 'bottom-left';
    renderSettingsPopover(state);

    const popover = state.overlayElement!.firstElementChild as HTMLElement;
    expect(popover.style.bottom).toBe('70px');
  });

  it('positions popover at top when position starts with "top"', () => {
    const state = createMockState();
    state.options.position = 'top-right';
    renderSettingsPopover(state);

    const popover = state.overlayElement!.firstElementChild as HTMLElement;
    expect(popover.style.top).toBe('70px');
  });

  // ---- Display section label ---------------------------------------------

  it('contains Display section heading', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const allText = state.overlayElement!.textContent!;
    expect(allText).toContain('Display');
  });

  // ---- Position picker hover effects -------------------------------------

  it('hovering over inactive position button changes its style', () => {
    const state = createMockState();
    state.options.position = 'bottom-left';
    renderSettingsPopover(state);

    const topLeftBtn = state.overlayElement!.querySelector(
      '[data-position="top-left"]'
    ) as HTMLElement;
    expect(topLeftBtn.style.opacity).toBe('0.5');

    topLeftBtn.onmouseenter!(new MouseEvent('mouseenter'));
    expect(topLeftBtn.style.opacity).toBe('1');

    topLeftBtn.onmouseleave!(new MouseEvent('mouseleave'));
    expect(topLeftBtn.style.opacity).toBe('0.5');
  });

  it('hovering over active position button does not change opacity', () => {
    const state = createMockState();
    state.options.position = 'bottom-left';
    renderSettingsPopover(state);

    const activeBtn = state.overlayElement!.querySelector(
      '[data-position="bottom-left"]'
    ) as HTMLElement;
    expect(activeBtn.style.opacity).toBe('1');

    // onmouseenter is conditional, should not reduce opacity
    if (activeBtn.onmouseenter) {
      activeBtn.onmouseenter(new MouseEvent('mouseenter'));
    }
    expect(activeBtn.style.opacity).toBe('1');
  });

  // ---- Position picker titles --------------------------------------------

  it('position buttons have descriptive titles', () => {
    const state = createMockState();
    renderSettingsPopover(state);

    const titles = Array.from(state.overlayElement!.querySelectorAll('[data-position]')).map(
      (b) => (b as HTMLElement).title
    );
    expect(titles).toContain('Top Left');
    expect(titles).toContain('Top Right');
    expect(titles).toContain('Bottom Left');
    expect(titles).toContain('Bottom Right');
    expect(titles).toContain('Bottom Center');
  });
});
