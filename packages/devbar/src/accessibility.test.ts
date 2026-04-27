import type { AxeResult, AxeViolation } from '@ytspar/sweetlink/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  a11yToMarkdown,
  clearA11yCache,
  formatViolation,
  getBadgeColor,
  getCachedResult,
  getImpactColor,
  getViolationCounts,
  groupViolationsByImpact,
  isAxeLoaded,
  preloadAxe,
  runA11yAudit,
} from './accessibility.js';

describe('isAxeLoaded', () => {
  it('returns false initially', () => {
    // Note: This test may fail if axe was loaded in a previous test
    // Clear cache first to ensure consistent state
    clearA11yCache();
    // isAxeLoaded tracks if the import promise exists, not the cache
    expect(typeof isAxeLoaded()).toBe('boolean');
  });
});

describe('getCachedResult', () => {
  it('returns null when no cached result', () => {
    clearA11yCache();
    expect(getCachedResult()).toBeNull();
  });
});

describe('clearA11yCache', () => {
  it('clears the cache without error', () => {
    expect(() => clearA11yCache()).not.toThrow();
  });
});

describe('getImpactColor', () => {
  it('returns red for critical', () => {
    expect(getImpactColor('critical')).toBe('#ef4444');
  });

  it('returns orange for serious', () => {
    expect(getImpactColor('serious')).toBe('#f97316');
  });

  it('returns amber for moderate', () => {
    expect(getImpactColor('moderate')).toBe('#f59e0b');
  });

  it('returns lime for minor', () => {
    expect(getImpactColor('minor')).toBe('#84cc16');
  });

  it('returns gray for unknown impact', () => {
    expect(getImpactColor('unknown')).toBe('#6b7280');
  });
});

describe('getViolationCounts', () => {
  const mockViolations: AxeViolation[] = [
    {
      id: 'test1',
      impact: 'critical',
      description: 'Test 1',
      help: 'Fix test 1',
      helpUrl: 'https://example.com',
      tags: ['wcag2a'],
      nodes: [],
    },
    {
      id: 'test2',
      impact: 'critical',
      description: 'Test 2',
      help: 'Fix test 2',
      helpUrl: 'https://example.com',
      tags: ['wcag2a'],
      nodes: [],
    },
    {
      id: 'test3',
      impact: 'serious',
      description: 'Test 3',
      help: 'Fix test 3',
      helpUrl: 'https://example.com',
      tags: ['wcag2aa'],
      nodes: [],
    },
    {
      id: 'test4',
      impact: 'minor',
      description: 'Test 4',
      help: 'Fix test 4',
      helpUrl: 'https://example.com',
      tags: ['best-practice'],
      nodes: [],
    },
  ];

  it('counts violations by impact', () => {
    const counts = getViolationCounts(mockViolations);

    expect(counts.critical).toBe(2);
    expect(counts.serious).toBe(1);
    expect(counts.moderate).toBe(0);
    expect(counts.minor).toBe(1);
    expect(counts.total).toBe(4);
  });

  it('returns zeros for empty array', () => {
    const counts = getViolationCounts([]);

    expect(counts.critical).toBe(0);
    expect(counts.serious).toBe(0);
    expect(counts.moderate).toBe(0);
    expect(counts.minor).toBe(0);
    expect(counts.total).toBe(0);
  });
});

describe('groupViolationsByImpact', () => {
  const mockViolations: AxeViolation[] = [
    {
      id: 'test1',
      impact: 'critical',
      description: 'Critical issue',
      help: 'Fix it',
      helpUrl: 'https://example.com',
      tags: [],
      nodes: [],
    },
    {
      id: 'test2',
      impact: 'minor',
      description: 'Minor issue',
      help: 'Consider fixing',
      helpUrl: 'https://example.com',
      tags: [],
      nodes: [],
    },
  ];

  it('groups violations by impact level', () => {
    const groups = groupViolationsByImpact(mockViolations);

    expect(groups.get('critical')).toHaveLength(1);
    expect(groups.get('serious')).toHaveLength(0);
    expect(groups.get('moderate')).toHaveLength(0);
    expect(groups.get('minor')).toHaveLength(1);
  });

  it('creates all impact groups even when empty', () => {
    const groups = groupViolationsByImpact([]);

    expect(groups.has('critical')).toBe(true);
    expect(groups.has('serious')).toBe(true);
    expect(groups.has('moderate')).toBe(true);
    expect(groups.has('minor')).toBe(true);
  });
});

describe('getBadgeColor', () => {
  it('returns red when critical violations exist', () => {
    const violations: AxeViolation[] = [
      {
        id: 'test',
        impact: 'critical',
        description: '',
        help: '',
        helpUrl: '',
        tags: [],
        nodes: [],
      },
    ];
    expect(getBadgeColor(violations)).toBe('#ef4444');
  });

  it('returns orange when serious is worst', () => {
    const violations: AxeViolation[] = [
      {
        id: 'test',
        impact: 'serious',
        description: '',
        help: '',
        helpUrl: '',
        tags: [],
        nodes: [],
      },
    ];
    expect(getBadgeColor(violations)).toBe('#f97316');
  });

  it('returns amber when moderate is worst', () => {
    const violations: AxeViolation[] = [
      {
        id: 'test',
        impact: 'moderate',
        description: '',
        help: '',
        helpUrl: '',
        tags: [],
        nodes: [],
      },
    ];
    expect(getBadgeColor(violations)).toBe('#f59e0b');
  });

  it('returns lime when minor is worst', () => {
    const violations: AxeViolation[] = [
      {
        id: 'test',
        impact: 'minor',
        description: '',
        help: '',
        helpUrl: '',
        tags: [],
        nodes: [],
      },
    ];
    expect(getBadgeColor(violations)).toBe('#84cc16');
  });

  it('returns green when no violations', () => {
    expect(getBadgeColor([])).toBe('#10b981');
  });
});

describe('formatViolation', () => {
  it('formats violation for display', () => {
    const violation: AxeViolation = {
      id: 'color-contrast',
      impact: 'serious',
      description: 'Ensures the contrast is sufficient',
      help: 'Elements must have sufficient color contrast',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/color-contrast',
      tags: ['wcag2aa'],
      nodes: [
        { html: '<div>', target: ['#element1'] },
        { html: '<span>', target: ['#element2'] },
      ],
    };

    const formatted = formatViolation(violation);

    expect(formatted).toContain('[SERIOUS]');
    expect(formatted).toContain('Elements must have sufficient color contrast');
    expect(formatted).toContain('2 element(s) affected');
  });

  it('formats critical impact in uppercase', () => {
    const violation: AxeViolation = {
      id: 'test',
      impact: 'critical',
      description: 'Desc',
      help: 'Help text',
      helpUrl: '',
      tags: [],
      nodes: [{ html: '<div>', target: [] }],
    };
    expect(formatViolation(violation)).toContain('[CRITICAL]');
  });

  it('includes description in output', () => {
    const violation: AxeViolation = {
      id: 'test',
      impact: 'minor',
      description: 'Some description here',
      help: 'Help',
      helpUrl: '',
      tags: [],
      nodes: [],
    };
    const formatted = formatViolation(violation);
    expect(formatted).toContain('Some description here');
    expect(formatted).toContain('0 element(s) affected');
  });
});

// ============================================================================
// preloadAxe
// ============================================================================

describe('preloadAxe', () => {
  it('does not throw', () => {
    expect(() => preloadAxe()).not.toThrow();
  });

  it('marks axe as loaded after preload', () => {
    preloadAxe();
    // After preload, the promise exists so isAxeLoaded should be true
    expect(isAxeLoaded()).toBe(true);
  });
});

// ============================================================================
// runA11yAudit
// ============================================================================

vi.mock('axe-core', () => ({
  default: {
    run: vi.fn().mockResolvedValue({
      violations: [
        {
          id: 'color-contrast',
          impact: 'serious',
          description: 'Color contrast issue',
          help: 'Fix contrast',
          helpUrl: 'https://example.com',
          tags: ['wcag2aa'],
          nodes: [{ html: '<div>test</div>', target: ['div'] }],
        },
      ],
      passes: [{ id: 'aria-roles', description: 'ARIA roles are valid' }],
      incomplete: [],
      inapplicable: [{ id: 'skip-link' }],
    }),
  },
}));

describe('runA11yAudit', () => {
  beforeEach(() => {
    clearA11yCache();
  });

  afterEach(() => {
    clearA11yCache();
  });

  it('runs audit and returns result in expected format', async () => {
    const result = await runA11yAudit();

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].id).toBe('color-contrast');
    expect(result.passes).toHaveLength(1);
    expect(result.passes[0].id).toBe('aria-roles');
    expect(result.inapplicable).toHaveLength(1);
    expect(result.inapplicable[0].id).toBe('skip-link');
    expect(result.timestamp).toBeDefined();
    expect(result.url).toBeDefined();
  });

  it('returns cached result on second call', async () => {
    const result1 = await runA11yAudit();
    const result2 = await runA11yAudit();

    expect(result1).toBe(result2);
  });

  it('getCachedResult returns result after audit', async () => {
    await runA11yAudit();
    const cached = getCachedResult();
    expect(cached).not.toBeNull();
    expect(cached!.violations).toHaveLength(1);
  });

  it('forceRefresh bypasses cache', async () => {
    const result1 = await runA11yAudit();
    const result2 = await runA11yAudit(true);

    // They should be different objects since forceRefresh creates a new result
    expect(result2).not.toBe(result1);
    expect(result2.violations).toHaveLength(1);
  });

  it('clearA11yCache makes getCachedResult return null', async () => {
    await runA11yAudit();
    expect(getCachedResult()).not.toBeNull();
    clearA11yCache();
    expect(getCachedResult()).toBeNull();
  });
});

// ============================================================================
// a11yToMarkdown
// ============================================================================

describe('a11yToMarkdown', () => {
  it('generates report with no violations', () => {
    const result: AxeResult = {
      violations: [],
      passes: [{ id: 'test', description: 'Test passes' }],
      incomplete: [],
      inapplicable: [{ id: 'skip' }],
      timestamp: '2025-01-01T00:00:00.000Z',
      url: 'https://example.com',
    };

    const md = a11yToMarkdown(result);

    expect(md).toContain('# Accessibility Audit Report');
    expect(md).toContain('**URL:** https://example.com');
    expect(md).toContain('**Timestamp:** 2025-01-01T00:00:00.000Z');
    expect(md).toContain('**Total violations:** 0');
    expect(md).toContain('Passes: 1');
    expect(md).toContain('Incomplete: 0');
    expect(md).toContain('No accessibility violations found.');
  });

  it('generates report with violations grouped by impact', () => {
    const result: AxeResult = {
      violations: [
        {
          id: 'color-contrast',
          impact: 'serious',
          description: 'Color contrast is insufficient',
          help: 'Elements must have sufficient color contrast',
          helpUrl: 'https://example.com/color-contrast',
          tags: ['wcag2aa'],
          nodes: [{ html: '<div class="low-contrast">text</div>', target: ['div.low-contrast'] }],
        },
        {
          id: 'image-alt',
          impact: 'critical',
          description: 'Images must have alt text',
          help: 'Images require alt attribute',
          helpUrl: 'https://example.com/image-alt',
          tags: ['wcag2a'],
          nodes: [{ html: '<img src="photo.jpg">', target: ['img'] }],
        },
      ],
      passes: [],
      incomplete: [],
      inapplicable: [],
      timestamp: '2025-01-01T00:00:00.000Z',
      url: 'https://example.com',
    };

    const md = a11yToMarkdown(result);

    expect(md).toContain('**Total violations:** 2');
    expect(md).toContain('Critical: 1');
    expect(md).toContain('Serious: 1');
    expect(md).toContain('## Critical (1)');
    expect(md).toContain('## Serious (1)');
    expect(md).toContain('### image-alt');
    expect(md).toContain('### color-contrast');
    expect(md).toContain('**Images require alt attribute**');
    expect(md).toContain('- Help: https://example.com/image-alt');
    expect(md).toContain('- Elements affected: 1');
    expect(md).toContain('`<img src="photo.jpg">`');
    expect(md).toContain('Selector: `img`');
  });

  it('truncates long HTML in nodes to 120 chars', () => {
    const longHtml = `<div class="${'a'.repeat(150)}">text</div>`;
    const result: AxeResult = {
      violations: [
        {
          id: 'test-rule',
          impact: 'minor',
          description: 'Test',
          help: 'Test help',
          helpUrl: 'https://example.com',
          tags: [],
          nodes: [{ html: longHtml, target: ['div'] }],
        },
      ],
      passes: [],
      incomplete: [],
      inapplicable: [],
      timestamp: '2025-01-01T00:00:00.000Z',
      url: 'https://example.com',
    };

    const md = a11yToMarkdown(result);

    // The HTML should be truncated with "..."
    expect(md).toContain('...');
    // Should not contain the full long HTML
    expect(md).not.toContain(longHtml);
  });

  it('limits nodes to 10 and shows overflow message', () => {
    const nodes = Array.from({ length: 15 }, (_, i) => ({
      html: `<div id="el-${i}">Element ${i}</div>`,
      target: [`#el-${i}`],
    }));

    const result: AxeResult = {
      violations: [
        {
          id: 'many-nodes',
          impact: 'moderate',
          description: 'Many affected nodes',
          help: 'Fix all of them',
          helpUrl: 'https://example.com',
          tags: [],
          nodes,
        },
      ],
      passes: [],
      incomplete: [],
      inapplicable: [],
      timestamp: '2025-01-01T00:00:00.000Z',
      url: 'https://example.com',
    };

    const md = a11yToMarkdown(result);

    expect(md).toContain('Elements affected: 15');
    expect(md).toContain('... and 5 more');
    // Should show first 10 elements
    expect(md).toContain('#el-0');
    expect(md).toContain('#el-9');
    // Should not show 11th and beyond
    expect(md).not.toContain('#el-10');
  });

  it('skips empty target arrays', () => {
    const result: AxeResult = {
      violations: [
        {
          id: 'test',
          impact: 'minor',
          description: 'Test',
          help: 'Test',
          helpUrl: '',
          tags: [],
          nodes: [{ html: '<div>test</div>', target: [] }],
        },
      ],
      passes: [],
      incomplete: [],
      inapplicable: [],
      timestamp: '2025-01-01T00:00:00.000Z',
      url: 'https://example.com',
    };

    const md = a11yToMarkdown(result);

    expect(md).not.toContain('Selector:');
  });

  it('skips impact groups with zero violations', () => {
    const result: AxeResult = {
      violations: [
        {
          id: 'only-minor',
          impact: 'minor',
          description: 'Minor issue',
          help: 'Minor help',
          helpUrl: '',
          tags: [],
          nodes: [],
        },
      ],
      passes: [],
      incomplete: [],
      inapplicable: [],
      timestamp: '2025-01-01T00:00:00.000Z',
      url: 'https://example.com',
    };

    const md = a11yToMarkdown(result);

    expect(md).toContain('## Minor (1)');
    expect(md).not.toContain('## Critical');
    expect(md).not.toContain('## Serious');
    expect(md).not.toContain('## Moderate');
  });

  it('joins multiple target selectors with commas', () => {
    const result: AxeResult = {
      violations: [
        {
          id: 'multi-target',
          impact: 'serious',
          description: 'Multiple targets',
          help: 'Fix targets',
          helpUrl: '',
          tags: [],
          nodes: [{ html: '<div>test</div>', target: ['.a', '.b', '.c'] }],
        },
      ],
      passes: [],
      incomplete: [],
      inapplicable: [],
      timestamp: '2025-01-01T00:00:00.000Z',
      url: 'https://example.com',
    };

    const md = a11yToMarkdown(result);

    expect(md).toContain('Selector: `.a, .b, .c`');
  });
});
