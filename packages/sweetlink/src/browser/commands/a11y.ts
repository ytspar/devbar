/**
 * Accessibility Audit Command Handler
 *
 * Dynamically imports axe-core to run accessibility audits.
 * Works when devbar is loaded (axe-core is a devbar dependency).
 */

import type { AxeResult, AxeViolation, GetA11yCommand, SweetlinkResponse } from '../../types.js';

/**
 * Handle get-a11y command from CLI
 */
export async function handleGetA11y(_command: GetA11yCommand): Promise<SweetlinkResponse> {
  try {
    let axeModule: typeof import('axe-core');
    try {
      axeModule = await import('axe-core');
    } catch {
      return {
        success: false,
        error:
          'axe-core is not available. Ensure devbar is loaded on the page (axe-core is a devbar dependency).',
        timestamp: Date.now(),
      };
    }

    // Handle ESM/CJS interop
    const axe = (axeModule as unknown as { default?: typeof axeModule }).default ?? axeModule;

    const result = await axe.run(
      { exclude: ['[data-devbar]'] },
      {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
        },
      }
    );

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

    // Group violations by impact for the summary
    const violationsByImpact: Record<string, number> = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    };
    for (const v of auditResult.violations) {
      violationsByImpact[v.impact] = (violationsByImpact[v.impact] || 0) + 1;
    }

    return {
      success: true,
      data: {
        result: auditResult,
        summary: {
          totalViolations: auditResult.violations.length,
          totalPasses: auditResult.passes.length,
          totalIncomplete: auditResult.incomplete.length,
          byImpact: violationsByImpact,
        },
        url: window.location.href,
        title: document.title,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Accessibility audit failed',
      timestamp: Date.now(),
    };
  }
}
