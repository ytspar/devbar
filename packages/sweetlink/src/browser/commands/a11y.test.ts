import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SweetlinkResponse } from '../../types.js';

// biome-ignore lint/suspicious/noExplicitAny: test helper - SweetlinkResponse.data is unknown
const d = (r: SweetlinkResponse): any => r.data;

/**
 * Build a minimal mock axe-core module.
 * `run` returns a configurable AxeResults-like object.
 */
function createMockAxeModule(overrides: {
  violations?: unknown[];
  passes?: unknown[];
  incomplete?: unknown[];
  inapplicable?: unknown[];
} = {}) {
  const result = {
    violations: overrides.violations ?? [],
    passes: overrides.passes ?? [],
    incomplete: overrides.incomplete ?? [],
    inapplicable: overrides.inapplicable ?? [],
  };
  return {
    run: vi.fn().mockResolvedValue(result),
  };
}

describe('handleGetA11y', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns error when axe-core import fails', async () => {
    vi.doMock('axe-core', () => {
      throw new Error('Cannot find module axe-core');
    });

    const { handleGetA11y: handler } = await import('./a11y.js');
    const response = await handler({ type: 'get-a11y' });

    expect(response.success).toBe(false);
    expect(response.error).toContain('axe-core is not available');
    expect(response.timestamp).toBeGreaterThan(0);
  });

  it('returns correct structure on successful audit with no violations', async () => {
    const mockAxe = createMockAxeModule({
      passes: [{ id: 'color-contrast', description: 'Elements must have sufficient color contrast' }],
      inapplicable: [{ id: 'aria-allowed-attr' }],
    });

    vi.doMock('axe-core', () => ({ default: mockAxe }));

    const { handleGetA11y: handler } = await import('./a11y.js');
    const response = await handler({ type: 'get-a11y' });

    expect(response.success).toBe(true);
    expect(response.timestamp).toBeGreaterThan(0);

    // Top-level data fields
    expect(d(response)).toHaveProperty('result');
    expect(d(response)).toHaveProperty('summary');
    expect(d(response)).toHaveProperty('url');
    expect(d(response)).toHaveProperty('title');
    expect(d(response)).toHaveProperty('timestamp');

    // Result fields
    const result = d(response).result;
    expect(result.violations).toEqual([]);
    expect(result.passes).toEqual([{ id: 'color-contrast', description: 'Elements must have sufficient color contrast' }]);
    expect(result.incomplete).toEqual([]);
    expect(result.inapplicable).toEqual([{ id: 'aria-allowed-attr' }]);
    expect(result.timestamp).toBeDefined();
    expect(result.url).toBe(window.location.href);
  });

  it('computes summary counts correctly', async () => {
    const mockAxe = createMockAxeModule({
      violations: [
        { id: 'v1', impact: 'critical', description: 'Critical issue', nodes: [] },
        { id: 'v2', impact: 'serious', description: 'Serious issue', nodes: [] },
        { id: 'v3', impact: 'moderate', description: 'Moderate issue', nodes: [] },
        { id: 'v4', impact: 'critical', description: 'Another critical', nodes: [] },
      ],
      passes: [
        { id: 'p1', description: 'Pass 1' },
        { id: 'p2', description: 'Pass 2' },
      ],
      incomplete: [
        { id: 'i1', impact: 'minor', description: 'Incomplete', nodes: [] },
      ],
    });

    vi.doMock('axe-core', () => ({ default: mockAxe }));

    const { handleGetA11y: handler } = await import('./a11y.js');
    const response = await handler({ type: 'get-a11y' });

    expect(response.success).toBe(true);

    const summary = d(response).summary;
    expect(summary.totalViolations).toBe(4);
    expect(summary.totalPasses).toBe(2);
    expect(summary.totalIncomplete).toBe(1);
    expect(summary.byImpact.critical).toBe(2);
    expect(summary.byImpact.serious).toBe(1);
    expect(summary.byImpact.moderate).toBe(1);
    expect(summary.byImpact.minor).toBe(0);
  });

  it('groups violations by impact correctly', async () => {
    const mockAxe = createMockAxeModule({
      violations: [
        { id: 'v1', impact: 'minor', description: 'Minor 1', nodes: [] },
        { id: 'v2', impact: 'minor', description: 'Minor 2', nodes: [] },
        { id: 'v3', impact: 'serious', description: 'Serious 1', nodes: [] },
      ],
    });

    vi.doMock('axe-core', () => ({ default: mockAxe }));

    const { handleGetA11y: handler } = await import('./a11y.js');
    const response = await handler({ type: 'get-a11y' });

    const byImpact = d(response).summary.byImpact;
    expect(byImpact.minor).toBe(2);
    expect(byImpact.serious).toBe(1);
    expect(byImpact.critical).toBe(0);
    expect(byImpact.moderate).toBe(0);
  });

  it('calls axe.run with correct exclude selector and runOnly config', async () => {
    const mockAxe = createMockAxeModule();

    vi.doMock('axe-core', () => ({ default: mockAxe }));

    const { handleGetA11y: handler } = await import('./a11y.js');
    await handler({ type: 'get-a11y' });

    expect(mockAxe.run).toHaveBeenCalledTimes(1);
    const [context, options] = mockAxe.run.mock.calls[0];
    expect(context).toEqual({ exclude: ['[data-devbar]'] });
    expect(options.runOnly.type).toBe('tag');
    expect(options.runOnly.values).toEqual(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']);
  });

  it('handles CJS-style module where default is the module itself', async () => {
    // In CJS interop, `module.default` might be the module object itself.
    // The code handles this via: `(axeModule as { default?: ... }).default ?? axeModule`
    // Vitest requires a `default` export for dynamic imports, so we test the
    // equivalent scenario where `default` points to an object with `run`.
    const mockAxe = createMockAxeModule();

    vi.doMock('axe-core', () => ({ default: mockAxe }));

    const { handleGetA11y: handler } = await import('./a11y.js');
    const response = await handler({ type: 'get-a11y' });

    expect(response.success).toBe(true);
    expect(mockAxe.run).toHaveBeenCalled();
  });

  it('returns error response when axe.run throws', async () => {
    const mockAxe = {
      run: vi.fn().mockRejectedValue(new Error('axe.run failed')),
    };

    vi.doMock('axe-core', () => ({ default: mockAxe }));

    const { handleGetA11y: handler } = await import('./a11y.js');
    const response = await handler({ type: 'get-a11y' });

    expect(response.success).toBe(false);
    expect(response.error).toBe('axe.run failed');
    expect(response.timestamp).toBeGreaterThan(0);
  });

  it('returns generic error message for non-Error throws', async () => {
    const mockAxe = {
      run: vi.fn().mockRejectedValue('string error'),
    };

    vi.doMock('axe-core', () => ({ default: mockAxe }));

    const { handleGetA11y: handler } = await import('./a11y.js');
    const response = await handler({ type: 'get-a11y' });

    expect(response.success).toBe(false);
    expect(response.error).toBe('Accessibility audit failed');
  });

  it('includes url and title from the document', async () => {
    const mockAxe = createMockAxeModule();

    vi.doMock('axe-core', () => ({ default: mockAxe }));

    const { handleGetA11y: handler } = await import('./a11y.js');
    const response = await handler({ type: 'get-a11y' });

    expect(d(response).url).toBe(window.location.href);
    expect(d(response).title).toBe(document.title);
  });

  it('maps inapplicable items to {id} only', async () => {
    const mockAxe = createMockAxeModule({
      inapplicable: [
        { id: 'rule-a', description: 'should be stripped', tags: ['wcag2a'] },
        { id: 'rule-b', description: 'also stripped', tags: ['wcag2aa'] },
      ],
    });

    vi.doMock('axe-core', () => ({ default: mockAxe }));

    const { handleGetA11y: handler } = await import('./a11y.js');
    const response = await handler({ type: 'get-a11y' });

    const inapplicable = d(response).result.inapplicable;
    expect(inapplicable).toEqual([{ id: 'rule-a' }, { id: 'rule-b' }]);
  });

  it('maps passes to {id, description} only', async () => {
    const mockAxe = createMockAxeModule({
      passes: [
        { id: 'pass-1', description: 'Desc 1', tags: ['wcag2a'], nodes: [{}] },
        { id: 'pass-2', description: 'Desc 2', tags: ['best-practice'], nodes: [] },
      ],
    });

    vi.doMock('axe-core', () => ({ default: mockAxe }));

    const { handleGetA11y: handler } = await import('./a11y.js');
    const response = await handler({ type: 'get-a11y' });

    const passes = d(response).result.passes;
    expect(passes).toEqual([
      { id: 'pass-1', description: 'Desc 1' },
      { id: 'pass-2', description: 'Desc 2' },
    ]);
  });
});
