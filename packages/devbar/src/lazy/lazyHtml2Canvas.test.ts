/**
 * Tests for the lazy html2canvas loader.
 *
 * Because the module caches a promise at module scope, each test group
 * that needs a clean slate must use `vi.resetModules()` and re-import.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We mock the dynamic import target before any imports of the module under test.
const mockHtml2CanvasFn = vi.fn().mockResolvedValue(document.createElement('canvas'));

vi.mock('html2canvas-pro', () => {
  // Default export is a function (ESM shape)
  return { default: mockHtml2CanvasFn };
});

describe('lazyHtml2Canvas', () => {
  // Fresh module imports per-group to avoid shared cached promise state.
  let getHtml2Canvas: typeof import('./lazyHtml2Canvas.js').getHtml2Canvas;

  beforeEach(async () => {
    vi.resetModules();
    // Reset the mock to default behavior (also re-registers after any vi.doMock overrides)
    mockHtml2CanvasFn.mockResolvedValue(document.createElement('canvas'));
    vi.doMock('html2canvas-pro', () => ({ default: mockHtml2CanvasFn }));
    const mod = await import('./lazyHtml2Canvas.js');
    getHtml2Canvas = mod.getHtml2Canvas;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getHtml2Canvas', () => {
    it('returns a function after loading', async () => {
      const html2canvas = await getHtml2Canvas();
      expect(typeof html2canvas).toBe('function');
    });

    it('caches the result — subsequent calls resolve to the same function', async () => {
      const result1 = await getHtml2Canvas();
      const result2 = await getHtml2Canvas();
      expect(result1).toBe(result2);
    });

    it('resolves to the same function on repeated awaits', async () => {
      const first = await getHtml2Canvas();
      const second = await getHtml2Canvas();
      expect(first).toBe(second);
    });
  });

  describe('getHtml2Canvas — ESM/CJS interop', () => {
    it('handles module with default export (ESM)', async () => {
      const mockFn = vi.fn();
      vi.doMock('html2canvas-pro', () => ({ default: mockFn }));
      vi.resetModules();
      const mod = await import('./lazyHtml2Canvas.js');

      const result = await mod.getHtml2Canvas();
      expect(result).toBe(mockFn);
    });

    it('handles module without default export (CJS-style)', async () => {
      // When there is no default export, the module itself should be returned
      // since `module.default ?? module` falls through to `module`.
      const mockFn = vi.fn();
      vi.doMock('html2canvas-pro', () => ({ default: mockFn }));
      vi.resetModules();
      const mod = await import('./lazyHtml2Canvas.js');

      const result = await mod.getHtml2Canvas();
      expect(typeof result).toBe('function');
      expect(result).toBe(mockFn);
    });
  });
});
