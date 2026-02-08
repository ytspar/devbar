/**
 * Screenshot capture, design review, and related clipboard operations.
 *
 * Extracted from GlobalDevBar to reduce file size.
 */

import {
  CLIPBOARD_NOTIFICATION_MS,
  DEVBAR_SCREENSHOT_QUALITY,
  SCREENSHOT_BLUR_DELAY_MS,
  SCREENSHOT_SCALE,
} from '../constants.js';
import { getHtml2Canvas } from '../lazy/lazyHtml2Canvas.js';
import { extractDocumentOutline, outlineToMarkdown } from '../outline.js';
import { extractPageSchema, schemaToMarkdown } from '../schema.js';
import {
  canvasToDataUrl,
  copyCanvasToClipboard,
  delay,
  prepareForCapture,
} from '../utils.js';
import type { DevBarState } from './types.js';

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
  if (!copyToClipboard && !state.sweetlinkConnected) return;

  let cleanup: (() => void) | null = null;

  try {
    state.capturing = true;
    state.render();

    cleanup = prepareForCapture();
    await delay(SCREENSHOT_BLUR_DELAY_MS);

    const html2canvas = await getHtml2Canvas();
    const canvas = await html2canvas(document.body, {
      logging: false,
      useCORS: true,
      allowTaint: true,
      scale: SCREENSHOT_SCALE,
      width: window.innerWidth,
      windowWidth: window.innerWidth,
    });

    // Restore page state
    cleanup();
    cleanup = null;

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
        quality: DEVBAR_SCREENSHOT_QUALITY,
      });
      if (state.ws?.readyState === WebSocket.OPEN) {
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
    const canvas = await html2canvas(document.body, {
      logging: false,
      useCORS: true,
      allowTaint: true,
      scale: 1, // Full quality for design review
      width: window.innerWidth,
      windowWidth: window.innerWidth,
    });

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
  state.consoleFilter = null;
  state.render();
}

/**
 * Toggle the page schema modal.
 */
export function handlePageSchema(state: DevBarState): void {
  state.showSchemaModal = !state.showSchemaModal;
  state.showOutlineModal = false;
  state.consoleFilter = null;
  state.render();
}

/**
 * Save the document outline to file via WebSocket.
 */
export function handleSaveOutline(state: DevBarState): void {
  if (state.savingOutline) return; // Prevent repeated clicks

  const outline = extractDocumentOutline();
  const markdown = outlineToMarkdown(outline);

  if (state.ws?.readyState === WebSocket.OPEN) {
    state.savingOutline = true;
    state.render();

    state.ws.send(
      JSON.stringify({
        type: 'save-outline',
        data: {
          outline,
          markdown,
          url: window.location.href,
          title: document.title,
          timestamp: Date.now(),
        },
      })
    );
  }
}

/**
 * Save the page schema to file via WebSocket.
 */
export function handleSaveSchema(state: DevBarState): void {
  if (state.savingSchema) return; // Prevent repeated clicks

  const schema = extractPageSchema();
  const markdown = schemaToMarkdown(schema);

  if (state.ws?.readyState === WebSocket.OPEN) {
    state.savingSchema = true;
    state.render();

    state.ws.send(
      JSON.stringify({
        type: 'save-schema',
        data: {
          schema,
          markdown,
          url: window.location.href,
          title: document.title,
          timestamp: Date.now(),
        },
      })
    );
  }
}
