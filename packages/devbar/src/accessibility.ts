/**
 * Accessibility Audit Utilities
 *
 * Lazy-loads axe-core and provides accessibility auditing capabilities.
 */

import type { AxeResult, AxeViolation } from '@ytspar/sweetlink/types';
import { PALETTE } from './constants.js';

export type { AxeResult, AxeViolation };

/**
 * Accessibility audit state
 */
export interface A11yState {
  isLoading: boolean;
  lastRun: number | null;
  result: AxeResult | null;
  error: string | null;
}

// Cache duration in milliseconds (30 seconds)
const CACHE_DURATION_MS = 30000;

// Module-level state
let axePromise: Promise<typeof import('axe-core')> | null = null;
let cachedResult: AxeResult | null = null;
let cacheTimestamp: number | null = null;

/**
 * Lazy load axe-core
 */
async function loadAxe(): Promise<typeof import('axe-core')> {
  if (!axePromise) {
    axePromise = import('axe-core');
  }
  return axePromise;
}

/**
 * Check if axe-core is loaded
 */
export function isAxeLoaded(): boolean {
  return axePromise !== null;
}

/**
 * Preload axe-core without waiting
 */
export function preloadAxe(): void {
  loadAxe().catch(() => {
    // Silently ignore preload errors
  });
}

/**
 * Run accessibility audit on the page
 * Returns cached result if within cache duration
 */
export async function runA11yAudit(forceRefresh = false): Promise<AxeResult> {
  // Return cached result if valid
  if (
    !forceRefresh &&
    cachedResult &&
    cacheTimestamp &&
    Date.now() - cacheTimestamp < CACHE_DURATION_MS
  ) {
    return cachedResult;
  }

  const axeModule = await loadAxe();
  // Handle ESM/CJS interop
  const axe = (axeModule as unknown as { default?: typeof axeModule }).default ?? axeModule;

  // Run axe analysis, excluding devbar's own UI elements
  const result = await axe.run(
    { exclude: ['[data-devbar]'] },
    {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
      },
    }
  );

  // Transform to our format
  const auditResult: AxeResult = {
    violations: result.violations as AxeViolation[],
    passes: result.passes.map((p: { id: string; description: string }) => ({
      id: p.id,
      description: p.description,
    })),
    incomplete: result.incomplete as AxeViolation[],
    inapplicable: result.inapplicable.map((i: { id: string }) => ({ id: i.id })),
    timestamp: new Date().toISOString(),
    url: window.location.href,
  };

  // Cache the result
  cachedResult = auditResult;
  cacheTimestamp = Date.now();

  return auditResult;
}

/** Narrow alias of AxeViolation['impact'] for the public API. */
export type AxeImpact = AxeViolation['impact'];

/**
 * Get violation count by impact level
 */
export function getViolationCounts(
  violations: AxeViolation[]
): Record<AxeImpact | 'total', number> {
  const counts: Record<AxeImpact | 'total', number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    total: 0,
  };

  for (const violation of violations) {
    counts[violation.impact] += 1;
    counts.total += 1;
  }

  return counts;
}

/**
 * Group violations by impact level
 */
export function groupViolationsByImpact(
  violations: AxeViolation[]
): Map<AxeImpact, AxeViolation[]> {
  const groups = new Map<AxeImpact, AxeViolation[]>();
  const impactOrder: AxeImpact[] = ['critical', 'serious', 'moderate', 'minor'];

  for (const impact of impactOrder) {
    groups.set(impact, []);
  }

  for (const violation of violations) {
    const group = groups.get(violation.impact);
    if (group) {
      group.push(violation);
    }
  }

  return groups;
}

/**
 * Get color for impact level. Accepts string for runtime safety — callers
 * should pass `AxeImpact`, but unexpected values fall back to gray rather
 * than crashing on undefined.
 */
export function getImpactColor(impact: AxeImpact | string): string {
  const colors: Record<AxeImpact, string> = {
    critical: PALETTE.red,
    serious: PALETTE.orange,
    moderate: PALETTE.amber,
    minor: PALETTE.lime,
  };
  return (colors as Record<string, string>)[impact] ?? PALETTE.gray;
}

/**
 * Convert an axe-core audit result to markdown format
 */
export function a11yToMarkdown(result: AxeResult): string {
  const counts = getViolationCounts(result.violations);
  const lines: string[] = [
    '# Accessibility Audit Report',
    '',
    `**URL:** ${result.url}`,
    `**Timestamp:** ${result.timestamp}`,
    '',
    '## Summary',
    '',
    `- **Total violations:** ${counts.total}`,
    `- Critical: ${counts.critical}`,
    `- Serious: ${counts.serious}`,
    `- Moderate: ${counts.moderate}`,
    `- Minor: ${counts.minor}`,
    `- Passes: ${result.passes.length}`,
    `- Incomplete: ${result.incomplete.length}`,
    '',
  ];

  if (result.violations.length === 0) {
    lines.push('No accessibility violations found.');
    return lines.join('\n');
  }

  const grouped = groupViolationsByImpact(result.violations);
  for (const [impact, violations] of grouped) {
    if (violations.length === 0) continue;
    lines.push(`## ${impact.charAt(0).toUpperCase() + impact.slice(1)} (${violations.length})`);
    lines.push('');

    for (const v of violations) {
      lines.push(`### ${v.id}`);
      lines.push('');
      lines.push(`**${v.help}**`);
      lines.push('');
      lines.push(v.description);
      lines.push('');
      lines.push(`- Help: ${v.helpUrl}`);
      lines.push(`- Elements affected: ${v.nodes.length}`);
      lines.push('');

      for (const node of v.nodes.slice(0, 10)) {
        const html = node.html.length > 120 ? `${node.html.slice(0, 120)}...` : node.html;
        lines.push(`  - \`${html}\``);
        if (node.target.length > 0) {
          lines.push(`    Selector: \`${node.target.join(', ')}\``);
        }
      }
      if (v.nodes.length > 10) {
        lines.push(`  - ... and ${v.nodes.length - 10} more`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
