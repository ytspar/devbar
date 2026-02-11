/**
 * Screenshot capture, design review, and related clipboard operations.
 *
 * Extracted from GlobalDevBar to reduce file size.
 */

import {
  CLIPBOARD_NOTIFICATION_MS,
  SCREENSHOT_BLUR_DELAY_MS,
  SCREENSHOT_NOTIFICATION_MS,
  SCREENSHOT_SCALE,
} from '../constants.js';
import { getHtml2Canvas } from '../lazy/lazyHtml2Canvas.js';
import { extractDocumentOutline, outlineToMarkdown } from '../outline.js';
import { extractPageSchema, schemaToMarkdown } from '../schema.js';
import { resolveSaveLocation } from '../settings.js';
import {
  canvasToDataUrl,
  copyCanvasToClipboard,
  delay,
  downloadDataUrl,
  downloadFile,
  prepareForCapture,
} from '../utils.js';
import type { DevBarState } from './types.js';

/**
 * Generic save-or-download helper that encapsulates the shared pattern used by
 * handleSaveOutline, handleSaveSchema, and handleSaveConsoleLogs.
 *
 * When connected locally via WebSocket, sends JSON to the server.
 * Otherwise falls back to a browser download.
 */
function saveOrDownload(
  state: DevBarState,
  opts: {
    type: string;
    data: Record<string, unknown>;
    savingFlag: 'savingOutline' | 'savingSchema' | 'savingConsoleLogs' | 'savingA11yAudit';
    downloadFilename: string;
    downloadContent: string;
    downloadMimeType: string;
    notificationKey: 'outline' | 'schema' | 'consoleLogs' | 'a11y';
    notificationMessage: string;
  }
): void {
  const effectiveSave = resolveSaveLocation(state.options.saveLocation, state.sweetlinkConnected);
  if (effectiveSave === 'local' && state.ws?.readyState === WebSocket.OPEN) {
    state[opts.savingFlag] = true;
    state.render();

    state.ws.send(
      JSON.stringify({
        type: opts.type,
        data: opts.data,
      })
    );
  } else {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadFile(`${opts.downloadFilename}-${timestamp}.md`, opts.downloadContent, opts.downloadMimeType);
    state.handleNotification(opts.notificationKey, opts.notificationMessage, SCREENSHOT_NOTIFICATION_MS);
  }
}

/** Build html2canvas options for full-page or viewport capture */
function captureOptions(scale: number, viewportOnly: boolean): Record<string, unknown> {
  return {
    logging: false,
    useCORS: true,
    allowTaint: true,
    scale,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    // Full-page: render from document top; viewport: offset for scroll position
    scrollX: viewportOnly ? -window.scrollX : 0,
    scrollY: viewportOnly ? -window.scrollY : 0,
    ignoreElements: (el: Element) => el.hasAttribute('data-devbar'),
    onclone: (_doc: Document, clone: HTMLElement) => {
      // Fix html2canvas rendering issues in the cloned document:
      // 1. CSS animations with fill-mode:both leave elements at opacity:0
      //    in the clone (animations don't replay). Disabling animations
      //    reverts elements to their natural computed styles (opacity:1).
      // 2. mix-blend-mode (CRT overlays, etc.) renders incorrectly.
      const style = document.createElement('style');
      style.textContent = [
        '*, *::before, *::after {',
        '  animation: none !important;',
        '  mix-blend-mode: normal !important;',
        '}',
      ].join('\n');
      clone.ownerDocument.head.appendChild(style);
    },
  };
}

/** Crop a full-page canvas down to the visible viewport at the given scale */
function cropToViewport(source: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const vw = window.innerWidth * scale;
  const vh = window.innerHeight * scale;
  const sx = window.scrollX * scale;
  const sy = window.scrollY * scale;

  // If the source already matches viewport size, skip cropping
  if (source.width <= vw && source.height <= vh) return source;

  const cropped = document.createElement('canvas');
  cropped.width = vw;
  cropped.height = vh;
  const ctx = cropped.getContext('2d');
  if (!ctx) return source;
  ctx.drawImage(source, sx, sy, vw, vh, 0, 0, vw, vh);
  return cropped;
}

/**
 * Copy a file path to the clipboard and update state.
 */
export async function copyPathToClipboard(state: DevBarState, path: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(path);
    state.copiedPath = true;
    if (state.copiedPathTimeout) clearTimeout(state.copiedPathTimeout);
    state.copiedPathTimeout = setTimeout(() => {
      state.copiedPath = false;
      state.render();
    }, CLIPBOARD_NOTIFICATION_MS);
    state.render();
  } catch (error) {
    console.error('[GlobalDevBar] Failed to copy path:', error);
  }
}

/**
 * Take a screenshot and either save to file or copy to clipboard.
 */
export async function handleScreenshot(
  state: DevBarState,
  copyToClipboard = false
): Promise<void> {
  if (state.capturing) return;
  const effectiveSave = resolveSaveLocation(state.options.saveLocation, state.sweetlinkConnected);
  // When saving (not clipboard) with 'local' mode, require connection
  if (!copyToClipboard && effectiveSave === 'local' && !state.sweetlinkConnected) return;

  let cleanup: (() => void) | null = null;

  try {
    state.capturing = true;
    state.render();

    cleanup = prepareForCapture();
    await delay(SCREENSHOT_BLUR_DELAY_MS);

    const html2canvas = await getHtml2Canvas();
    const fullCanvas = await html2canvas(document.body, captureOptions(SCREENSHOT_SCALE, copyToClipboard));

    // Restore page state
    cleanup();
    cleanup = null;

    // Clipboard copies use viewport crop (for quick paste); saves capture full page
    const canvas = copyToClipboard ? cropToViewport(fullCanvas, SCREENSHOT_SCALE) : fullCanvas;

    if (copyToClipboard) {
      try {
        await copyCanvasToClipboard(canvas);
        state.copiedToClipboard = true;
        state.render();
        if (state.screenshotTimeout) clearTimeout(state.screenshotTimeout);
        state.screenshotTimeout = setTimeout(() => {
          state.copiedToClipboard = false;
          state.render();
        }, CLIPBOARD_NOTIFICATION_MS);
      } catch (e) {
        console.error('[GlobalDevBar] Failed to copy to clipboard:', e);
      }
    } else {
      const dataUrl = canvasToDataUrl(canvas, {
        format: 'jpeg',
        quality: state.options.screenshotQuality,
      });
      if (effectiveSave === 'local' && state.ws?.readyState === WebSocket.OPEN) {
        // Include web vitals metrics
        const webVitals: Record<string, number> = {};
        if (state.lcpValue !== null) webVitals.lcp = Math.round(state.lcpValue);
        if (state.clsValue > 0) webVitals.cls = state.clsValue;
        if (state.inpValue > 0) webVitals.inp = Math.round(state.inpValue);

        // Get FCP from performance entries
        const fcpEntry = performance
          .getEntriesByType('paint')
          .find((e) => e.name === 'first-contentful-paint');
        if (fcpEntry) webVitals.fcp = Math.round(fcpEntry.startTime);

        // Calculate page size
        let pageSize = 0;
        const navEntry = performance.getEntriesByType(
          'navigation'
        )[0] as PerformanceNavigationTiming;
        if (navEntry) pageSize += navEntry.transferSize || 0;
        performance.getEntriesByType('resource').forEach((entry) => {
          pageSize += (entry as PerformanceResourceTiming).transferSize || 0;
        });

        state.ws.send(
          JSON.stringify({
            type: 'save-screenshot',
            data: {
              screenshot: dataUrl,
              width: canvas.width,
              height: canvas.height,
              logs: state.consoleLogs,
              url: window.location.href,
              timestamp: Date.now(),
              webVitals: Object.keys(webVitals).length > 0 ? webVitals : undefined,
              pageSize: pageSize > 0 ? pageSize : undefined,
            },
          })
        );
      } else {
        // Browser download fallback
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        downloadDataUrl(`devbar-screenshot-${timestamp}.jpg`, dataUrl);
        state.handleNotification('screenshot', 'screenshot downloaded', SCREENSHOT_NOTIFICATION_MS);
      }
    }
  } catch (e) {
    console.error('[GlobalDevBar] Screenshot failed:', e);
    if (cleanup) cleanup();
  } finally {
    state.capturing = false;
    state.render();
  }
}

/**
 * Perform a design review by capturing a screenshot and sending it to Claude.
 */
export async function handleDesignReview(state: DevBarState): Promise<void> {
  if (state.designReviewInProgress || !state.sweetlinkConnected) return;

  let cleanup: (() => void) | null = null;

  try {
    state.designReviewInProgress = true;
    state.designReviewError = null; // Clear any previous error
    if (state.designReviewErrorTimeout) {
      clearTimeout(state.designReviewErrorTimeout);
      state.designReviewErrorTimeout = null;
    }
    state.render();

    cleanup = prepareForCapture();
    await delay(SCREENSHOT_BLUR_DELAY_MS);

    const html2canvas = await getHtml2Canvas();
    const canvas = await html2canvas(document.body, captureOptions(1, false)); // Full quality, full page for design review

    // Restore page state
    cleanup();
    cleanup = null;

    const dataUrl = canvasToDataUrl(canvas, { format: 'png' });
    if (state.ws?.readyState === WebSocket.OPEN) {
      state.ws.send(
        JSON.stringify({
          type: 'design-review-screenshot',
          data: {
            screenshot: dataUrl,
            width: canvas.width,
            height: canvas.height,
            logs: state.consoleLogs,
            url: window.location.href,
            timestamp: Date.now(),
          },
        })
      );
    }
  } catch (e) {
    console.error('[GlobalDevBar] Design review failed:', e);
    if (cleanup) cleanup();
    state.designReviewInProgress = false;
    state.render();
  }
}

/**
 * Show the design review confirmation modal. Checks API key status first.
 */
export function showDesignReviewConfirmation(state: DevBarState): void {
  if (!state.sweetlinkConnected) return;

  // Request API key status from server
  if (state.ws?.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'check-api-key' }));
  }

  // Show the confirmation modal
  state.showDesignReviewConfirm = true;
  state.showOutlineModal = false;
  state.showSchemaModal = false;
  state.showA11yModal = false;
  state.showSettingsPopover = false;
  state.consoleFilter = null;
  state.render();
}

/**
 * Calculate estimated cost for design review based on viewport size.
 */
export function calculateCostEstimate(
  state: DevBarState
): { tokens: number; cost: string } | null {
  if (!state.apiKeyStatus?.pricing) return null;

  // Image token estimation for Claude Vision:
  // Images are resized to fit within a bounding box, then tokenized
  // Rough estimate: ~1 token per 1.5x1.5 pixels, or (width * height) / 750
  const width = window.innerWidth;
  const height = window.innerHeight;
  const imageTokens = Math.ceil((width * height) / 750);

  // Prompt is ~500 tokens, output up to 2048 tokens
  const promptTokens = 500;
  const estimatedOutputTokens = 1500; // Conservative estimate

  const totalInputTokens = imageTokens + promptTokens;
  const { input: inputPrice, output: outputPrice } = state.apiKeyStatus.pricing;

  const inputCost = (totalInputTokens / 1_000_000) * inputPrice;
  const outputCost = (estimatedOutputTokens / 1_000_000) * outputPrice;
  const totalCost = inputCost + outputCost;

  return {
    tokens: totalInputTokens + estimatedOutputTokens,
    cost: totalCost < 0.01 ? '<$0.01' : `~$${totalCost.toFixed(2)}`,
  };
}

/**
 * Close the design review confirmation modal.
 */
export function closeDesignReviewConfirm(state: DevBarState): void {
  state.showDesignReviewConfirm = false;
  state.apiKeyStatus = null; // Reset so it's re-fetched next time
  state.render();
}

/**
 * Proceed with design review after confirmation.
 */
export function proceedWithDesignReview(state: DevBarState): void {
  state.showDesignReviewConfirm = false;
  handleDesignReview(state);
}

/**
 * Toggle the document outline modal.
 */
export function handleDocumentOutline(state: DevBarState): void {
  state.showOutlineModal = !state.showOutlineModal;
  state.showSchemaModal = false;
  state.showA11yModal = false;
  state.showSettingsPopover = false;
  state.consoleFilter = null;
  state.render();
}

/**
 * Toggle the page schema modal.
 */
export function handlePageSchema(state: DevBarState): void {
  state.showSchemaModal = !state.showSchemaModal;
  state.showOutlineModal = false;
  state.showA11yModal = false;
  state.showSettingsPopover = false;
  state.consoleFilter = null;
  state.render();
}

/**
 * Toggle the accessibility audit modal.
 */
export function handleA11yAudit(state: DevBarState): void {
  state.showA11yModal = !state.showA11yModal;
  state.showOutlineModal = false;
  state.showSchemaModal = false;
  state.showSettingsPopover = false;
  state.consoleFilter = null;
  state.render();
}

/**
 * Save the accessibility audit report to file via WebSocket.
 */
export function handleSaveA11yAudit(state: DevBarState, markdown: string): void {
  if (state.savingA11yAudit) return;

  saveOrDownload(state, {
    type: 'save-a11y',
    data: { markdown, url: window.location.href, title: document.title, timestamp: Date.now() },
    savingFlag: 'savingA11yAudit',
    downloadFilename: 'a11y-audit',
    downloadContent: markdown,
    downloadMimeType: 'text/markdown',
    notificationKey: 'a11y',
    notificationMessage: 'a11y report downloaded',
  });
}

/**
 * Save the document outline to file via WebSocket.
 */
export function handleSaveOutline(state: DevBarState): void {
  if (state.savingOutline) return; // Prevent repeated clicks

  const outline = extractDocumentOutline();
  const markdown = outlineToMarkdown(outline);

  saveOrDownload(state, {
    type: 'save-outline',
    data: { outline, markdown, url: window.location.href, title: document.title, timestamp: Date.now() },
    savingFlag: 'savingOutline',
    downloadFilename: 'outline',
    downloadContent: markdown,
    downloadMimeType: 'text/markdown',
    notificationKey: 'outline',
    notificationMessage: 'outline downloaded',
  });
}

/**
 * Save console logs to file via WebSocket.
 */
export function handleSaveConsoleLogs(
  state: DevBarState,
  filteredLogs: { level: string; message: string; timestamp: number }[]
): void {
  if (state.savingConsoleLogs) return;

  // Format logs as markdown
  const lines = filteredLogs.map((log) => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    return `- **[${time}]** \`${log.level}\` ${log.message}`;
  });
  const markdown = lines.length > 0 ? lines.join('\n') : '_No logs_';

  saveOrDownload(state, {
    type: 'save-console-logs',
    data: { logs: filteredLogs, markdown, url: window.location.href, title: document.title, timestamp: Date.now() },
    savingFlag: 'savingConsoleLogs',
    downloadFilename: 'console-logs',
    downloadContent: markdown,
    downloadMimeType: 'text/markdown',
    notificationKey: 'consoleLogs',
    notificationMessage: 'console logs downloaded',
  });
}

/**
 * Save the page schema to file via WebSocket.
 */
export function handleSaveSchema(state: DevBarState): void {
  if (state.savingSchema) return; // Prevent repeated clicks

  const schema = extractPageSchema();
  const markdown = schemaToMarkdown(schema);

  saveOrDownload(state, {
    type: 'save-schema',
    data: { schema, markdown, url: window.location.href, title: document.title, timestamp: Date.now() },
    savingFlag: 'savingSchema',
    downloadFilename: 'schema',
    downloadContent: markdown,
    downloadMimeType: 'text/markdown',
    notificationKey: 'schema',
    notificationMessage: 'schema downloaded',
  });
}
