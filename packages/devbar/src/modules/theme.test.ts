/**
 * Theme module tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCompactMode, setThemeMode, setupTheme } from './theme.js';
import type { DevBarState } from './types.js';

function createMockState(overrides: Partial<DevBarState> = {}): DevBarState {
  return {
    options: {
      showTooltips: true, saveLocation: 'auto',
      showScreenshot: true,
      showConsoleBadges: true,
      position: 'bottom-left',
      wsPort: 24680,
    },
    debug: { state: vi.fn(), perf: vi.fn(), ws: vi.fn(), render: vi.fn(), event: vi.fn() },
    themeMode: 'system',
    themeMediaQuery: null,
    themeMediaHandler: null,
    compactMode: false,
    settingsManager: {
      get: vi.fn((key: string) => {
        if (key === 'accentColor') return '#10b981';
        if (key === 'themeMode') return 'system';
        if (key === 'compactMode') return false;
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
        showTooltips: true, saveLocation: 'auto',
      })),
      saveSettings: vi.fn(),
    } as any,
    render: vi.fn(),
    ...overrides,
  } as any;
}

describe('setupTheme', () => {
  beforeEach(() => {
    document.head.textContent = '';
  });

  afterEach(() => {
    document.head.textContent = '';
  });

  it('loads theme mode from settings', () => {
    const state = createMockState();
    (state.settingsManager.getSettings as any).mockReturnValue({
      themeMode: 'dark',
      compactMode: false,
    });

    setupTheme(state);

    expect(state.themeMode).toBe('dark');
    expect(state.debug.state).toHaveBeenCalledWith('Theme loaded', { mode: 'dark' });
  });

  it('injects theme CSS variables into the document', () => {
    const state = createMockState();
    setupTheme(state);

    const styleEl = document.getElementById('devbar-theme-vars');
    expect(styleEl).not.toBeNull();
    expect(styleEl!.tagName).toBe('STYLE');
    expect(styleEl!.textContent).toContain('--devbar-color-primary');
  });

  it('sets up media query listener for system theme changes', () => {
    const state = createMockState();
    setupTheme(state);

    expect(state.themeMediaQuery).not.toBeNull();
    expect(state.themeMediaHandler).not.toBeNull();
  });

  it('dispatches custom event when system theme changes in system mode', () => {
    const state = createMockState();
    state.themeMode = 'system';

    setupTheme(state);

    // Simulate system theme change callback
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    if (state.themeMediaHandler) {
      state.themeMediaHandler({} as MediaQueryListEvent);
    }

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'devbar-theme-change',
      })
    );
    expect(state.render).toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });

  it('does not dispatch event when theme mode is not system', () => {
    const state = createMockState();
    (state.settingsManager.getSettings as any).mockReturnValue({
      themeMode: 'dark',
      compactMode: false,
    });

    setupTheme(state);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    if (state.themeMediaHandler) {
      state.themeMediaHandler({} as MediaQueryListEvent);
    }

    // Should not dispatch because themeMode is 'dark', not 'system'
    expect(dispatchSpy).not.toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });
});

describe('loadCompactMode', () => {
  it('loads compact mode from settings', () => {
    const state = createMockState();
    (state.settingsManager.getSettings as any).mockReturnValue({
      themeMode: 'system',
      compactMode: true,
    });

    loadCompactMode(state);

    expect(state.compactMode).toBe(true);
    expect(state.debug.state).toHaveBeenCalledWith('Compact mode loaded', { compactMode: true });
  });

  it('defaults to false when compactMode is false in settings', () => {
    const state = createMockState();
    (state.settingsManager.getSettings as any).mockReturnValue({
      themeMode: 'system',
      compactMode: false,
    });

    loadCompactMode(state);

    expect(state.compactMode).toBe(false);
  });
});

describe('setThemeMode', () => {
  beforeEach(() => {
    document.head.textContent = '';
  });

  afterEach(() => {
    document.head.textContent = '';
  });

  it('updates theme mode on state', () => {
    const state = createMockState();
    setThemeMode(state, 'dark');

    expect(state.themeMode).toBe('dark');
  });

  it('persists theme mode via settings manager', () => {
    const state = createMockState();
    setThemeMode(state, 'light');

    expect(state.settingsManager.saveSettings).toHaveBeenCalledWith({ themeMode: 'light' });
  });

  it('injects theme CSS for the new mode', () => {
    const state = createMockState();
    setThemeMode(state, 'light');

    const styleEl = document.getElementById('devbar-theme-vars');
    expect(styleEl).not.toBeNull();
    // Light theme should use darker emerald colors
    expect(styleEl!.textContent).toContain('#047857');
  });

  it('injects dark theme CSS', () => {
    const state = createMockState();
    setThemeMode(state, 'dark');

    const styleEl = document.getElementById('devbar-theme-vars');
    expect(styleEl).not.toBeNull();
    // Dark theme uses standard emerald
    expect(styleEl!.textContent).toContain('#10b981');
  });

  it('dispatches devbar-theme-change custom event', () => {
    const state = createMockState();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    setThemeMode(state, 'dark');

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'devbar-theme-change',
      })
    );

    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ mode: 'dark' });
    dispatchSpy.mockRestore();
  });

  it('calls render after setting theme', () => {
    const state = createMockState();
    setThemeMode(state, 'light');
    expect(state.render).toHaveBeenCalled();
  });

  it('logs the mode change with debug', () => {
    const state = createMockState();
    setThemeMode(state, 'dark');

    expect(state.debug.state).toHaveBeenCalledWith(
      'Theme mode changed',
      expect.objectContaining({ mode: 'dark' })
    );
  });
});
