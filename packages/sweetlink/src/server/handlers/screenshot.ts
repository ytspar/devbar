/**
 * Screenshot Handler
 *
 * Handles saving screenshots to the file system.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { extractBase64FromDataUrl } from '../../browser/screenshotUtils.js';
import { generateBaseFilename, SCREENSHOT_DIR } from '../../urlUtils.js';
import { getProjectRoot } from '../index.js';

/**
 * Web Vitals metrics included with screenshot
 */
export interface WebVitalsMetrics {
  fcp?: number;
  lcp?: number;
  cls?: number;
  inp?: number;
}

/**
 * Screenshot metadata saved alongside the image
 */
export interface ScreenshotMetadata {
  capturedAt: string;
  url: string;
  viewport: {
    width: number;
    height: number;
  };
  webVitals?: WebVitalsMetrics;
  pageSize?: number;
  consoleSummary?: {
    errors: number;
    warnings: number;
    total: number;
  };
}

/**
 * Handle save-screenshot command from browser
 */
export async function handleSaveScreenshot(data: {
  screenshot: string;
  logs?: Array<{ timestamp: number; level: string; message: string }>;
  url: string;
  timestamp: number;
  width: number;
  height: number;
  a11y?: unknown[];
  webVitals?: WebVitalsMetrics;
  pageSize?: number;
}): Promise<string> {
  const { screenshot, logs, url, timestamp, width, height, webVitals, pageSize } = data;

  // Create directory if it doesn't exist (relative to project root captured at server start)
  const dir = join(getProjectRoot(), SCREENSHOT_DIR);
  await fs.mkdir(dir, { recursive: true });

  // Generate filename with timestamp using shared utility
  const baseFilename = generateBaseFilename('screenshot', timestamp);

  // Save screenshot
  const screenshotPath = join(dir, `${baseFilename}.jpg`);
  const base64Data = extractBase64FromDataUrl(screenshot);
  await fs.writeFile(screenshotPath, Buffer.from(base64Data, 'base64'));

  // Calculate console summary
  let consoleSummary: ScreenshotMetadata['consoleSummary'] | undefined;
  if (logs && Array.isArray(logs) && logs.length > 0) {
    let errors = 0;
    let warnings = 0;
    for (const log of logs) {
      if (log.level === 'error') errors++;
      else if (log.level === 'warn') warnings++;
    }
    consoleSummary = {
      errors,
      warnings,
      total: logs.length,
    };
  }

  // Save screenshot metadata JSON
  const metricsPath = join(dir, `${baseFilename}-metrics.json`);
  const metadata: ScreenshotMetadata = {
    capturedAt: new Date(timestamp).toISOString(),
    url,
    viewport: { width, height },
    ...(webVitals && Object.keys(webVitals).length > 0 && { webVitals }),
    ...(pageSize && { pageSize }),
    ...(consoleSummary && { consoleSummary }),
  };
  await fs.writeFile(metricsPath, JSON.stringify(metadata, null, 2), 'utf-8');
  console.log(`[Sweetlink] Screenshot metadata saved: ${metricsPath}`);

  // Save console logs only if provided
  if (logs && Array.isArray(logs) && logs.length > 0) {
    // Save as human-readable text
    const logsPath = join(dir, `${baseFilename}-logs.txt`);
    const logLines = logs.map((log) => {
      const time = new Date(log.timestamp).toISOString();
      return `[${time}] ${log.level.toUpperCase()}: ${log.message}`;
    });

    const logsContent = [
      `Screenshot captured at: ${new Date(timestamp).toISOString()}`,
      `URL: ${url}`,
      `Dimensions: ${width}x${height}`,
      ``,
      `=== CONSOLE LOGS ===`,
      ``,
      ...logLines,
    ].join('\n');

    await fs.writeFile(logsPath, logsContent, 'utf-8');
    console.log(`[Sweetlink] Console logs saved: ${logsPath}`);

    // Save as JSON for programmatic access
    const logsJsonPath = join(dir, `${baseFilename}-logs.json`);
    const logsJson = {
      meta: {
        capturedAt: new Date(timestamp).toISOString(),
        url,
        dimensions: { width, height },
      },
      logs: logs.map((log) => ({
        timestamp: new Date(log.timestamp).toISOString(),
        level: log.level,
        message: log.message,
      })),
    };
    await fs.writeFile(logsJsonPath, JSON.stringify(logsJson, null, 2), 'utf-8');
    console.log(`[Sweetlink] Console logs JSON saved: ${logsJsonPath}`);
  }

  // Save a11y report if provided
  if (data.a11y && Array.isArray(data.a11y) && data.a11y.length > 0) {
    const a11yPath = join(dir, `${baseFilename}-a11y.json`);
    await fs.writeFile(a11yPath, JSON.stringify(data.a11y, null, 2), 'utf-8');
    console.log(`[Sweetlink] Accessibility report saved: ${a11yPath}`);
  } else if (data.a11y) {
    console.log('[Sweetlink] Accessibility check passed (no violations)');
  }

  return screenshotPath;
}
