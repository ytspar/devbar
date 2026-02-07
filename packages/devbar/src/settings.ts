/**
 * devbar Settings Persistence
 *
 * Handles saving and loading devbar settings with Sweetlink server persistence
 * and localStorage fallback.
 */

import type { ThemeMode } from './types.js';

// ============================================================================
// Settings Schema
// ============================================================================

/**
 * Position options for the devbar
 */
export type DevBarPosition =
  | 'bottom-left'
  | 'bottom-right'
  | 'top-left'
  | 'top-right'
  | 'bottom-center';

/**
 * Metrics visibility configuration
 */
export interface MetricsVisibility {
  breakpoint: boolean;
  fcp: boolean;
  lcp: boolean;
  cls: boolean;
  inp: boolean;
  pageSize: boolean;
}

/**
 * Complete devbar settings schema
 */
export interface DevBarSettings {
  /** Schema version for future migrations */
  version: 1;

  // Display
  position: DevBarPosition;
  themeMode: ThemeMode;
  compactMode: boolean;
  accentColor: string;

  // Features
  showScreenshot: boolean;
  showConsoleBadges: boolean;
  showTooltips: boolean;

  // Metrics visibility
  showMetrics: MetricsVisibility;

  // Debug (not exposed in UI, but persisted)
  debug: boolean;
}

// ============================================================================
// Default Settings
// ============================================================================

/** Default accent color (emerald) */
export const DEFAULT_ACCENT_COLOR = '#10b981';

/** Preset accent colors for the color picker */
export const ACCENT_COLOR_PRESETS = [
  { name: 'Emerald', value: '#10b981' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Cyan', value: '#06b6d4' },
] as const;

/**
 * Default settings used when no saved settings exist
 */
export const DEFAULT_SETTINGS: DevBarSettings = {
  version: 1,

  // Display
  position: 'bottom-left',
  themeMode: 'system',
  compactMode: false,
  accentColor: DEFAULT_ACCENT_COLOR,

  // Features
  showScreenshot: true,
  showConsoleBadges: true,
  showTooltips: true,

  // Metrics visibility
  showMetrics: {
    breakpoint: true,
    fcp: true,
    lcp: true,
    cls: true,
    inp: true,
    pageSize: true,
  },

  // Debug
  debug: false,
};

// ============================================================================
// Storage Keys
// ============================================================================

/** LocalStorage key for devbar settings fallback */
export const SETTINGS_STORAGE_KEY = 'devbar-settings';

// ============================================================================
// Settings Manager
// ============================================================================

/**
 * Callback type for settings change events
 */
export type SettingsChangeCallback = (settings: DevBarSettings) => void;

/**
 * SettingsManager handles loading and saving devbar settings.
 *
 * Storage priority:
 * 1. Sweetlink server (.devbar/settings.json) when connected
 * 2. localStorage fallback when disconnected
 *
 * Settings are always saved to localStorage as a backup, ensuring
 * settings persist even when Sweetlink is unavailable.
 */
export class SettingsManager {
  private settings: DevBarSettings;
  private ws: WebSocket | null = null;
  private sweetlinkConnected = false;
  private changeCallbacks: SettingsChangeCallback[] = [];
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingLoadResolvers: Array<(settings: DevBarSettings) => void> = [];

  /** Debounce delay for saving settings (ms) */
  private static readonly SAVE_DEBOUNCE_MS = 300;

  constructor() {
    // Load settings from localStorage immediately (synchronous)
    // This ensures settings are available before first render
    this.settings = this.loadFromLocalStorage();
  }

  /**
   * Set the WebSocket connection for Sweetlink communication
   */
  setWebSocket(ws: WebSocket | null): void {
    this.ws = ws;
    this.sweetlinkConnected = ws !== null && ws.readyState === WebSocket.OPEN;
  }

  /**
   * Update connection status (called when WebSocket connects/disconnects)
   */
  setConnected(connected: boolean): void {
    this.sweetlinkConnected = connected;
  }

  /**
   * Get current settings (synchronous)
   */
  getSettings(): DevBarSettings {
    return { ...this.settings };
  }

  /**
   * Get a specific setting value
   */
  get<K extends keyof DevBarSettings>(key: K): DevBarSettings[K] {
    return this.settings[key];
  }

  /**
   * Load settings from storage
   *
   * When Sweetlink is connected, requests settings from the server.
   * Otherwise, loads from localStorage.
   */
  async loadSettings(): Promise<DevBarSettings> {
    // Always start with localStorage to have immediate values
    const localSettings = this.loadFromLocalStorage();
    this.settings = localSettings;

    // If Sweetlink is connected, request server settings
    if (this.sweetlinkConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const serverSettings = await this.loadFromServer();
        if (serverSettings) {
          this.settings = serverSettings;
          // Sync to localStorage as backup
          this.saveToLocalStorage(this.settings);
        }
      } catch (error) {
        console.warn('[devbar] Failed to load settings from server, using localStorage:', error);
      }
    }

    return this.settings;
  }

  /**
   * Handle settings loaded from server (called by WebSocket message handler)
   */
  handleSettingsLoaded(settings: DevBarSettings | null): void {
    if (settings) {
      this.settings = this.migrateSettings(settings);
      this.saveToLocalStorage(this.settings);
      this.notifyChange();
    }

    // Resolve any pending load promises
    const resolvers = this.pendingLoadResolvers;
    this.pendingLoadResolvers = [];
    for (const resolve of resolvers) {
      resolve(this.settings);
    }
  }

  /**
   * Save settings (debounced)
   *
   * Saves to both Sweetlink server (if connected) and localStorage.
   */
  saveSettings(partial: Partial<DevBarSettings>): void {
    // Merge with current settings
    this.settings = { ...this.settings, ...partial };

    // Debounce saves to avoid excessive writes
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.performSave();
    }, SettingsManager.SAVE_DEBOUNCE_MS);
  }

  /**
   * Save settings immediately without debouncing
   */
  saveSettingsNow(partial: Partial<DevBarSettings>): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    this.settings = { ...this.settings, ...partial };
    this.performSave();
  }

  /**
   * Reset settings to defaults
   */
  resetToDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.performSave();
    this.notifyChange();
  }

  /**
   * Subscribe to settings changes
   */
  onChange(callback: SettingsChangeCallback): () => void {
    this.changeCallbacks.push(callback);
    return () => {
      this.changeCallbacks = this.changeCallbacks.filter((cb) => cb !== callback);
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private performSave(): void {
    // Always save to localStorage as backup
    this.saveToLocalStorage(this.settings);

    // Save to server if connected (saveToServer checks readyState internally)
    if (this.sweetlinkConnected) {
      this.saveToServer(this.settings);
    }

    this.notifyChange();
  }

  private notifyChange(): void {
    for (const callback of this.changeCallbacks) {
      try {
        callback(this.settings);
      } catch (error) {
        console.error('[devbar] Settings change callback error:', error);
      }
    }
  }

  private loadFromLocalStorage(): DevBarSettings {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_SETTINGS };
    }

    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!stored) {
        return { ...DEFAULT_SETTINGS };
      }

      const parsed = JSON.parse(stored) as Partial<DevBarSettings>;
      return this.migrateSettings(parsed);
    } catch (error) {
      console.warn('[devbar] Failed to parse localStorage settings:', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  private saveToLocalStorage(settings: DevBarSettings): void {
    if (typeof localStorage === 'undefined') return;

    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn('[devbar] Failed to save settings to localStorage:', error);
    }
  }

  private async loadFromServer(): Promise<DevBarSettings | null> {
    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        resolve(null);
        return;
      }

      // Store resolver to be called when settings-loaded message arrives
      this.pendingLoadResolvers.push(resolve);

      // Request settings from server
      this.ws.send(JSON.stringify({ type: 'load-settings' }));

      // Timeout after 5 seconds
      setTimeout(() => {
        const index = this.pendingLoadResolvers.indexOf(resolve);
        if (index !== -1) {
          this.pendingLoadResolvers.splice(index, 1);
          resolve(null);
        }
      }, 5000);
    });
  }

  private saveToServer(settings: DevBarSettings): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        type: 'save-settings',
        data: { settings },
      })
    );
  }

  /**
   * Migrate settings from older versions and fill in missing defaults
   */
  private migrateSettings(partial: Partial<DevBarSettings>): DevBarSettings {
    // Merge partial settings over defaults, then handle nested objects specially
    return {
      ...DEFAULT_SETTINGS,
      ...partial,
      // Always use current schema version
      version: 1,
      // Deep merge showMetrics to preserve unset defaults
      showMetrics: {
        ...DEFAULT_SETTINGS.showMetrics,
        ...partial.showMetrics,
      },
    };
  }
}

/**
 * Singleton settings manager instance
 */
let settingsManagerInstance: SettingsManager | null = null;

/**
 * Get the singleton SettingsManager instance
 */
export function getSettingsManager(): SettingsManager {
  if (!settingsManagerInstance) {
    settingsManagerInstance = new SettingsManager();
  }
  return settingsManagerInstance;
}
