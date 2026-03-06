import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}));

// Mock playwright module
const mockPage = {
  evaluate: vi.fn(),
  screenshot: vi.fn(),
};

const mockBrowser = {
  close: vi.fn(),
};

vi.mock('./playwright.js', () => ({
  getBrowser: vi.fn(() => Promise.resolve({ browser: mockBrowser, page: mockPage })),
}));

import {
  getCardHeaderPreset,
  getNavigationPreset,
  measureElementsScript,
  measureViaPlaywright,
  type MeasurementOptions,
  type RulerOutput,
} from './ruler.js';

describe('getCardHeaderPreset', () => {
  const preset = getCardHeaderPreset();

  it('returns selectors for card headers', () => {
    expect(preset.selectors).toEqual(['article h2', 'article header > div:first-child']);
  });

  it('enables center lines and dimensions', () => {
    expect(preset.showCenterLines).toBe(true);
    expect(preset.showDimensions).toBe(true);
  });

  it('enables alignment checking', () => {
    expect(preset.showAlignment).toBe(true);
  });

  it('limits to 3 elements', () => {
    expect(preset.limit).toBe(3);
  });

  it('does not include showPosition', () => {
    expect(preset.showPosition).toBeUndefined();
  });

  it('does not include custom colors', () => {
    expect(preset.colors).toBeUndefined();
  });
});

describe('getNavigationPreset', () => {
  const preset = getNavigationPreset();

  it('returns selectors for nav links and buttons', () => {
    expect(preset.selectors).toEqual(['nav a', 'nav button']);
  });

  it('enables center lines and dimensions', () => {
    expect(preset.showCenterLines).toBe(true);
    expect(preset.showDimensions).toBe(true);
  });

  it('enables alignment checking', () => {
    expect(preset.showAlignment).toBe(true);
  });

  it('limits to 10 elements', () => {
    expect(preset.limit).toBe(10);
  });
});

describe('measureElementsScript', () => {
  it('is a non-empty string', () => {
    expect(typeof measureElementsScript).toBe('string');
    expect(measureElementsScript.length).toBeGreaterThan(0);
  });

  it('is an IIFE function body', () => {
    expect(measureElementsScript.trim()).toMatch(/^\(function\(options\)/);
  });

  it('references expected DOM APIs', () => {
    expect(measureElementsScript).toContain('document.querySelectorAll');
    expect(measureElementsScript).toContain('getBoundingClientRect');
    expect(measureElementsScript).toContain('createElementNS');
  });

  it('handles default options destructuring', () => {
    expect(measureElementsScript).toContain('selectors = []');
    expect(measureElementsScript).toContain('showCenterLines = true');
    expect(measureElementsScript).toContain('showDimensions = true');
    expect(measureElementsScript).toContain('showPosition = false');
    expect(measureElementsScript).toContain('limit = 5');
    expect(measureElementsScript).toContain('showAlignment = true');
  });

  it('has default color palette', () => {
    expect(measureElementsScript).toContain('#ff0000');
    expect(measureElementsScript).toContain('#00ff00');
    expect(measureElementsScript).toContain('#0000ff');
    expect(measureElementsScript).toContain('#ffff00');
    expect(measureElementsScript).toContain('#ff00ff');
    expect(measureElementsScript).toContain('#00ffff');
  });

  it('removes existing overlay before creating new one', () => {
    expect(measureElementsScript).toContain("document.getElementById('pixel-ruler-overlay')");
    expect(measureElementsScript).toContain('existingOverlay.remove()');
  });

  it('creates SVG overlay with correct attributes', () => {
    expect(measureElementsScript).toContain("svg.id = 'pixel-ruler-overlay'");
    expect(measureElementsScript).toContain('position: fixed');
    expect(measureElementsScript).toContain('z-index: 999999');
    expect(measureElementsScript).toContain('pointer-events: none');
  });

  it('draws bounding boxes with dashed strokes', () => {
    expect(measureElementsScript).toContain("stroke-dasharray', '4,2'");
  });

  it('draws center lines and center dots when showCenterLines is true', () => {
    expect(measureElementsScript).toContain('if (showCenterLines)');
    expect(measureElementsScript).toContain("'circle'");
    expect(measureElementsScript).toContain("'r', '4'");
  });

  it('draws dimension labels when showDimensions is true', () => {
    expect(measureElementsScript).toContain('if (showDimensions)');
    expect(measureElementsScript).toContain('rect.width');
    expect(measureElementsScript).toContain('rect.height');
  });

  it('draws position labels when showPosition is true', () => {
    expect(measureElementsScript).toContain('if (showPosition)');
    expect(measureElementsScript).toContain('rect.left');
    expect(measureElementsScript).toContain('rect.top');
  });

  it('computes alignment between first two elements', () => {
    expect(measureElementsScript).toContain('showAlignment && allRects.length >= 2');
    expect(measureElementsScript).toContain('verticalOffset');
    expect(measureElementsScript).toContain('horizontalOffset');
    expect(measureElementsScript).toContain('Math.abs(verticalOffset) <= 2');
    expect(measureElementsScript).toContain('Math.abs(horizontalOffset) <= 2');
  });

  it('returns results, summary, and alignment', () => {
    expect(measureElementsScript).toContain('return {');
    expect(measureElementsScript).toContain('results');
    expect(measureElementsScript).toContain('summary');
    expect(measureElementsScript).toContain('alignment');
  });

  it('respects element limit via slice', () => {
    expect(measureElementsScript).toContain('.slice(0, limit)');
  });

  it('cycles through colors by selector index', () => {
    expect(measureElementsScript).toContain('colors[selectorIndex % colors.length]');
  });

  it('is a callable function expression (not IIFE with invocation)', () => {
    // The script ends with just `)` not `)()`—it's called with options externally
    expect(measureElementsScript.trim()).toMatch(/\)\s*$/);
    expect(measureElementsScript.trim()).not.toMatch(/\)\(\)\s*$/);
  });
});

describe('measureViaPlaywright', () => {
  const mockResult: RulerOutput = {
    results: [
      {
        selector: '.box',
        elements: [
          { index: 0, rect: { top: 10, left: 20, width: 100, height: 50 }, centerX: 70, centerY: 35 },
        ],
      },
    ],
    summary: '.box: 1 elements',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPage.evaluate.mockResolvedValue(mockResult);
    mockPage.screenshot.mockResolvedValue(undefined);
    mockBrowser.close.mockResolvedValue(undefined);
  });

  it('measures elements and returns results', async () => {
    const result = await measureViaPlaywright({ selectors: ['.box'] });
    expect(result.results).toEqual(mockResult.results);
    expect(result.summary).toBe('.box: 1 elements');
  });

  it('closes browser in finally block', async () => {
    await measureViaPlaywright({ selectors: ['.box'] });
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it('closes browser even on error', async () => {
    mockPage.evaluate.mockRejectedValueOnce(new Error('eval failed'));
    await expect(
      measureViaPlaywright({ selectors: ['.box'] })
    ).rejects.toThrow('eval failed');
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it('takes screenshot when output path is provided', async () => {
    const result = await measureViaPlaywright({
      selectors: ['.box'],
      output: '/tmp/ruler/screenshot.png',
    });
    expect(mockPage.screenshot).toHaveBeenCalledWith({
      path: '/tmp/ruler/screenshot.png',
      fullPage: false,
    });
    expect(result.screenshotPath).toBe('/tmp/ruler/screenshot.png');
  });

  it('creates directory if it does not exist', async () => {
    (fs.existsSync as any).mockReturnValueOnce(false);
    await measureViaPlaywright({
      selectors: ['.box'],
      output: '/tmp/newdir/screenshot.png',
    });
    expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/newdir', { recursive: true });
  });

  it('does not create directory if it already exists', async () => {
    (fs.existsSync as any).mockReturnValueOnce(true);
    await measureViaPlaywright({
      selectors: ['.box'],
      output: '/tmp/existingdir/screenshot.png',
    });
    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });

  it('does not take screenshot when output is not provided', async () => {
    const result = await measureViaPlaywright({ selectors: ['.box'] });
    expect(mockPage.screenshot).not.toHaveBeenCalled();
    expect(result.screenshotPath).toBeUndefined();
  });

  it('passes measurement options with defaults', async () => {
    await measureViaPlaywright({ selectors: ['.box'] });
    expect(mockPage.evaluate).toHaveBeenCalledWith(
      expect.stringContaining('"showCenterLines":true')
    );
    expect(mockPage.evaluate).toHaveBeenCalledWith(
      expect.stringContaining('"showDimensions":true')
    );
    expect(mockPage.evaluate).toHaveBeenCalledWith(
      expect.stringContaining('"showPosition":false')
    );
    expect(mockPage.evaluate).toHaveBeenCalledWith(
      expect.stringContaining('"showAlignment":true')
    );
    expect(mockPage.evaluate).toHaveBeenCalledWith(
      expect.stringContaining('"limit":5')
    );
  });

  it('passes custom options through', async () => {
    await measureViaPlaywright({
      selectors: ['.a', '.b'],
      showCenterLines: false,
      showDimensions: false,
      showPosition: true,
      showAlignment: false,
      limit: 20,
      colors: ['#111', '#222'],
    });
    expect(mockPage.evaluate).toHaveBeenCalledWith(
      expect.stringContaining('"showCenterLines":false')
    );
    expect(mockPage.evaluate).toHaveBeenCalledWith(
      expect.stringContaining('"showPosition":true')
    );
    expect(mockPage.evaluate).toHaveBeenCalledWith(
      expect.stringContaining('"limit":20')
    );
    expect(mockPage.evaluate).toHaveBeenCalledWith(
      expect.stringContaining('"colors":["#111","#222"]')
    );
  });

  it('logs verbose output when verbose is true', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await measureViaPlaywright({ selectors: ['.box'], verbose: true });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Sweetlink Ruler] Injecting measurement overlay...')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Sweetlink Ruler] Measured:')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Sweetlink Ruler] Closing browser...')
    );
    consoleSpy.mockRestore();
  });

  it('logs alignment info when result has alignment and verbose is true', async () => {
    const resultWithAlignment: RulerOutput = {
      ...mockResult,
      alignment: { verticalOffset: 0, horizontalOffset: 0, aligned: true },
    };
    mockPage.evaluate.mockResolvedValue(resultWithAlignment);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await measureViaPlaywright({ selectors: ['.a', '.b'], verbose: true });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Sweetlink Ruler] Alignment:')
    );
    consoleSpy.mockRestore();
  });

  it('does not log alignment info when result has no alignment', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await measureViaPlaywright({ selectors: ['.box'], verbose: true });

    const alignmentCalls = consoleSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('Alignment:')
    );
    expect(alignmentCalls.length).toBe(0);
    consoleSpy.mockRestore();
  });

  it('does not log when verbose is not set', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await measureViaPlaywright({ selectors: ['.box'] });

    const rulerCalls = consoleSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('[Sweetlink Ruler]')
    );
    expect(rulerCalls.length).toBe(0);
    consoleSpy.mockRestore();
  });

  it('passes url to getBrowser', async () => {
    const { getBrowser } = await import('./playwright.js');
    await measureViaPlaywright({ selectors: ['.box'], url: 'http://example.com' });
    expect(getBrowser).toHaveBeenCalledWith('http://example.com');
  });

  it('passes undefined url when not specified', async () => {
    const { getBrowser } = await import('./playwright.js');
    await measureViaPlaywright({ selectors: ['.box'] });
    expect(getBrowser).toHaveBeenCalledWith(undefined);
  });
});
