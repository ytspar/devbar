/**
 * Settings Handler
 *
 * Handles saving and loading devbar settings to/from .devbar/settings.json
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { getProjectRoot } from '../index.js';

// ============================================================================
// Constants
// ============================================================================

/** Directory for devbar settings */
const SETTINGS_DIR = '.devbar';

/** Settings file name */
const SETTINGS_FILE = 'settings.json';

// ============================================================================
// Types
// ============================================================================

/**
 * devbar settings schema
 *
 * Canonical definition: packages/devbar/src/settings.ts
 * Keep in sync — this copy exists to avoid a circular dependency.
 */
export interface DevBarSettings {
  version: 1;

  // Display
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'bottom-center';
  themeMode: 'dark' | 'light' | 'system';
  compactMode: boolean;
  accentColor: string;

  // Features
  showScreenshot: boolean;
  showConsoleBadges: boolean;
  showTooltips: boolean;

  // Save behavior
  saveLocation: 'auto' | 'local' | 'download';

  // Screenshot
  screenshotQuality: number;

  // Metrics visibility
  showMetrics: {
    breakpoint: boolean;
    fcp: boolean;
    lcp: boolean;
    cls: boolean;
    inp: boolean;
    pageSize: boolean;
  };

  // Debug
  debug: boolean;
}

/**
 * Result from saving settings
 */
export interface SettingsSaveResult {
  settingsPath: string;
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * Get the settings directory path
 */
function getSettingsDir(): string {
  return join(getProjectRoot(), SETTINGS_DIR);
}

/**
 * Get the full path to the settings file
 */
function getSettingsPath(): string {
  return join(getSettingsDir(), SETTINGS_FILE);
}

/**
 * Handle save-settings command from browser
 *
 * Saves settings to .devbar/settings.json in the project root
 */
export async function handleSaveSettings(data: {
  settings: DevBarSettings;
}): Promise<SettingsSaveResult> {
  // Create directory if it doesn't exist
  await fs.mkdir(getSettingsDir(), { recursive: true });

  const settingsPath = getSettingsPath();
  await fs.writeFile(settingsPath, JSON.stringify(data.settings, null, 2), 'utf-8');

  console.log(`[Sweetlink] Settings saved to ${settingsPath}`);

  return { settingsPath };
}

/**
 * Handle load-settings command from browser
 *
 * Loads settings from .devbar/settings.json if it exists
 * Returns null if file doesn't exist
 */
export async function handleLoadSettings(): Promise<DevBarSettings | null> {
  const settingsPath = getSettingsPath();

  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content) as DevBarSettings;
    console.log(`[Sweetlink] Settings loaded from ${settingsPath}`);
    return settings;
  } catch (error) {
    // File doesn't exist or is invalid
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('[Sweetlink] No settings file found, using defaults');
    } else {
      console.warn('[Sweetlink] Failed to load settings:', error);
    }
    return null;
  }
}
