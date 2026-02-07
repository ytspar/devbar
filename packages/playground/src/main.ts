/**
 * devbar Playground - Main entry point
 *
 * Initializes the devbar and renders demo content for testing.
 * Uses shared theme from @ytspar/devbar for consistent styling.
 */

import {
  getEffectiveTheme,
  getStoredThemeMode,
  getTheme,
  initGlobalDevBar,
  injectThemeCSS,
  STORAGE_KEYS,
} from '@ytspar/devbar';
import { createDemoContent } from './demo-content.js';
import {
  createFeaturesSection,
  createLandingHero,
  createPackagesSection,
  createQuickStartSection,
  createSweetlinkSection,
} from './landing-content.js';

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

// Render landing page and demo content
const app = document.getElementById('app');
if (app) {
  // Landing sections
  app.appendChild(createLandingHero());
  app.appendChild(createFeaturesSection());
  app.appendChild(createSweetlinkSection());
  app.appendChild(createPackagesSection());
  app.appendChild(createQuickStartSection());

  // Interactive demo
  app.appendChild(createDemoContent());
}

// Initialize devbar (use gear icon to access settings)
initGlobalDevBar();

// Log some sample messages for testing console capture
console.log('[Playground] Application initialized');
console.info('[Playground] devbar and sweetlink packages loaded');
