/**
 * Snapshot Diffing & Annotation
 *
 * Produces unified text diffs of accessibility tree snapshots
 * and annotated screenshots with ref labels.
 */

type Page = import('playwright').Page;

import type { RefMap } from './refs.js';

// ============================================================================
// Text Diffing
// ============================================================================

/**
 * Produce a unified diff between baseline and current accessibility snapshots.
 * Shows added (+), removed (-), and unchanged lines.
 */
export function diffSnapshots(baseline: RefMap, current: RefMap): string {
  const baseLines = baseline.rawSnapshot.split('\n');
  const currLines = current.rawSnapshot.split('\n');

  // Simple line-by-line diff using LCS (longest common subsequence)
  const lcs = computeLCS(baseLines, currLines);
  const result: string[] = [];

  let bi = 0;
  let ci = 0;
  let li = 0;

  while (bi < baseLines.length || ci < currLines.length) {
    if (li < lcs.length && bi < baseLines.length && ci < currLines.length) {
      // Lines before LCS match
      while (bi < baseLines.length && baseLines[bi] !== lcs[li]) {
        result.push(`- ${baseLines[bi]}`);
        bi++;
      }
      while (ci < currLines.length && currLines[ci] !== lcs[li]) {
        result.push(`+ ${currLines[ci]}`);
        ci++;
      }
      // LCS match — unchanged line
      if (li < lcs.length) {
        result.push(`  ${lcs[li]}`);
        bi++;
        ci++;
        li++;
      }
    } else {
      // Remaining lines after LCS
      while (bi < baseLines.length) {
        result.push(`- ${baseLines[bi]}`);
        bi++;
      }
      while (ci < currLines.length) {
        result.push(`+ ${currLines[ci]}`);
        ci++;
      }
    }
  }

  // Check if there are any actual changes
  const hasChanges = result.some((line) => line.startsWith('+ ') || line.startsWith('- '));
  if (!hasChanges) {
    return '(no changes detected)';
  }

  return result.join('\n');
}

/**
 * Compute longest common subsequence of two string arrays.
 */
function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  // Backtrack to find LCS
  const lcs: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]!);
      i--;
      j--;
    } else if (dp[i - 1]![j]! > dp[i]![j - 1]!) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

// ============================================================================
// Annotated Screenshots
// ============================================================================

/**
 * Take an annotated screenshot with ref labels overlaid on elements.
 * Injects temporary overlay divs, captures screenshot, then removes them.
 *
 * - Captures the full page so annotations below the fold are visible.
 * - Skips elements with zero bounding-box (avoids stray labels at 0,0).
 * - Positions labels above the element (or below if at the page top),
 *   uses absolute (document-relative) coordinates so they line up in
 *   the full-page image.
 */
export async function annotateScreenshot(page: Page, refMap: RefMap): Promise<Buffer> {
  // Inject overlay elements
  await page.evaluate(
    (refs: Array<{ ref: string; role: string; name: string }>) => {
      const container = document.createElement('div');
      container.id = '__sweetlink_annotations__';
      // Absolute positioning so labels stay attached to elements as the
      // page scrolls — matters for full-page screenshots.
      container.style.cssText =
        'position: absolute; top: 0; left: 0; width: 100%; pointer-events: none; z-index: 2147483647;';

      const sx = window.scrollX;
      const sy = window.scrollY;

      for (const refEntry of refs) {
        // Find element by role + name using ARIA
        let element: Element | null = null;
        const allElements = Array.from(document.querySelectorAll('*'));
        for (const el of allElements) {
          const role = el.getAttribute('role') ?? (el as HTMLElement).tagName?.toLowerCase();
          const name =
            el.getAttribute('aria-label') ??
            (el as HTMLElement).textContent?.trim().substring(0, 50) ??
            '';

          const roleMatch =
            role === refEntry.role ||
            (refEntry.role === 'button' && el.tagName === 'BUTTON') ||
            (refEntry.role === 'link' && el.tagName === 'A') ||
            (refEntry.role === 'textbox' &&
              (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) ||
            (refEntry.role === 'heading' && /^H[1-6]$/.test(el.tagName)) ||
            (refEntry.role === 'img' && el.tagName === 'IMG') ||
            (refEntry.role === 'checkbox' && el.getAttribute('type') === 'checkbox');

          if (roleMatch && name.includes(refEntry.name.substring(0, 20))) {
            element = el;
            break;
          }
        }

        if (!element) continue;
        const rect = element.getBoundingClientRect();
        // Skip elements without a real visual presence — these were
        // producing stray labels at (0,0) on the screenshot.
        if (rect.width < 1 || rect.height < 1) continue;

        // Document-space coords (so labels line up with the captured
        // full-page image, not the viewport).
        const docLeft = rect.left + sx;
        const docTop = rect.top + sy;
        const labelHeight = 18;
        const padX = 6;

        // Place the label above the element when possible, else below.
        const goAbove = docTop >= labelHeight + 2;
        const labelTop = goAbove ? docTop - labelHeight - 2 : docTop + rect.height + 2;

        const label = document.createElement('div');
        label.style.cssText = `
        position: absolute;
        left: ${docLeft}px;
        top: ${labelTop}px;
        background: rgba(16, 185, 129, 0.95);
        color: #0a0f1a;
        font-size: 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-weight: 700;
        padding: 2px ${padX}px;
        border-radius: 3px;
        height: ${labelHeight}px;
        line-height: ${labelHeight - 4}px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.25);
        white-space: nowrap;
      `;
        label.textContent = refEntry.ref;

        const outline = document.createElement('div');
        outline.style.cssText = `
        position: absolute;
        left: ${docLeft}px;
        top: ${docTop}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        border: 2px solid rgba(16, 185, 129, 0.8);
        border-radius: 3px;
        box-sizing: border-box;
      `;

        container.appendChild(label);
        container.appendChild(outline);
      }

      document.body.appendChild(container);
    },
    refMap.entries.map((e) => ({ ref: e.ref, role: e.role, name: e.name }))
  );

  await page.waitForTimeout(50);

  // Capture full page so refs below the fold are visible. Without this
  // the annotated screenshot misses anything past the viewport.
  const buffer = await page.screenshot({ fullPage: true });

  await page.evaluate(() => {
    const container = document.getElementById('__sweetlink_annotations__');
    container?.remove();
  });

  return buffer;
}
