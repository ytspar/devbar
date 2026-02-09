/**
 * Screenshot Command Handlers
 *
 * Handles screenshot-related commands from the server.
 */

import type {
  RequestScreenshotCommand,
  ScreenshotCommand,
  SweetlinkResponse,
} from '../../types.js';
import {
  canvasToDataUrl,
  DEFAULT_SCREENSHOT_QUALITY,
  DEFAULT_SCREENSHOT_SCALE,
  delay,
  prepareForCapture,
  scaleCanvas,
} from '../screenshotUtils.js';

/** Base options shared by all html2canvas calls in this module */
const BASE_CAPTURE_OPTIONS = {
  logging: false,
  useCORS: true,
  allowTaint: true,
  scrollX: 0,
  scrollY: 0,
} as const;

/**
 * Resolve the target element for a screenshot command.
 * Returns null if a selector was provided but matched nothing.
 */
function resolveElement(selector: string | undefined): Element | null {
  if (!selector) return document.body;
  return document.querySelector(selector);
}

/**
 * Handle basic screenshot command
 */
export async function handleScreenshot(command: ScreenshotCommand): Promise<SweetlinkResponse> {
  try {
    const element = resolveElement(command.selector);

    if (!element) {
      return {
        success: false,
        error: `Element not found: ${command.selector}`,
        timestamp: Date.now(),
      };
    }

    const { default: html2canvas } = await import('html2canvas-pro');
    const canvas = await html2canvas(element as HTMLElement, {
      ...BASE_CAPTURE_OPTIONS,
      ...command.options,
    });

    const dataUrl = canvas.toDataURL('image/png');

    return {
      success: true,
      data: {
        screenshot: dataUrl,
        width: canvas.width,
        height: canvas.height,
        selector: command.selector || 'body',
      },
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Screenshot failed',
      timestamp: Date.now(),
    };
  }
}

/**
 * Send a screenshot response over WebSocket and return it as a SweetlinkResponse.
 */
function sendAndReturn(
  ws: WebSocket | null,
  requestId: string | undefined,
  result: Omit<SweetlinkResponse, 'timestamp'>
): SweetlinkResponse {
  const timestamp = Date.now();
  const wsResponse = { type: 'screenshot-response', requestId, ...result, timestamp };
  ws?.send(JSON.stringify(wsResponse));
  return { ...result, timestamp };
}

/**
 * Handle request-screenshot command (from CLI/Agent)
 * This version sends the response directly over WebSocket
 */
export async function handleRequestScreenshot(
  command: RequestScreenshotCommand,
  ws: WebSocket | null
): Promise<SweetlinkResponse> {
  try {
    const element = resolveElement(command.selector);

    if (!element) {
      return sendAndReturn(ws, command.requestId, {
        success: false,
        error: `Element not found: ${command.selector}`,
      });
    }

    const scaleFactor = command.scale || DEFAULT_SCREENSHOT_SCALE;
    const format = command.format || 'jpeg';
    const quality = command.quality || DEFAULT_SCREENSHOT_QUALITY;

    // Prepare page for capture (hide tooltips, blur active element)
    const cleanup = prepareForCapture();
    await delay(50);

    let originalCanvas: HTMLCanvasElement;
    try {
      const { default: html2canvas } = await import('html2canvas-pro');
      originalCanvas = await html2canvas(element as HTMLElement, {
        ...BASE_CAPTURE_OPTIONS,
        width: window.innerWidth,
        windowWidth: window.innerWidth,
        ...command.options,
      });
    } finally {
      cleanup();
    }

    // Scale down using shared utility
    const smallCanvas = scaleCanvas(originalCanvas, { scale: scaleFactor });
    const dataUrl = canvasToDataUrl(smallCanvas, { format, quality });

    const responseData: Record<string, unknown> = {
      screenshot: dataUrl,
      width: smallCanvas.width,
      height: smallCanvas.height,
      selector: command.selector || 'body',
    };

    if (command.includeMetadata !== false) {
      responseData.url = window.location.href;
      responseData.timestamp = Date.now();
      responseData.viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
    }

    return sendAndReturn(ws, command.requestId, {
      success: true,
      data: responseData,
    });
  } catch (error) {
    return sendAndReturn(ws, command.requestId, {
      success: false,
      error: error instanceof Error ? error.message : 'Screenshot failed',
    });
  }
}
