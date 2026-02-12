/**
 * Screenshot Command Handler Tests
 *
 * Tests handleScreenshot and handleRequestScreenshot from the browser
 * screenshot command module. All html2canvas and DOM APIs are mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestScreenshotCommand, ScreenshotCommand, SweetlinkResponse } from '../../types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCanvas = {
  width: 1920,
  height: 1080,
  toDataURL: vi.fn(() => 'data:image/png;base64,mockScreenshotData'),
};

const mockHtml2canvas = vi.fn(async () => mockCanvas);

vi.mock('html2canvas-pro', () => ({
  default: mockHtml2canvas,
}));

const mockCleanup = vi.fn();
vi.mock('../screenshotUtils.js', () => ({
  DEFAULT_SCREENSHOT_QUALITY: 0.7,
  DEFAULT_SCREENSHOT_SCALE: 0.25,
  delay: vi.fn(() => Promise.resolve()),
  prepareForCapture: vi.fn(() => mockCleanup),
  scaleCanvas: vi.fn((canvas: typeof mockCanvas, opts: { scale: number }) => ({
    width: Math.floor(canvas.width * opts.scale),
    height: Math.floor(canvas.height * opts.scale),
    toDataURL: vi.fn(() => 'data:image/jpeg;base64,scaledData'),
  })),
  canvasToDataUrl: vi.fn(() => 'data:image/jpeg;base64,convertedData'),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { handleRequestScreenshot, handleScreenshot } from './screenshot.js';
import { prepareForCapture, delay, scaleCanvas, canvasToDataUrl } from '../screenshotUtils.js';

// biome-ignore lint/suspicious/noExplicitAny: test helper - SweetlinkResponse.data is unknown
const d = (r: SweetlinkResponse): any => r.data;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupBody(): void {
  const app = document.createElement('div');
  app.id = 'app';
  app.textContent = 'Hello';
  document.body.appendChild(app);

  const target = document.createElement('div');
  target.id = 'target';
  target.textContent = 'Content';
  document.body.appendChild(target);
}

// ---------------------------------------------------------------------------
// Tests - handleScreenshot
// ---------------------------------------------------------------------------

describe('handleScreenshot', () => {
  beforeEach(() => {
    setupBody();
    vi.clearAllMocks();
    mockCanvas.width = 1920;
    mockCanvas.height = 1080;
    mockCanvas.toDataURL.mockReturnValue('data:image/png;base64,mockScreenshotData');
  });

  afterEach(() => {
    document.body.textContent = '';
  });

  it('captures a screenshot of document.body when no selector is provided', async () => {
    const command: ScreenshotCommand = { type: 'screenshot' };
    const result = await handleScreenshot(command);

    expect(result.success).toBe(true);
    expect(d(result).screenshot).toBe('data:image/png;base64,mockScreenshotData');
    expect(d(result).width).toBe(1920);
    expect(d(result).height).toBe(1080);
    expect(d(result).selector).toBe('body');
    expect(mockHtml2canvas).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({
        logging: false,
        useCORS: true,
        allowTaint: true,
      }),
    );
  });

  it('captures a screenshot of a specific element by selector', async () => {
    const command: ScreenshotCommand = { type: 'screenshot', selector: '#app' };
    const result = await handleScreenshot(command);

    expect(result.success).toBe(true);
    expect(d(result).selector).toBe('#app');
    expect(mockHtml2canvas).toHaveBeenCalledWith(
      document.querySelector('#app'),
      expect.any(Object),
    );
  });

  it('returns error when selector matches no element', async () => {
    const command: ScreenshotCommand = { type: 'screenshot', selector: '#nonexistent' };
    const result = await handleScreenshot(command);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Element not found: #nonexistent');
    expect(mockHtml2canvas).not.toHaveBeenCalled();
  });

  it('passes custom options through to html2canvas', async () => {
    const command: ScreenshotCommand = {
      type: 'screenshot',
      options: { backgroundColor: '#ffffff', scale: 2 },
    };
    const result = await handleScreenshot(command);

    expect(result.success).toBe(true);
    expect(mockHtml2canvas).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
      }),
    );
  });

  it('includes a timestamp in the response', async () => {
    const before = Date.now();
    const command: ScreenshotCommand = { type: 'screenshot' };
    const result = await handleScreenshot(command);
    const after = Date.now();

    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);
  });

  it('handles html2canvas throwing an Error', async () => {
    mockHtml2canvas.mockRejectedValueOnce(new Error('Canvas rendering failed'));

    const command: ScreenshotCommand = { type: 'screenshot' };
    const result = await handleScreenshot(command);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Canvas rendering failed');
  });

  it('handles non-Error throws with generic message', async () => {
    mockHtml2canvas.mockRejectedValueOnce('string error');

    const command: ScreenshotCommand = { type: 'screenshot' };
    const result = await handleScreenshot(command);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Screenshot failed');
  });

  it('uses canvas.toDataURL with image/png format', async () => {
    const command: ScreenshotCommand = { type: 'screenshot' };
    await handleScreenshot(command);

    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('returns canvas dimensions in response data', async () => {
    mockCanvas.width = 800;
    mockCanvas.height = 600;

    const command: ScreenshotCommand = { type: 'screenshot' };
    const result = await handleScreenshot(command);

    expect(d(result).width).toBe(800);
    expect(d(result).height).toBe(600);
  });

  it('merges BASE_CAPTURE_OPTIONS with command options allowing overrides', async () => {
    const command: ScreenshotCommand = {
      type: 'screenshot',
      options: { scrollX: 100 },
    };
    await handleScreenshot(command);

    // Command options should override base options (scrollX: 0 -> 100)
    expect(mockHtml2canvas).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({
        scrollX: 100,
        scrollY: 0,
        useCORS: true,
        allowTaint: true,
        logging: false,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests - handleRequestScreenshot
// ---------------------------------------------------------------------------

describe('handleRequestScreenshot', () => {
  let mockWs: { send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    setupBody();
    vi.clearAllMocks();
    mockCanvas.width = 1920;
    mockCanvas.height = 1080;
    mockWs = {
      send: vi.fn(),
      close: vi.fn(),
    };
  });

  afterEach(() => {
    document.body.textContent = '';
  });

  it('captures a screenshot and sends it over WebSocket', async () => {
    const command: RequestScreenshotCommand = {
      type: 'request-screenshot',
      requestId: 'req-1',
    };
    const result = await handleRequestScreenshot(command, mockWs as unknown as WebSocket);

    expect(result.success).toBe(true);
    expect(mockWs.send).toHaveBeenCalledTimes(1);

    const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(sentMessage.type).toBe('screenshot-response');
    expect(sentMessage.requestId).toBe('req-1');
    expect(sentMessage.success).toBe(true);
    expect(sentMessage.data.screenshot).toBe('data:image/jpeg;base64,convertedData');
  });

  it('calls prepareForCapture and cleanup', async () => {
    const command: RequestScreenshotCommand = {
      type: 'request-screenshot',
      requestId: 'req-2',
    };
    await handleRequestScreenshot(command, mockWs as unknown as WebSocket);

    expect(prepareForCapture).toHaveBeenCalledTimes(1);
    expect(delay).toHaveBeenCalledWith(50);
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });

  it('uses default scale when not specified', async () => {
    const command: RequestScreenshotCommand = {
      type: 'request-screenshot',
    };
    await handleRequestScreenshot(command, mockWs as unknown as WebSocket);

    expect(scaleCanvas).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ scale: 0.25 }),
    );
  });

  it('uses custom scale when specified', async () => {
    const command: RequestScreenshotCommand = {
      type: 'request-screenshot',
      scale: 0.5,
    };
    await handleRequestScreenshot(command, mockWs as unknown as WebSocket);

    expect(scaleCanvas).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ scale: 0.5 }),
    );
  });

  it('uses default jpeg format and quality when not specified', async () => {
    const command: RequestScreenshotCommand = {
      type: 'request-screenshot',
    };
    await handleRequestScreenshot(command, mockWs as unknown as WebSocket);

    expect(canvasToDataUrl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ format: 'jpeg', quality: 0.7 }),
    );
  });

  it('uses png format when specified', async () => {
    const command: RequestScreenshotCommand = {
      type: 'request-screenshot',
      format: 'png',
    };
    await handleRequestScreenshot(command, mockWs as unknown as WebSocket);

    expect(canvasToDataUrl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ format: 'png' }),
    );
  });

  it('uses custom quality when specified', async () => {
    const command: RequestScreenshotCommand = {
      type: 'request-screenshot',
      quality: 0.9,
    };
    await handleRequestScreenshot(command, mockWs as unknown as WebSocket);

    expect(canvasToDataUrl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ quality: 0.9 }),
    );
  });

  it('includes metadata by default', async () => {
    const command: RequestScreenshotCommand = {
      type: 'request-screenshot',
      requestId: 'req-meta',
    };
    const result = await handleRequestScreenshot(command, mockWs as unknown as WebSocket);

    expect(d(result).url).toBeDefined();
    expect(d(result).viewport).toBeDefined();
    expect(d(result).viewport.width).toBe(window.innerWidth);
    expect(d(result).viewport.height).toBe(window.innerHeight);
  });

  it('excludes metadata when includeMetadata is false', async () => {
    const command: RequestScreenshotCommand = {
      type: 'request-screenshot',
      requestId: 'req-no-meta',
      includeMetadata: false,
    };
    const result = await handleRequestScreenshot(command, mockWs as unknown as WebSocket);

    expect(d(result).url).toBeUndefined();
    expect(d(result).viewport).toBeUndefined();
  });

  it('returns error when selector matches no element', async () => {
    const command: RequestScreenshotCommand = {
      type: 'request-screenshot',
      requestId: 'req-missing',
      selector: '#nonexistent',
    };
    const result = await handleRequestScreenshot(command, mockWs as unknown as WebSocket);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Element not found: #nonexistent');

    const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(sentMessage.success).toBe(false);
    expect(sentMessage.requestId).toBe('req-missing');
  });

  it('handles null WebSocket gracefully', async () => {
    const command: RequestScreenshotCommand = {
      type: 'request-screenshot',
      requestId: 'req-null-ws',
    };
    const result = await handleRequestScreenshot(command, null);

    // Should still return a result, just not send over WebSocket
    expect(result.success).toBe(true);
    expect(d(result).screenshot).toBeDefined();
  });

  it('handles html2canvas error and still calls cleanup', async () => {
    mockHtml2canvas.mockRejectedValueOnce(new Error('Rendering error'));

    const command: RequestScreenshotCommand = {
      type: 'request-screenshot',
      requestId: 'req-error',
    };
    const result = await handleRequestScreenshot(command, mockWs as unknown as WebSocket);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Rendering error');
    // Cleanup should still be called because it is in a finally block
    expect(mockCleanup).toHaveBeenCalledTimes(1);

    const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(sentMessage.success).toBe(false);
    expect(sentMessage.error).toBe('Rendering error');
  });

  it('handles non-Error throws with generic message', async () => {
    mockHtml2canvas.mockRejectedValueOnce(42);

    const command: RequestScreenshotCommand = {
      type: 'request-screenshot',
    };
    const result = await handleRequestScreenshot(command, mockWs as unknown as WebSocket);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Screenshot failed');
  });

  it('captures a specific element by selector', async () => {
    const command: RequestScreenshotCommand = {
      type: 'request-screenshot',
      selector: '#target',
    };
    const result = await handleRequestScreenshot(command, mockWs as unknown as WebSocket);

    expect(result.success).toBe(true);
    expect(d(result).selector).toBe('#target');
    expect(mockHtml2canvas).toHaveBeenCalledWith(
      document.querySelector('#target'),
      expect.any(Object),
    );
  });

  it('defaults selector label to body when no selector is provided', async () => {
    const command: RequestScreenshotCommand = {
      type: 'request-screenshot',
    };
    const result = await handleRequestScreenshot(command, mockWs as unknown as WebSocket);

    expect(d(result).selector).toBe('body');
  });

  it('passes window dimensions and custom options to html2canvas', async () => {
    const command: RequestScreenshotCommand = {
      type: 'request-screenshot',
      options: { backgroundColor: '#000' },
    };
    await handleRequestScreenshot(command, mockWs as unknown as WebSocket);

    expect(mockHtml2canvas).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        width: window.innerWidth,
        windowWidth: window.innerWidth,
        backgroundColor: '#000',
        logging: false,
        useCORS: true,
        allowTaint: true,
      }),
    );
  });

  it('includes timestamp in WebSocket response', async () => {
    const before = Date.now();
    const command: RequestScreenshotCommand = {
      type: 'request-screenshot',
      requestId: 'req-ts',
    };
    const result = await handleRequestScreenshot(command, mockWs as unknown as WebSocket);
    const after = Date.now();

    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);

    const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(sentMessage.timestamp).toBeGreaterThanOrEqual(before);
    expect(sentMessage.timestamp).toBeLessThanOrEqual(after);
  });
});
