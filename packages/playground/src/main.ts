/**
 * devbar Playground - Main entry point
 *
 * Initializes the devbar and renders demo content for testing.
 * Uses shared theme from @ytspar/devbar for consistent styling.
 */

import {
  getEffectiveTheme,
  getGlobalDevBar,
  getStoredThemeMode,
  getTheme,
  initGlobalDevBar,
  injectThemeCSS,
  STORAGE_KEYS,
  type ThemeMode,
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

// Theme toggle — top-right corner
const themeToggle = document.createElement('button');
themeToggle.type = 'button';
themeToggle.className = 'theme-toggle';
themeToggle.setAttribute('aria-label', 'Toggle theme');

const SVG_NS = 'http://www.w3.org/2000/svg';
const THEME_CYCLE: Record<string, ThemeMode> = { dark: 'light', light: 'system', system: 'dark' };

/**
 * Create a 14x14 stroke-based SVG icon with a 24x24 viewBox
 */
function createStrokeIcon(buildContent: (svg: SVGSVGElement) => void): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({
    width: '14',
    height: '14',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
  })) {
    svg.setAttribute(k, v);
  }
  buildContent(svg);
  return svg;
}

function createSvgChild(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const themeConfig: Record<string, { label: string; icon: () => SVGSVGElement }> = {
  dark: {
    label: 'DARK',
    icon: () =>
      createStrokeIcon((svg) => {
        svg.appendChild(
          createSvgChild('path', {
            d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
          })
        );
      }),
  },
  light: {
    label: 'LIGHT',
    icon: () =>
      createStrokeIcon((svg) => {
        svg.appendChild(createSvgChild('circle', { cx: '12', cy: '12', r: '5' }));
        for (const d of [
          'M12 1v2',
          'M12 21v2',
          'M4.22 4.22l1.42 1.42',
          'M18.36 18.36l1.42 1.42',
          'M1 12h2',
          'M21 12h2',
          'M4.22 19.78l1.42-1.42',
          'M18.36 5.64l1.42-1.42',
        ]) {
          svg.appendChild(createSvgChild('path', { d }));
        }
      }),
  },
  system: {
    label: 'AUTO',
    icon: () =>
      createStrokeIcon((svg) => {
        svg.appendChild(createSvgChild('circle', { cx: '12', cy: '12', r: '9' }));
        svg.appendChild(
          createSvgChild('path', {
            d: 'M12 3a9 9 0 0 1 0 18z',
            fill: 'currentColor',
          })
        );
      }),
  },
};

function getCurrentThemeMode(): ThemeMode {
  const devbar = getGlobalDevBar();
  return devbar ? devbar.getThemeMode() : getStoredThemeMode();
}

function updateThemeToggle(): void {
  const mode = getCurrentThemeMode();
  const config = themeConfig[mode] ?? themeConfig.system;
  themeToggle.textContent = '';
  themeToggle.appendChild(config.icon());
  themeToggle.appendChild(document.createTextNode(` ${config.label}`));
}
updateThemeToggle();

themeToggle.onclick = () => {
  const next = THEME_CYCLE[getCurrentThemeMode()] ?? 'dark';
  const devbar = getGlobalDevBar();
  if (devbar) {
    devbar.setThemeMode(next);
  }
  updateThemeToggle();
};

window.addEventListener('devbar-theme-change', updateThemeToggle);
document.body.appendChild(themeToggle);

// Log some sample messages for testing console capture
console.log('[Playground] Application initialized');
console.info('[Playground] devbar and sweetlink packages loaded');
