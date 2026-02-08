/**
 * Theme setup and management for DevBar.
 *
 * Extracted from GlobalDevBar to reduce file size.
 */

import {
  getEffectiveTheme,
  getTheme,
  injectThemeCSS,
  setStoredThemeMode,
} from '../constants.js';
import type { ThemeMode } from '../types.js';
import type { DevBarState } from './types.js';

/**
 * Setup the theme system: load stored preference and listen for system changes.
 */
export function setupTheme(state: DevBarState): void {
  // Load stored theme preference from settings manager
  const settings = state.settingsManager.getSettings();
  state.themeMode = settings.themeMode;
  // Inject the appropriate theme CSS variables on initial load
  injectThemeCSS(getTheme(state.themeMode));
  state.debug.state('Theme loaded', { mode: state.themeMode });

  // Listen for system theme changes
  if (typeof window !== 'undefined' && window.matchMedia) {
    state.themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    state.themeMediaHandler = () => {
      if (state.themeMode === 'system') {
        // Re-inject theme CSS when system preference changes
        injectThemeCSS(getTheme(state.themeMode));
        state.debug.state('System theme changed', {
          effectiveTheme: getEffectiveTheme(state.themeMode),
        });
        // Dispatch event so host apps can respond
        window.dispatchEvent(
          new CustomEvent('devbar-theme-change', { detail: { mode: state.themeMode } })
        );
        state.render();
      }
    };
    state.themeMediaQuery.addEventListener('change', state.themeMediaHandler);
  }
}

/**
 * Load compact mode setting from storage.
 */
export function loadCompactMode(state: DevBarState): void {
  const settings = state.settingsManager.getSettings();
  state.compactMode = settings.compactMode;
  state.debug.state('Compact mode loaded', { compactMode: state.compactMode });
}

/**
 * Set the theme mode, persist it, inject CSS, and dispatch event.
 */
export function setThemeMode(state: DevBarState, mode: ThemeMode): void {
  state.themeMode = mode;
  state.settingsManager.saveSettings({ themeMode: mode });
  // Also update legacy storage key for backwards compatibility with getStoredThemeMode()
  setStoredThemeMode(mode);
  // Inject the appropriate theme CSS variables
  injectThemeCSS(getTheme(mode));
  state.debug.state('Theme mode changed', { mode, effectiveTheme: getEffectiveTheme(mode) });
  // Dispatch custom event so host apps can respond to theme changes
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('devbar-theme-change', { detail: { mode } }));
  }
  state.render();
}
