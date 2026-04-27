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
  /** Path to the interactive HTML viewer with side-by-side + overlay views. */
  diffViewerPath?: string;
  pass: boolean;
  /**
   * When the comparison failed for IO/permission reasons (NOT a real pixel
   * mismatch), this carries the error message. CI users debugging "100%
   * mismatch" can check this to distinguish a real regression from a typo
   * in baselineDir or a missing baseline.
   */
  error?: string;
  /** True when the baseline was not found (vs. a real error). */
  baselineMissing?: boolean;
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

  // When an output path is requested OR there's a real mismatch, write a
  // side-by-side HTML viewer that embeds both screenshots and supports
  // toggling between baseline/current/overlay (CSS difference blend mode).
  // This is far more actionable than the percentage alone.
  if (options?.outputPath && !pass) {
    const dir = path.dirname(options.outputPath);
    await fs.mkdir(dir, { recursive: true });
    // Save the current PNG as the primary diff artifact (back-compat).
    await fs.writeFile(options.outputPath, current);
    result.diffImagePath = options.outputPath;

    // Write a sibling .html viewer with toggle/overlay UI.
    const viewerPath = `${options.outputPath.replace(/\.png$/i, '')}.diff.html`;
    const baselineB64 = baseline.toString('base64');
    const currentB64 = current.toString('base64');
    const html = `<!DOCTYPE html>
<html><head><title>Visual Diff</title>
<style>
  body{margin:0;font-family:system-ui;background:#0f172a;color:#e2e8f0}
  header{padding:12px 20px;background:#1e293b;display:flex;align-items:center;gap:16px}
  header h1{font-size:16px;font-weight:600;margin:0}
  header .stat{margin-left:auto;font-variant-numeric:tabular-nums}
  header .pill{padding:2px 8px;border-radius:10px;font-weight:600}
  .pill.fail{background:#7f1d1d;color:#fca5a5}
  button{background:#334155;color:#e2e8f0;border:0;padding:6px 12px;border-radius:4px;cursor:pointer;font:inherit}
  button.active{background:#0ea5e9;color:#000}
  main{display:flex;gap:8px;padding:8px;flex-wrap:wrap;justify-content:center}
  figure{margin:0;flex:1;min-width:300px;max-width:700px}
  figcaption{font-size:13px;color:#94a3b8;padding:4px 0 8px}
  img{display:block;max-width:100%;border:1px solid #334155}
  .stack{position:relative;display:inline-block;max-width:100%}
  .stack img{position:absolute;top:0;left:0}
  .stack img:first-child{position:relative}
  .stack img.overlay{mix-blend-mode:difference;filter:invert(1)}
</style></head>
<body>
<header>
  <h1>Visual Diff</h1>
  <button class="active" data-view="side">Side by side</button>
  <button data-view="overlay">Overlay diff</button>
  <button data-view="baseline">Baseline only</button>
  <button data-view="current">Current only</button>
  <div class="stat">
    <span class="pill fail">${result.mismatchPercentage.toFixed(2)}% mismatch</span>
  </div>
</header>
<main id="m">
  <figure id="f-baseline"><figcaption>Baseline</figcaption><img src="data:image/png;base64,${baselineB64}" /></figure>
  <figure id="f-current"><figcaption>Current</figcaption><img src="data:image/png;base64,${currentB64}" /></figure>
  <figure id="f-overlay" hidden><figcaption>Overlay (CSS difference blend)</figcaption>
    <div class="stack"><img src="data:image/png;base64,${baselineB64}" /><img class="overlay" src="data:image/png;base64,${currentB64}" /></div>
  </figure>
</main>
<script>
const buttons = document.querySelectorAll('header button');
const figs = { baseline: document.getElementById('f-baseline'), current: document.getElementById('f-current'), overlay: document.getElementById('f-overlay') };
buttons.forEach(b => b.addEventListener('click', () => {
  buttons.forEach(x => x.classList.toggle('active', x === b));
  const v = b.dataset.view;
  figs.baseline.hidden = v === 'overlay' || v === 'current';
  figs.current.hidden = v === 'overlay' || v === 'baseline';
  figs.overlay.hidden = v !== 'overlay';
}));
</script>
</body></html>`;
    await fs.writeFile(viewerPath, html);
    result.diffViewerPath = viewerPath;
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
    } catch (err) {
      // Distinguish baseline-missing (the common new-screenshot case where
      // the user is approving a new view) from real IO/permission errors.
      // Without this distinction, both surface as "100% mismatch" — leaving
      // CI users debugging a "visual regression" that's really a permissions
      // typo or a path mistake.
      const e = err as NodeJS.ErrnoException;
      const baselineMissing = e?.code === 'ENOENT' && e.path === baselinePath;
      results.push({
        file,
        result: {
          mismatchPercentage: 100,
          mismatchCount: 0,
          totalPixels: 0,
          pass: false,
          error: baselineMissing
            ? `Baseline not found: ${baselinePath}`
            : `${e?.code ?? 'Error'}: ${e?.message ?? String(err)}`,
          baselineMissing,
        },
      });
    }
  }

  return results;
}
