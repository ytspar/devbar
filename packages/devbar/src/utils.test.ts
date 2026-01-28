import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatArg,
  formatArgs,
  canvasToDataUrl,
  prepareForCapture,
  delay,
} from './utils.js';

describe('formatArg', () => {
  it('formats strings as-is', () => {
    expect(formatArg('hello')).toBe('hello');
    expect(formatArg('')).toBe('');
  });

  it('formats numbers', () => {
    expect(formatArg(42)).toBe('42');
    expect(formatArg(3.14)).toBe('3.14');
    expect(formatArg(-1)).toBe('-1');
    expect(formatArg(0)).toBe('0');
  });

  it('formats booleans', () => {
    expect(formatArg(true)).toBe('true');
    expect(formatArg(false)).toBe('false');
  });

  it('formats null and undefined', () => {
    expect(formatArg(null)).toBe('null');
    expect(formatArg(undefined)).toBe('undefined');
  });

  it('formats Error objects with name, message, and stack', () => {
    const error = new Error('test error');
    const result = formatArg(error);
    expect(result).toContain('Error: test error');
    expect(result).toContain('\n'); // Stack trace included
  });

  it('formats Error subclasses correctly', () => {
    const typeError = new TypeError('invalid type');
    const result = formatArg(typeError);
    expect(result).toContain('TypeError: invalid type');
  });

  it('formats plain objects as JSON', () => {
    expect(formatArg({ a: 1, b: 'two' })).toBe('{"a":1,"b":"two"}');
  });

  it('formats arrays as JSON', () => {
    expect(formatArg([1, 2, 3])).toBe('[1,2,3]');
    expect(formatArg(['a', 'b'])).toBe('["a","b"]');
  });

  it('formats nested objects', () => {
    expect(formatArg({ nested: { value: 42 } })).toBe('{"nested":{"value":42}}');
  });

  it('handles errors inside objects', () => {
    const obj = { error: new Error('inner error') };
    const result = formatArg(obj);
    expect(result).toBe('{"error":"Error: inner error"}');
  });

  it('returns [object] for circular references', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(formatArg(obj)).toBe('[object]');
  });
});

describe('formatArgs', () => {
  it('joins multiple arguments with spaces', () => {
    expect(formatArgs(['hello', 'world'])).toBe('hello world');
  });

  it('handles empty array', () => {
    expect(formatArgs([])).toBe('');
  });

  it('handles single argument', () => {
    expect(formatArgs(['only'])).toBe('only');
  });

  it('formats mixed types', () => {
    expect(formatArgs(['count:', 42, true])).toBe('count: 42 true');
  });

  it('handles objects in array', () => {
    expect(formatArgs(['data:', { x: 1 }])).toBe('data: {"x":1}');
  });
});

describe('canvasToDataUrl', () => {
  let mockCanvas: HTMLCanvasElement;

  beforeEach(() => {
    mockCanvas = {
      toDataURL: vi.fn((type?: string, quality?: number) => {
        if (type === 'image/png') {
          return 'data:image/png;base64,test';
        }
        return `data:image/jpeg;base64,quality=${quality}`;
      }),
    } as unknown as HTMLCanvasElement;
  });

  it('defaults to JPEG with 0.7 quality', () => {
    const result = canvasToDataUrl(mockCanvas);
    expect(result).toBe('data:image/jpeg;base64,quality=0.7');
    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.7);
  });

  it('uses PNG format when specified', () => {
    const result = canvasToDataUrl(mockCanvas, { format: 'png' });
    expect(result).toBe('data:image/png;base64,test');
    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('uses custom quality for JPEG', () => {
    const result = canvasToDataUrl(mockCanvas, { quality: 0.9 });
    expect(result).toBe('data:image/jpeg;base64,quality=0.9');
    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.9);
  });

  it('ignores quality for PNG format', () => {
    const result = canvasToDataUrl(mockCanvas, { format: 'png', quality: 0.9 });
    expect(result).toBe('data:image/png;base64,test');
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

  it('resolves with undefined', async () => {
    vi.useFakeTimers();

    const promise = delay(50);
    vi.advanceTimersByTime(50);
    const result = await promise;

    expect(result).toBeUndefined();
    vi.useRealTimers();
  });
});
