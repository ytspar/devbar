/**
 * HMR Handler
 *
 * Handles HMR (Hot Module Replacement) screenshots.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import type { HmrScreenshotData } from '../../types.js';
import {
  generateBaseFilename,
  HMR_SCREENSHOT_DIR,
} from '../../urlUtils.js';
import { extractBase64FromDataUrl } from '../../browser/screenshotUtils.js';
import { getProjectRoot } from '../index.js';

export interface HmrScreenshotResult {
  screenshotPath: string;
  logsPath: string;
  logSummary: {
    totalLogs: number;
    errorCount: number;
    warningCount: number;
    hasNewErrors: boolean;
  };
}

interface FormattedLog {
  timestamp: string;
  level: string;
  message: string;
  stack?: string;
  source?: string;
}

/**
 * Format a console log for JSON serialization
 */
function formatLogForJson(log: { timestamp: number; level: string; message: string; stack?: string; source?: string }): FormattedLog {
  return {
    timestamp: new Date(log.timestamp).toISOString(),
    level: log.level,
    message: log.message,
    stack: log.stack,
    source: log.source
  };
}

/**
 * Handle HMR screenshot: save screenshot and logs, return paths and summary
 */
export async function handleHmrScreenshot(data: HmrScreenshotData): Promise<HmrScreenshotResult> {
  const { screenshot, url, timestamp, logs, trigger, changedFile, hmrMetadata } = data;

  // Create directory if it doesn't exist (relative to project root captured at server start)
  const dir = join(getProjectRoot(), HMR_SCREENSHOT_DIR);
  await fs.mkdir(dir, { recursive: true });

  // Generate filename with timestamp and trigger using shared utility
  const baseFilename = generateBaseFilename('hmr', timestamp, trigger);

  // Save screenshot
  const screenshotPath = join(dir, `${baseFilename}.jpg`);
  const base64Data = extractBase64FromDataUrl(screenshot);
  await fs.writeFile(screenshotPath, Buffer.from(base64Data, 'base64'));

  // Calculate log summary
  const errorCount = logs.errors.length;
  const warningCount = logs.warnings.length;
  const logSummary = {
    totalLogs: logs.all.length,
    errorCount,
    warningCount,
    hasNewErrors: errorCount > 0 // In a real implementation, we'd track previous error count
  };

  // Save logs as JSON
  const logsPath = join(dir, `${baseFilename}-logs.json`);
  const logsJson = {
    meta: {
      capturedAt: new Date(timestamp).toISOString(),
      url,
      trigger,
      changedFile,
      hmrMetadata
    },
    summary: logSummary,
    logs: {
      all: logs.all.map(formatLogForJson),
      errors: logs.errors.map(formatLogForJson),
      warnings: logs.warnings.map(formatLogForJson)
    }
  };
  await fs.writeFile(logsPath, JSON.stringify(logsJson, null, 2), 'utf-8');

  // Log summary to console
  const errorEmoji = errorCount > 0 ? '❌' : '✓';
  const warnEmoji = warningCount > 0 ? '⚠️' : '✓';
  console.log(`[Sweetlink] HMR screenshot saved: ${screenshotPath}`);
  console.log(`[Sweetlink] Logs: ${logs.all.length} total | ${warnEmoji} ${warningCount} warnings | ${errorEmoji} ${errorCount} errors`);

  // If there are errors, log them
  if (errorCount > 0) {
    console.log('[Sweetlink] Errors:');
    for (const error of logs.errors.slice(0, 3)) {
      console.log(`  └─ ${error.message.slice(0, 100)}`);
    }
    if (errorCount > 3) {
      console.log(`  └─ ... and ${errorCount - 3} more errors`);
    }
  }

  return { screenshotPath, logsPath, logSummary };
}
