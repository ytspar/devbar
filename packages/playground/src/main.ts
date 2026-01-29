/**
 * DevTools Playground - Main entry point
 *
 * Initializes the DevBar and renders demo content for testing.
 * Uses shared theme from @ytspar/devbar for consistent styling.
 */

import {
  injectThemeCSS,
  getStoredThemeMode,
  getEffectiveTheme,
  getTheme,
  STORAGE_KEYS,
} from '@ytspar/devbar';
import { createDemoContent } from './demo-content';
import { initPlaygroundControls } from './playground-controls';

/**
 * Apply the current theme to the playground
 */
function applyTheme(): void {
  const mode = getStoredThemeMode();
  const effectiveTheme = getEffectiveTheme(mode);
  const theme = getTheme(mode);

  // Inject the appropriate theme CSS variables
  injectThemeCSS(theme);

  // Update body class for any theme-specific overrides
  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add(`theme-${effectiveTheme}`);
}

// Apply theme initially
applyTheme();

// Listen for theme changes via localStorage
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEYS.themeMode) {
    applyTheme();
  }
});

// Listen for system preference changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const mode = getStoredThemeMode();
  if (mode === 'system') {
    applyTheme();
  }
});

// Custom event for theme changes within the same window
window.addEventListener('devbar-theme-change', () => {
  applyTheme();
});

// Render demo content
const app = document.getElementById('app');
if (app) {
  app.appendChild(createDemoContent());
}

// Initialize playground controls (includes DevBar initialization)
initPlaygroundControls();

// Log some sample messages for testing console capture
console.log('[Playground] Application initialized');
console.info('[Playground] DevBar and Sweetlink packages loaded');
