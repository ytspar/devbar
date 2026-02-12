/**
 * Accessibility Audit Utilities
 *
 * Lazy-loads axe-core and provides accessibility auditing capabilities.
 */

import type { AxeResult, AxeViolation } from '@ytspar/sweetlink/types';

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

/**
 * Get violation count by impact level
 */
export function getViolationCounts(violations: AxeViolation[]): Record<string, number> {
  const counts: Record<string, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    total: 0,
  };

  for (const violation of violations) {
    counts[violation.impact] = (counts[violation.impact] || 0) + 1;
    counts.total++;
  }

  return counts;
}

/**
 * Group violations by impact level
 */
export function groupViolationsByImpact(violations: AxeViolation[]): Map<string, AxeViolation[]> {
  const groups = new Map<string, AxeViolation[]>();
  const impactOrder = ['critical', 'serious', 'moderate', 'minor'];

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
 * Get color for impact level
 */
export function getImpactColor(impact: string): string {
  const colors: Record<string, string> = {
    critical: '#ef4444', // red
    serious: '#f97316', // orange
    moderate: '#f59e0b', // amber
    minor: '#84cc16', // lime
  };
  return colors[impact] || '#6b7280';
}

/**
 * Get badge color based on worst violation impact
 */
export function getBadgeColor(violations: AxeViolation[]): string {
  if (violations.some((v) => v.impact === 'critical')) return getImpactColor('critical');
  if (violations.some((v) => v.impact === 'serious')) return getImpactColor('serious');
  if (violations.some((v) => v.impact === 'moderate')) return getImpactColor('moderate');
  if (violations.some((v) => v.impact === 'minor')) return getImpactColor('minor');
  return '#10b981'; // green - no violations
}

/**
 * Clear cached result
 */
export function clearA11yCache(): void {
  cachedResult = null;
  cacheTimestamp = null;
}

/**
 * Get cached result without running audit
 */
export function getCachedResult(): AxeResult | null {
  if (cachedResult && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_DURATION_MS) {
    return cachedResult;
  }
  return null;
}

/**
 * Format violation for display
 */
export function formatViolation(violation: AxeViolation): string {
  return `[${violation.impact.toUpperCase()}] ${violation.help}\n${violation.description}\n${violation.nodes.length} element(s) affected`;
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
