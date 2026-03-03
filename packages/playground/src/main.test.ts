/**
 * Smoke tests for the playground main entry point.
 *
 * Tests theme logic and page initialization in isolation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @ytspar/devbar before importing anything that uses it
vi.mock('@ytspar/devbar', () => ({
  getEffectiveTheme: vi.fn(() => 'dark'),
  getGlobalDevBar: vi.fn(() => null),
  getStoredThemeMode: vi.fn(() => 'dark'),
  getTheme: vi.fn(() => ({
    colors: {},
    fonts: {},
    typography: {},
    radius: {},
    shadows: {},
  })),
  initGlobalDevBar: vi.fn(),
  injectThemeCSS: vi.fn(),
  STORAGE_KEYS: { themeMode: 'devbar-theme-mode' },
}));

// Mock landing-content to avoid heavy DOM construction
vi.mock('./landing-content.js', () => ({
  createChangelogSection: vi.fn(() => document.createElement('section')),
  createFeaturesSection: vi.fn(() => document.createElement('section')),
  createLandingHero: vi.fn(() => document.createElement('section')),
  createPackagesSection: vi.fn(() => document.createElement('section')),
  createQuickStartSection: vi.fn(() => document.createElement('section')),
  createSweetlinkSection: vi.fn(() => document.createElement('section')),
}));

vi.mock('./demo-content.js', () => ({
  createDemoContent: vi.fn(() => document.createElement('section')),
}));

describe('Playground Main', () => {
  let app: HTMLElement;

  beforeEach(() => {
    app = document.createElement('div');
    app.id = 'app';
    document.body.appendChild(app);
  });

  afterEach(() => {
    app.remove();
    vi.restoreAllMocks();
  });

  it('renders landing sections into #app', async () => {
    await import('./main.js');

    // The module should have appended children to #app
    expect(app.children.length).toBeGreaterThan(0);
  });

  it('creates a theme toggle button', async () => {
    await import('./main.js');

    const toggle = document.querySelector('.theme-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-label')).toBe('Toggle theme');
  });

  it('initializes devbar', async () => {
    const { initGlobalDevBar } = await import('@ytspar/devbar');
    await import('./main.js');

    expect(initGlobalDevBar).toHaveBeenCalled();
  });
});
