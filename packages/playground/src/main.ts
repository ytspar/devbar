/**
 * DevTools Playground - Main entry point
 *
 * Initializes the DevBar and renders demo content for testing.
 * Uses shared theme from @ytspar/devbar for consistent styling.
 */

import { injectThemeCSS } from '@ytspar/devbar';
import { createDemoContent } from './demo-content';
import { initPlaygroundControls } from './playground-controls';

// Inject DevBar theme CSS variables (used by playground styles)
injectThemeCSS();

// Render demo content first
const app = document.getElementById('app');
if (app) {
  app.appendChild(createDemoContent());
}

// Initialize playground controls (includes DevBar initialization)
initPlaygroundControls();

// Log some sample messages for testing console capture
console.log('[Playground] Application initialized');
console.info('[Playground] DevBar and Sweetlink packages loaded');
