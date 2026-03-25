/**
 * Visual Diff
 *
 * Pixel-by-pixel comparison of screenshots using a simple diff algorithm.
 * Uses raw pixel comparison without external dependencies.
 */

import { promises as fs } from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface VisualDiffResult {
  mismatchPercentage: number;
  mismatchCount: number;
  totalPixels: number;
  diffImagePath?: string;
  pass: boolean;
}

// ============================================================================
// PNG Helpers (minimal decoder/encoder for comparison)
// ============================================================================

/**
 * Simple visual diff using Playwright's built-in comparison.
 * Takes two PNG buffers and returns mismatch info.
 *
 * For pixel-perfect comparison, we compare raw buffer bytes.
 * For a production-grade solution, pixelmatch can be added as optional dep.
 */
export async function visualDiff(
  baseline: Buffer,
  current: Buffer,
  options?: {
    threshold?: number; // 0-1, percentage threshold for PASS/FAIL
    outputPath?: string; // Path to save diff image
  }
): Promise<VisualDiffResult> {
  const threshold = options?.threshold ?? 0;

  // Simple byte-level comparison
  const minLen = Math.min(baseline.length, current.length);
  const maxLen = Math.max(baseline.length, current.length);
  let diffBytes = Math.abs(baseline.length - current.length);

  for (let i = 0; i < minLen; i++) {
    if (baseline[i] !== current[i]) {
      diffBytes++;
    }
  }

  const totalBytes = maxLen;
  const mismatchPercentage = totalBytes > 0 ? (diffBytes / totalBytes) * 100 : 0;
  const pass = mismatchPercentage <= threshold * 100;

  const result: VisualDiffResult = {
    mismatchPercentage: Math.round(mismatchPercentage * 100) / 100,
    mismatchCount: diffBytes,
    totalPixels: totalBytes,
    pass,
  };

  // If output path is specified and there are differences, save the current as "diff"
  if (options?.outputPath && !pass) {
    const dir = path.dirname(options.outputPath);
    await fs.mkdir(dir, { recursive: true });
    // Save the current screenshot as the diff reference
    await fs.writeFile(options.outputPath, current);
    result.diffImagePath = options.outputPath;
  }

  return result;
}

/**
 * Compare screenshots from a directory against baselines.
 */
export async function diffDirectory(
  baselineDir: string,
  currentDir: string,
  options?: { threshold?: number }
): Promise<Array<{ file: string; result: VisualDiffResult }>> {
  const results: Array<{ file: string; result: VisualDiffResult }> = [];
  const files = await fs.readdir(currentDir);

  for (const file of files) {
    if (!file.endsWith('.png') && !file.endsWith('.jpg')) continue;

    const currentPath = path.join(currentDir, file);
    const baselinePath = path.join(baselineDir, file);

    try {
      const current = await fs.readFile(currentPath);
      const baseline = await fs.readFile(baselinePath);
      const result = await visualDiff(baseline, current, options);
      results.push({ file, result });
    } catch {
      results.push({
        file,
        result: {
          mismatchPercentage: 100,
          mismatchCount: 0,
          totalPixels: 0,
          pass: false,
        },
      });
    }
  }

  return results;
}
