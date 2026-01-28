/**
 * DevTools Playground - Main entry point
 *
 * Initializes the DevBar and renders demo content for testing.
 * Uses shared theme from @ytspar/devbar for consistent styling.
 */

import {
  initGlobalDevBar,
  injectThemeCSS,
  DEVBAR_THEME,
} from '@ytspar/devbar';
import { createDemoContent } from './demo-content';
import { injectBreakpointIndicator } from './theme';

// Inject DevBar theme CSS variables (used by playground styles)
injectThemeCSS();

// Inject breakpoint indicator styles
injectBreakpointIndicator();

// Initialize DevBar
initGlobalDevBar({
  position: 'bottom-left',
  accentColor: DEVBAR_THEME.colors.primary,
  showMetrics: {
    breakpoint: true,
    fcp: true,
    lcp: true,
    pageSize: true,
  },
  showScreenshot: true,
  showConsoleBadges: true,
});

// Render demo content
const app = document.getElementById('app');
if (app) {
  app.appendChild(createDemoContent());
}

// Log some sample messages for testing console capture
console.log('[Playground] Application initialized');
console.info('[Playground] DevBar and Sweetlink packages loaded');
