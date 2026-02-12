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
  let isHtml2CanvasLoaded: typeof import('./lazyHtml2Canvas.js').isHtml2CanvasLoaded;
  let preloadHtml2Canvas: typeof import('./lazyHtml2Canvas.js').preloadHtml2Canvas;

  beforeEach(async () => {
    vi.resetModules();
    // Reset the mock to default behavior (also re-registers after any vi.doMock overrides)
    mockHtml2CanvasFn.mockResolvedValue(document.createElement('canvas'));
    vi.doMock('html2canvas-pro', () => ({ default: mockHtml2CanvasFn }));
    const mod = await import('./lazyHtml2Canvas.js');
    getHtml2Canvas = mod.getHtml2Canvas;
    isHtml2CanvasLoaded = mod.isHtml2CanvasLoaded;
    preloadHtml2Canvas = mod.preloadHtml2Canvas;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isHtml2CanvasLoaded', () => {
    it('returns false initially', () => {
      expect(isHtml2CanvasLoaded()).toBe(false);
    });

    it('returns true after getHtml2Canvas has been called', async () => {
      await getHtml2Canvas();
      expect(isHtml2CanvasLoaded()).toBe(true);
    });

    it('returns true immediately after getHtml2Canvas is called (before await)', () => {
      // Calling getHtml2Canvas creates the promise synchronously
      const _promise = getHtml2Canvas();
      expect(isHtml2CanvasLoaded()).toBe(true);
    });
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

  describe('preloadHtml2Canvas', () => {
    it('triggers loading without returning a promise', () => {
      const result = preloadHtml2Canvas();
      // preloadHtml2Canvas returns void, not a promise
      expect(result).toBeUndefined();
      // But loading was kicked off
      expect(isHtml2CanvasLoaded()).toBe(true);
    });

    it('handles import errors silently', async () => {
      vi.doMock('html2canvas-pro', () => {
        throw new Error('Module not found');
      });
      vi.resetModules();
      const mod = await import('./lazyHtml2Canvas.js');

      // Should not throw
      expect(() => mod.preloadHtml2Canvas()).not.toThrow();

      // Wait a tick for the .catch() to settle
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    it('subsequent getHtml2Canvas call returns the same result started by preload', async () => {
      preloadHtml2Canvas();
      const loaded = isHtml2CanvasLoaded();
      expect(loaded).toBe(true);

      // getHtml2Canvas should reuse the cached promise created by preloadHtml2Canvas
      const result1 = await getHtml2Canvas();
      const result2 = await getHtml2Canvas();
      expect(result1).toBe(result2);
      expect(typeof result1).toBe('function');
    });
  });
});
