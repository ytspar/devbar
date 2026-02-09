/**
 * HMR Detection and Capture
 *
 * Handles Hot Module Replacement detection and automatic screenshot capture.
 */

import type { ConsoleLog, HmrScreenshotData } from '../types.js';
import {
  canvasToDataUrl,
  DEFAULT_SCREENSHOT_QUALITY,
  DEFAULT_SCREENSHOT_SCALE,
  scaleCanvas,
} from './screenshotUtils.js';

export interface HmrCaptureConfig {
  debounceMs: number;
  captureDelay: number;
}

export interface HmrCaptureState {
  sequence: number;
  debounceTimeout: ReturnType<typeof setTimeout> | null;
  lastCaptureTime: number;
}

/**
 * Set up HMR detection listeners
 * Returns a cleanup function to remove the listeners
 */
export function setupHmrDetection(
  onCapture: (
    trigger: string,
    changedFile?: string,
    hmrMetadata?: HmrScreenshotData['hmrMetadata']
  ) => void
): () => void {
  console.log('[Sweetlink] Setting up HMR detection for automatic screenshots');

  const cleanupFunctions: (() => void)[] = [];

  // Vite HMR detection
  const viteAfterUpdate = () => onCapture('vite');
  document.addEventListener('vite:afterUpdate', viteAfterUpdate);
  cleanupFunctions.push(() => document.removeEventListener('vite:afterUpdate', viteAfterUpdate));

  // Vite custom event
  const viteHmrHandler = (event: Event) => {
    const detail = (event as CustomEvent).detail as { file?: string } | undefined;
    onCapture('vite', detail?.file);
  };
  document.addEventListener('vite:hmr', viteHmrHandler);
  cleanupFunctions.push(() => document.removeEventListener('vite:hmr', viteHmrHandler));

  // Remix HMR detection
  const remixHmrHandler = () => onCapture('remix');
  window.addEventListener('remix-hmr', remixHmrHandler);
  cleanupFunctions.push(() => window.removeEventListener('remix-hmr', remixHmrHandler));

  // Return combined cleanup function
  return () => {
    cleanupFunctions.forEach((fn) => fn());
  };
}

/**
 * Capture an HMR screenshot
 */
export async function captureHmrScreenshot(
  ws: WebSocket | null,
  consoleLogs: ConsoleLog[],
  state: HmrCaptureState,
  config: HmrCaptureConfig,
  trigger: string,
  changedFile?: string,
  hmrMetadata?: HmrScreenshotData['hmrMetadata']
): Promise<void> {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  // Debounce rapid HMR events
  const now = Date.now();
  if (now - state.lastCaptureTime < config.debounceMs) {
    if (state.debounceTimeout) {
      clearTimeout(state.debounceTimeout);
    }
    state.debounceTimeout = setTimeout(() => {
      captureHmrScreenshot(ws, consoleLogs, state, config, trigger, changedFile, hmrMetadata);
    }, config.debounceMs);
    return;
  }

  state.lastCaptureTime = now;

  // Wait for DOM to settle
  await new Promise((resolve) => setTimeout(resolve, config.captureDelay));

  try {
    const { default: html2canvas } = await import('html2canvas-pro');
    const originalCanvas = await html2canvas(document.body, {
      logging: false,
      useCORS: true,
      allowTaint: true,
      scrollX: 0,
      scrollY: 0,
    });

    // Scale down for efficiency using shared utility
    const smallCanvas = scaleCanvas(originalCanvas, { scale: DEFAULT_SCREENSHOT_SCALE });
    const dataUrl = canvasToDataUrl(smallCanvas, {
      format: 'jpeg',
      quality: DEFAULT_SCREENSHOT_QUALITY,
    });

    // Prepare logs
    const allLogs = [...consoleLogs];
    const errors = allLogs.filter((l) => l.level === 'error');
    const warnings = allLogs.filter((l) => l.level === 'warn');

    state.sequence++;

    const hmrData: HmrScreenshotData = {
      trigger,
      changedFile,
      screenshot: dataUrl,
      url: window.location.href,
      timestamp: Date.now(),
      sequenceNumber: state.sequence,
      logs: {
        all: allLogs,
        errors,
        warnings,
        sinceLastCapture: allLogs.length,
      },
      hmrMetadata,
    };

    ws.send(
      JSON.stringify({
        type: 'hmr-screenshot',
        data: hmrData,
      })
    );

    console.log(`[Sweetlink] HMR screenshot captured (${trigger})`);
  } catch (error) {
    console.error('[Sweetlink] HMR screenshot capture failed:', error);
  }
}
