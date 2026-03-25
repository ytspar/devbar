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
 */
export async function annotateScreenshot(
  page: Page,
  refMap: RefMap
): Promise<Buffer> {
  // Inject overlay elements
  await page.evaluate((refs: Array<{ ref: string; role: string; name: string }>) => {
    const container = document.createElement('div');
    container.id = '__sweetlink_annotations__';
    container.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 999999;';

    for (const refEntry of refs) {
      // Find element by role + name using ARIA
      let element: Element | null = null;
      const allElements = Array.from(document.querySelectorAll('*'));
      for (const el of allElements) {
        const role = el.getAttribute('role') ?? (el as HTMLElement).tagName?.toLowerCase();
        const name = el.getAttribute('aria-label') ??
          (el as HTMLElement).textContent?.trim().substring(0, 50) ?? '';

        // Match by role keyword and name substring
        const roleMatch = role === refEntry.role ||
          (refEntry.role === 'button' && el.tagName === 'BUTTON') ||
          (refEntry.role === 'link' && el.tagName === 'A') ||
          (refEntry.role === 'textbox' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) ||
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

      // Create label
      const label = document.createElement('div');
      label.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top: ${Math.max(0, rect.top - 18)}px;
        background: rgba(220, 38, 38, 0.9);
        color: white;
        font-size: 11px;
        font-family: monospace;
        font-weight: bold;
        padding: 1px 4px;
        border-radius: 2px;
        z-index: 999999;
        pointer-events: none;
        line-height: 16px;
      `;
      label.textContent = refEntry.ref;

      // Create outline
      const outline = document.createElement('div');
      outline.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top: ${rect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        border: 2px solid rgba(220, 38, 38, 0.7);
        border-radius: 2px;
        z-index: 999998;
        pointer-events: none;
      `;

      container.appendChild(label);
      container.appendChild(outline);
    }

    document.body.appendChild(container);
  }, refMap.entries.map(e => ({ ref: e.ref, role: e.role, name: e.name })));

  // Small wait for rendering
  await page.waitForTimeout(50);

  // Take screenshot
  const buffer = await page.screenshot();

  // Remove overlay
  await page.evaluate(() => {
    const container = document.getElementById('__sweetlink_annotations__');
    container?.remove();
  });

  return buffer;
}
