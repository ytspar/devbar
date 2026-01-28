import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_SCREENSHOT_SCALE,
  DEFAULT_SCREENSHOT_QUALITY,
  DESIGN_REVIEW_SCALE,
  DEVBAR_SCREENSHOT_QUALITY,
  scaleCanvas,
  canvasToDataUrl,
  extractBase64FromDataUrl,
  getMediaTypeFromDataUrl,
  prepareForCapture,
  delay,
  gatherScreenshotMetadata,
} from './screenshotUtils.js';

describe('Constants', () => {
  it('has valid default scale', () => {
    expect(DEFAULT_SCREENSHOT_SCALE).toBeGreaterThan(0);
    expect(DEFAULT_SCREENSHOT_SCALE).toBeLessThanOrEqual(1);
  });

  it('has valid default quality', () => {
    expect(DEFAULT_SCREENSHOT_QUALITY).toBeGreaterThan(0);
    expect(DEFAULT_SCREENSHOT_QUALITY).toBeLessThanOrEqual(1);
  });

  it('has higher quality for design review', () => {
    expect(DESIGN_REVIEW_SCALE).toBeGreaterThan(DEFAULT_SCREENSHOT_SCALE);
  });

  it('has higher quality for devbar screenshots', () => {
    expect(DEVBAR_SCREENSHOT_QUALITY).toBeGreaterThanOrEqual(DEFAULT_SCREENSHOT_QUALITY);
  });
});

describe('scaleCanvas', () => {
  let originalCanvas: HTMLCanvasElement;
  let mockContext: CanvasRenderingContext2D;

  beforeEach(() => {
    mockContext = {
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    // Create a mock canvas
    originalCanvas = {
      width: 1000,
      height: 800,
    } as HTMLCanvasElement;

    // Mock document.createElement to return a canvas with our mock context
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => mockContext,
        } as unknown as HTMLCanvasElement;
      }
      return document.createElement(tagName);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scales canvas to specified size', () => {
    const scaled = scaleCanvas(originalCanvas, { scale: 0.5 });

    expect(scaled.width).toBe(500);
    expect(scaled.height).toBe(400);
    expect(mockContext.drawImage).toHaveBeenCalledWith(originalCanvas, 0, 0, 500, 400);
  });

  it('applies image smoothing settings', () => {
    scaleCanvas(originalCanvas, {
      scale: 0.5,
      smoothing: true,
      smoothingQuality: 'medium',
    });

    expect(mockContext.imageSmoothingEnabled).toBe(true);
    expect(mockContext.imageSmoothingQuality).toBe('medium');
  });

  it('can disable smoothing', () => {
    scaleCanvas(originalCanvas, {
      scale: 0.5,
      smoothing: false,
    });

    expect(mockContext.imageSmoothingEnabled).toBe(false);
  });

  it('throws when context is null', () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => ({
      width: 0,
      height: 0,
      getContext: () => null,
    }) as unknown as HTMLCanvasElement);

    expect(() => scaleCanvas(originalCanvas, { scale: 0.5 })).toThrow('Failed to get canvas 2D context');
  });
});

describe('canvasToDataUrl', () => {
  let mockCanvas: HTMLCanvasElement;

  beforeEach(() => {
    mockCanvas = {
      toDataURL: vi.fn((type?: string, quality?: number) => {
        if (type === 'image/png') {
          return 'data:image/png;base64,abc123';
        }
        return `data:image/jpeg;base64,quality=${quality}`;
      }),
    } as unknown as HTMLCanvasElement;
  });

  it('defaults to JPEG with default quality', () => {
    const result = canvasToDataUrl(mockCanvas);
    expect(result).toContain('image/jpeg');
    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/jpeg', DEFAULT_SCREENSHOT_QUALITY);
  });

  it('uses PNG format when specified', () => {
    const result = canvasToDataUrl(mockCanvas, { format: 'png' });
    expect(result).toBe('data:image/png;base64,abc123');
    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('uses custom quality for JPEG', () => {
    const result = canvasToDataUrl(mockCanvas, { quality: 0.9 });
    expect(result).toContain('quality=0.9');
    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.9);
  });
});

describe('extractBase64FromDataUrl', () => {
  it('extracts base64 from PNG data URL', () => {
    const dataUrl = 'data:image/png;base64,abc123';
    expect(extractBase64FromDataUrl(dataUrl)).toBe('abc123');
  });

  it('extracts base64 from JPEG data URL', () => {
    const dataUrl = 'data:image/jpeg;base64,xyz789';
    expect(extractBase64FromDataUrl(dataUrl)).toBe('xyz789');
  });
});

describe('getMediaTypeFromDataUrl', () => {
  it('returns image/png for PNG data URL', () => {
    const dataUrl = 'data:image/png;base64,abc123';
    expect(getMediaTypeFromDataUrl(dataUrl)).toBe('image/png');
  });

  it('returns image/jpeg for JPEG data URL', () => {
    const dataUrl = 'data:image/jpeg;base64,xyz789';
    expect(getMediaTypeFromDataUrl(dataUrl)).toBe('image/jpeg');
  });

  it('returns image/jpeg for unknown format', () => {
    const dataUrl = 'data:something/else;base64,test';
    expect(getMediaTypeFromDataUrl(dataUrl)).toBe('image/jpeg');
  });
});

describe('prepareForCapture', () => {
  beforeEach(() => {
    document.body.classList.remove('devbar-capturing');
  });

  afterEach(() => {
    document.body.classList.remove('devbar-capturing');
  });

  it('adds devbar-capturing class to body', () => {
    prepareForCapture();
    expect(document.body.classList.contains('devbar-capturing')).toBe(true);
  });

  it('returns cleanup function that removes the class', () => {
    const cleanup = prepareForCapture();
    expect(document.body.classList.contains('devbar-capturing')).toBe(true);

    cleanup();
    expect(document.body.classList.contains('devbar-capturing')).toBe(false);
  });

  it('blurs the active element', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    prepareForCapture();
    expect(document.activeElement).not.toBe(input);

    document.body.removeChild(input);
  });
});

describe('delay', () => {
  it('resolves after specified milliseconds', async () => {
    vi.useFakeTimers();

    const promise = delay(100);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(100);
    await promise;

    vi.useRealTimers();
  });
});

describe('gatherScreenshotMetadata', () => {
  let mockCanvas: HTMLCanvasElement;

  beforeEach(() => {
    mockCanvas = {
      width: 800,
      height: 600,
    } as HTMLCanvasElement;
  });

  it('captures basic metadata', () => {
    const metadata = gatherScreenshotMetadata(mockCanvas);

    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(600);
    expect(metadata.timestamp).toBeGreaterThan(0);
    expect(metadata.url).toBeDefined();
  });

  it('captures viewport dimensions', () => {
    const metadata = gatherScreenshotMetadata(mockCanvas);

    expect(metadata.viewport).toBeDefined();
    expect(metadata.viewport!.width).toBe(window.innerWidth);
    expect(metadata.viewport!.height).toBe(window.innerHeight);
  });

  it('uses default selector when not provided', () => {
    const metadata = gatherScreenshotMetadata(mockCanvas);
    expect(metadata.selector).toBe('body');
  });

  it('uses custom selector when provided', () => {
    const metadata = gatherScreenshotMetadata(mockCanvas, '#main-content');
    expect(metadata.selector).toBe('#main-content');
  });
});
