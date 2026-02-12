/**
 * Settings Module Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCENT_COLOR_PRESETS,
  DEFAULT_SETTINGS,
  type DevBarSettings,
  SettingsManager,
} from './settings.js';

/** Mirror the internal storage key used by SettingsManager */
const SETTINGS_STORAGE_KEY = 'devbar-settings';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

describe('settings', () => {
  describe('DEFAULT_SETTINGS', () => {
    it('has correct version', () => {
      expect(DEFAULT_SETTINGS.version).toBe(1);
    });

    it('has default position as bottom-left', () => {
      expect(DEFAULT_SETTINGS.position).toBe('bottom-left');
    });

    it('has default themeMode as system', () => {
      expect(DEFAULT_SETTINGS.themeMode).toBe('system');
    });

    it('has compactMode disabled by default', () => {
      expect(DEFAULT_SETTINGS.compactMode).toBe(false);
    });

    it('has all metrics enabled by default', () => {
      expect(DEFAULT_SETTINGS.showMetrics).toEqual({
        breakpoint: true,
        fcp: true,
        lcp: true,
        cls: true,
        inp: true,
        pageSize: true,
      });
    });

    it('has all features enabled by default', () => {
      expect(DEFAULT_SETTINGS.showScreenshot).toBe(true);
      expect(DEFAULT_SETTINGS.showConsoleBadges).toBe(true);
      expect(DEFAULT_SETTINGS.showTooltips).toBe(true);
    });
  });

  describe('ACCENT_COLOR_PRESETS', () => {
    it('has 6 color presets', () => {
      expect(ACCENT_COLOR_PRESETS).toHaveLength(6);
    });

    it('includes emerald as first preset', () => {
      expect(ACCENT_COLOR_PRESETS[0]).toEqual({ name: 'Emerald', value: '#10b981' });
    });

    it('all presets have valid hex colors', () => {
      const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
      for (const preset of ACCENT_COLOR_PRESETS) {
        expect(preset.value).toMatch(hexColorRegex);
        expect(preset.name).toBeTruthy();
      }
    });
  });

  describe('SettingsManager', () => {
    let manager: SettingsManager;

    beforeEach(() => {
      localStorageMock.clear();
      manager = new SettingsManager();
    });

    describe('getSettings', () => {
      it('returns default settings initially', () => {
        const settings = manager.getSettings();
        expect(settings).toEqual(DEFAULT_SETTINGS);
      });

      it('returns a copy, not the original object', () => {
        const settings1 = manager.getSettings();
        const settings2 = manager.getSettings();
        expect(settings1).not.toBe(settings2);
        expect(settings1).toEqual(settings2);
      });
    });

    describe('get', () => {
      it('returns individual setting values', () => {
        expect(manager.get('position')).toBe('bottom-left');
        expect(manager.get('themeMode')).toBe('system');
        expect(manager.get('compactMode')).toBe(false);
      });
    });

    describe('saveSettings', () => {
      it('merges partial settings', async () => {
        manager.saveSettingsNow({ position: 'top-right' });
        expect(manager.get('position')).toBe('top-right');
        // Other settings unchanged
        expect(manager.get('themeMode')).toBe('system');
      });

      it('saves to localStorage', () => {
        manager.saveSettingsNow({ themeMode: 'dark' });
        const stored = JSON.parse(localStorageMock.getItem(SETTINGS_STORAGE_KEY)!);
        expect(stored.themeMode).toBe('dark');
      });

      it('preserves all settings in localStorage', () => {
        manager.saveSettingsNow({ compactMode: true });
        const stored = JSON.parse(
          localStorageMock.getItem(SETTINGS_STORAGE_KEY)!
        ) as DevBarSettings;
        expect(stored.version).toBe(1);
        expect(stored.position).toBe('bottom-left');
        expect(stored.compactMode).toBe(true);
      });
    });

    describe('loadSettings', () => {
      it('loads settings from localStorage', async () => {
        const customSettings: DevBarSettings = {
          ...DEFAULT_SETTINGS,
          position: 'top-left',
          themeMode: 'light',
        };
        localStorageMock.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(customSettings));

        const newManager = new SettingsManager();
        await newManager.loadSettings();

        expect(newManager.get('position')).toBe('top-left');
        expect(newManager.get('themeMode')).toBe('light');
      });

      it('returns defaults when localStorage is empty', async () => {
        await manager.loadSettings();
        expect(manager.getSettings()).toEqual(DEFAULT_SETTINGS);
      });

      it('handles invalid JSON in localStorage', async () => {
        localStorageMock.setItem(SETTINGS_STORAGE_KEY, 'invalid json');
        await manager.loadSettings();
        expect(manager.getSettings()).toEqual(DEFAULT_SETTINGS);
      });
    });

    describe('resetToDefaults', () => {
      it('resets all settings to defaults', () => {
        manager.saveSettingsNow({
          position: 'top-right',
          themeMode: 'dark',
          compactMode: true,
          accentColor: '#ff0000',
        });

        manager.resetToDefaults();

        expect(manager.getSettings()).toEqual(DEFAULT_SETTINGS);
      });

      it('persists reset to localStorage', () => {
        manager.saveSettingsNow({ themeMode: 'dark' });
        manager.resetToDefaults();

        const stored = JSON.parse(localStorageMock.getItem(SETTINGS_STORAGE_KEY)!);
        expect(stored).toEqual(DEFAULT_SETTINGS);
      });
    });

    describe('onChange', () => {
      it('calls callback when settings change', () => {
        const callback = vi.fn();
        manager.onChange(callback);

        manager.saveSettingsNow({ themeMode: 'dark' });

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({ themeMode: 'dark' }));
      });

      it('returns unsubscribe function', () => {
        const callback = vi.fn();
        const unsubscribe = manager.onChange(callback);

        manager.saveSettingsNow({ themeMode: 'dark' });
        expect(callback).toHaveBeenCalledTimes(1);

        unsubscribe();
        manager.saveSettingsNow({ themeMode: 'light' });
        expect(callback).toHaveBeenCalledTimes(1); // Not called again
      });
    });

    describe('setConnected', () => {
      it('updates connection state', () => {
        manager.setConnected(true);
        // Internal state - we test behavior instead of state
        expect(manager.getSettings()).toEqual(DEFAULT_SETTINGS);
      });
    });

    describe('settings migration', () => {
      it('fills in missing properties with defaults', async () => {
        // Simulate old/partial settings in localStorage
        const partialSettings = {
          version: 1,
          position: 'top-right',
          // Missing other properties
        };
        localStorageMock.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(partialSettings));

        const newManager = new SettingsManager();
        await newManager.loadSettings();

        // Position should be loaded
        expect(newManager.get('position')).toBe('top-right');
        // Missing properties should have defaults
        expect(newManager.get('themeMode')).toBe('system');
        expect(newManager.get('compactMode')).toBe(false);
        expect(newManager.get('showMetrics')).toEqual(DEFAULT_SETTINGS.showMetrics);
      });

      it('merges partial showMetrics with defaults', async () => {
        const partialSettings = {
          version: 1,
          showMetrics: {
            breakpoint: false,
            // Missing other metrics
          },
        };
        localStorageMock.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(partialSettings));

        const newManager = new SettingsManager();
        await newManager.loadSettings();

        expect(newManager.get('showMetrics')).toEqual({
          breakpoint: false, // Overridden
          fcp: true, // Default
          lcp: true, // Default
          cls: true, // Default
          inp: true, // Default
          pageSize: true, // Default
        });
      });
    });

    describe('handleSettingsLoaded', () => {
      it('applies server settings', () => {
        const serverSettings: DevBarSettings = {
          ...DEFAULT_SETTINGS,
          position: 'bottom-center',
          accentColor: '#ff0000',
        };

        manager.handleSettingsLoaded(serverSettings);

        expect(manager.get('position')).toBe('bottom-center');
        expect(manager.get('accentColor')).toBe('#ff0000');
      });

      it('handles null gracefully', () => {
        manager.saveSettingsNow({ themeMode: 'dark' });
        manager.handleSettingsLoaded(null);

        // Settings unchanged
        expect(manager.get('themeMode')).toBe('dark');
      });

      it('notifies change listeners', () => {
        const callback = vi.fn();
        manager.onChange(callback);

        const serverSettings: DevBarSettings = {
          ...DEFAULT_SETTINGS,
          themeMode: 'light',
        };

        manager.handleSettingsLoaded(serverSettings);

        expect(callback).toHaveBeenCalled();
      });
    });
  });
});
