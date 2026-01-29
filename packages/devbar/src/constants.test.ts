import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BUTTON_COLORS,
  CATEGORY_COLORS,
  DEVBAR_THEME,
  DEVBAR_THEME_LIGHT,
  generateBreakpointCSS,
  generateThemeCSSVars,
  getEffectiveTheme,
  getStoredThemeMode,
  getTheme,
  getThemeColors,
  injectThemeCSS,
  MAX_CONSOLE_LOGS,
  STORAGE_KEYS,
  setStoredThemeMode,
  TAILWIND_BREAKPOINTS,
  WS_PORT,
} from './constants.js';

describe('TAILWIND_BREAKPOINTS', () => {
  it('has expected breakpoint keys', () => {
    expect(TAILWIND_BREAKPOINTS).toHaveProperty('base');
    expect(TAILWIND_BREAKPOINTS).toHaveProperty('sm');
    expect(TAILWIND_BREAKPOINTS).toHaveProperty('md');
    expect(TAILWIND_BREAKPOINTS).toHaveProperty('lg');
    expect(TAILWIND_BREAKPOINTS).toHaveProperty('xl');
    expect(TAILWIND_BREAKPOINTS).toHaveProperty('2xl');
  });

  it('has correct min values', () => {
    expect(TAILWIND_BREAKPOINTS.base.min).toBe(0);
    expect(TAILWIND_BREAKPOINTS.sm.min).toBe(640);
    expect(TAILWIND_BREAKPOINTS.md.min).toBe(768);
    expect(TAILWIND_BREAKPOINTS.lg.min).toBe(1024);
    expect(TAILWIND_BREAKPOINTS.xl.min).toBe(1280);
    expect(TAILWIND_BREAKPOINTS['2xl'].min).toBe(1536);
  });

  it('has labels for each breakpoint', () => {
    Object.values(TAILWIND_BREAKPOINTS).forEach((bp) => {
      expect(bp.label).toBeDefined();
      expect(typeof bp.label).toBe('string');
    });
  });
});

describe('BUTTON_COLORS', () => {
  it('has expected button color keys', () => {
    expect(BUTTON_COLORS).toHaveProperty('screenshot');
    expect(BUTTON_COLORS).toHaveProperty('review');
    expect(BUTTON_COLORS).toHaveProperty('outline');
    expect(BUTTON_COLORS).toHaveProperty('schema');
    expect(BUTTON_COLORS).toHaveProperty('error');
    expect(BUTTON_COLORS).toHaveProperty('warning');
  });

  it('has valid hex color values', () => {
    Object.values(BUTTON_COLORS).forEach((color) => {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});

describe('CATEGORY_COLORS', () => {
  it('has expected category keys', () => {
    expect(CATEGORY_COLORS).toHaveProperty('heading');
    expect(CATEGORY_COLORS).toHaveProperty('sectioning');
    expect(CATEGORY_COLORS).toHaveProperty('landmark');
    expect(CATEGORY_COLORS).toHaveProperty('grouping');
    expect(CATEGORY_COLORS).toHaveProperty('form');
    expect(CATEGORY_COLORS).toHaveProperty('table');
    expect(CATEGORY_COLORS).toHaveProperty('list');
    expect(CATEGORY_COLORS).toHaveProperty('other');
  });

  it('has valid hex color values', () => {
    Object.values(CATEGORY_COLORS).forEach((color) => {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});

describe('DEVBAR_THEME', () => {
  it('has colors section', () => {
    expect(DEVBAR_THEME.colors).toBeDefined();
    expect(DEVBAR_THEME.colors.primary).toBeDefined();
    expect(DEVBAR_THEME.colors.error).toBeDefined();
    expect(DEVBAR_THEME.colors.bg).toBeDefined();
    expect(DEVBAR_THEME.colors.text).toBeDefined();
  });

  it('has fonts section', () => {
    expect(DEVBAR_THEME.fonts).toBeDefined();
    expect(DEVBAR_THEME.fonts.mono).toBeDefined();
  });

  it('has radius section', () => {
    expect(DEVBAR_THEME.radius).toBeDefined();
    expect(DEVBAR_THEME.radius.sm).toBeDefined();
    expect(DEVBAR_THEME.radius.md).toBeDefined();
    expect(DEVBAR_THEME.radius.lg).toBeDefined();
  });

  it('has shadows section', () => {
    expect(DEVBAR_THEME.shadows).toBeDefined();
    expect(DEVBAR_THEME.shadows.sm).toBeDefined();
    expect(DEVBAR_THEME.shadows.md).toBeDefined();
    expect(DEVBAR_THEME.shadows.lg).toBeDefined();
    expect(DEVBAR_THEME.shadows.glow).toBeDefined();
  });

  it('has transitions section', () => {
    expect(DEVBAR_THEME.transitions).toBeDefined();
    expect(DEVBAR_THEME.transitions.fast).toBeDefined();
  });
});

describe('generateThemeCSSVars', () => {
  it('generates CSS custom properties string', () => {
    const css = generateThemeCSSVars();
    expect(css).toContain(':root');
    expect(css).toContain('--devbar-color-primary');
    expect(css).toContain('--devbar-color-error');
    expect(css).toContain('--devbar-font-mono');
    expect(css).toContain('--devbar-radius-sm');
    expect(css).toContain('--devbar-shadow-sm');
    expect(css).toContain('--devbar-transition-fast');
  });

  it('uses theme values', () => {
    const css = generateThemeCSSVars();
    expect(css).toContain(DEVBAR_THEME.colors.primary);
    expect(css).toContain(DEVBAR_THEME.colors.error);
  });

  it('accepts default theme', () => {
    const css = generateThemeCSSVars(DEVBAR_THEME);
    expect(css).toContain(DEVBAR_THEME.colors.primary);
  });
});

describe('injectThemeCSS', () => {
  beforeEach(() => {
    const existing = document.getElementById('devbar-theme-vars');
    if (existing) existing.remove();
  });

  afterEach(() => {
    const existing = document.getElementById('devbar-theme-vars');
    if (existing) existing.remove();
  });

  it('creates style element with theme CSS', () => {
    injectThemeCSS();
    const style = document.getElementById('devbar-theme-vars') as HTMLStyleElement;
    expect(style).not.toBeNull();
    expect(style.tagName).toBe('STYLE');
    expect(style.textContent).toContain('--devbar-color-primary');
  });

  it('updates existing style element', () => {
    injectThemeCSS();
    injectThemeCSS(DEVBAR_THEME);

    const styles = document.querySelectorAll('#devbar-theme-vars');
    expect(styles.length).toBe(1);
    expect((styles[0] as HTMLStyleElement).textContent).toContain(DEVBAR_THEME.colors.primary);
  });
});

describe('generateBreakpointCSS', () => {
  it('generates base style without media query', () => {
    const css = generateBreakpointCSS('.test', 'color', {
      base: 'red',
      sm: 'blue',
      md: 'green',
      lg: 'yellow',
      xl: 'orange',
      '2xl': 'purple',
    });
    expect(css).toContain('.test { color: red; }');
  });

  it('generates media queries for breakpoints', () => {
    const css = generateBreakpointCSS('.test', 'width', {
      base: '100%',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    });
    expect(css).toContain('@media (min-width: 640px)');
    expect(css).toContain('@media (min-width: 768px)');
    expect(css).toContain('@media (min-width: 1024px)');
    expect(css).toContain('@media (min-width: 1280px)');
    expect(css).toContain('@media (min-width: 1536px)');
  });

  it('skips breakpoints with empty values', () => {
    const css = generateBreakpointCSS('.test', 'color', {
      base: 'red',
      sm: '',
      md: 'green',
      lg: '',
      xl: '',
      '2xl': '',
    });
    expect(css).toContain('.test { color: red; }');
    expect(css).toContain('@media (min-width: 768px)');
    expect(css).not.toContain('@media (min-width: 640px)');
    expect(css).not.toContain('@media (min-width: 1024px)');
  });
});

describe('Constants values', () => {
  it('MAX_CONSOLE_LOGS is a reasonable positive number', () => {
    expect(MAX_CONSOLE_LOGS).toBeGreaterThan(0);
    expect(MAX_CONSOLE_LOGS).toBeLessThanOrEqual(1000);
  });

  it('WS_PORT is a valid port number', () => {
    expect(WS_PORT).toBeGreaterThan(1024);
    expect(WS_PORT).toBeLessThan(65536);
  });
});

describe('STORAGE_KEYS', () => {
  it('has themeMode key', () => {
    expect(STORAGE_KEYS.themeMode).toBe('devbar-theme-mode');
  });

  it('has compactMode key', () => {
    expect(STORAGE_KEYS.compactMode).toBe('devbar-compact-mode');
  });
});

describe('DEVBAR_THEME_LIGHT', () => {
  it('has colors section', () => {
    expect(DEVBAR_THEME_LIGHT.colors).toBeDefined();
    expect(DEVBAR_THEME_LIGHT.colors.primary).toBeDefined();
    expect(DEVBAR_THEME_LIGHT.colors.bg).toBeDefined();
    expect(DEVBAR_THEME_LIGHT.colors.text).toBeDefined();
  });

  it('has different colors than dark theme', () => {
    expect(DEVBAR_THEME_LIGHT.colors.bg).not.toBe(DEVBAR_THEME.colors.bg);
    expect(DEVBAR_THEME_LIGHT.colors.text).not.toBe(DEVBAR_THEME.colors.text);
  });

  it('shares fonts with dark theme', () => {
    expect(DEVBAR_THEME_LIGHT.fonts).toBe(DEVBAR_THEME.fonts);
  });

  it('shares typography with dark theme', () => {
    expect(DEVBAR_THEME_LIGHT.typography).toBe(DEVBAR_THEME.typography);
  });
});

describe('Theme storage utilities', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.themeMode);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEYS.themeMode);
  });

  describe('getStoredThemeMode', () => {
    it('returns system when nothing stored', () => {
      expect(getStoredThemeMode()).toBe('system');
    });

    it('returns stored dark value', () => {
      localStorage.setItem(STORAGE_KEYS.themeMode, 'dark');
      expect(getStoredThemeMode()).toBe('dark');
    });

    it('returns stored light value', () => {
      localStorage.setItem(STORAGE_KEYS.themeMode, 'light');
      expect(getStoredThemeMode()).toBe('light');
    });

    it('returns stored system value', () => {
      localStorage.setItem(STORAGE_KEYS.themeMode, 'system');
      expect(getStoredThemeMode()).toBe('system');
    });

    it('returns system for invalid stored value', () => {
      localStorage.setItem(STORAGE_KEYS.themeMode, 'invalid');
      expect(getStoredThemeMode()).toBe('system');
    });
  });

  describe('setStoredThemeMode', () => {
    it('stores dark mode', () => {
      setStoredThemeMode('dark');
      expect(localStorage.getItem(STORAGE_KEYS.themeMode)).toBe('dark');
    });

    it('stores light mode', () => {
      setStoredThemeMode('light');
      expect(localStorage.getItem(STORAGE_KEYS.themeMode)).toBe('light');
    });

    it('stores system mode', () => {
      setStoredThemeMode('system');
      expect(localStorage.getItem(STORAGE_KEYS.themeMode)).toBe('system');
    });
  });
});

describe('getEffectiveTheme', () => {
  it('returns dark for dark mode', () => {
    expect(getEffectiveTheme('dark')).toBe('dark');
  });

  it('returns light for light mode', () => {
    expect(getEffectiveTheme('light')).toBe('light');
  });

  it('returns dark or light for system mode', () => {
    const result = getEffectiveTheme('system');
    expect(['dark', 'light']).toContain(result);
  });
});

describe('getThemeColors', () => {
  it('returns dark colors for dark mode', () => {
    const colors = getThemeColors('dark');
    expect(colors.bg).toBe(DEVBAR_THEME.colors.bg);
  });

  it('returns light colors for light mode', () => {
    const colors = getThemeColors('light');
    expect(colors.bg).toBe(DEVBAR_THEME_LIGHT.colors.bg);
  });
});

describe('getTheme', () => {
  it('returns dark theme for dark mode', () => {
    const theme = getTheme('dark');
    expect(theme.colors.bg).toBe(DEVBAR_THEME.colors.bg);
    expect(theme.shadows).toBe(DEVBAR_THEME.shadows);
  });

  it('returns light theme for light mode', () => {
    const theme = getTheme('light');
    expect(theme.colors.bg).toBe(DEVBAR_THEME_LIGHT.colors.bg);
    expect(theme.shadows).toBe(DEVBAR_THEME_LIGHT.shadows);
  });
});
