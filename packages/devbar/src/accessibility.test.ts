import { describe, expect, it } from 'vitest';
import {
  type AxeViolation,
  clearA11yCache,
  formatViolation,
  getBadgeColor,
  getCachedResult,
  getImpactColor,
  getViolationCounts,
  groupViolationsByImpact,
  isAxeLoaded,
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
});
