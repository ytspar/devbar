// @vitest-environment node

/**
 * Snapshot Diff Tests
 *
 * Tests diffSnapshots which produces unified text diffs of accessibility snapshots.
 * computeLCS is tested indirectly through diffSnapshots.
 */

import { describe, expect, it } from 'vitest';
import { diffSnapshots } from './diff.js';
import type { RefMap } from './refs.js';

function makeRefMap(rawSnapshot: string): RefMap {
  return {
    entries: [],
    byRef: new Map(),
    rawSnapshot,
    timestamp: Date.now(),
  };
}

describe('diffSnapshots', () => {
  it('returns "(no changes detected)" for identical snapshots', () => {
    const snapshot = '- button "Submit"\n- link "Home"';
    const result = diffSnapshots(makeRefMap(snapshot), makeRefMap(snapshot));
    expect(result).toBe('(no changes detected)');
  });

  it('shows added lines with + prefix', () => {
    const baseline = makeRefMap('- button "Submit"');
    const current = makeRefMap('- button "Submit"\n- link "New Link"');

    const result = diffSnapshots(baseline, current);
    expect(result).toContain('+ - link "New Link"');
    expect(result).toContain('  - button "Submit"');
  });

  it('shows removed lines with - prefix', () => {
    const baseline = makeRefMap('- button "Submit"\n- link "Old Link"');
    const current = makeRefMap('- button "Submit"');

    const result = diffSnapshots(baseline, current);
    expect(result).toContain('- - link "Old Link"');
    expect(result).toContain('  - button "Submit"');
  });

  it('shows both additions and removals', () => {
    const baseline = makeRefMap('- button "A"\n- button "B"\n- button "C"');
    const current = makeRefMap('- button "A"\n- button "X"\n- button "C"');

    const result = diffSnapshots(baseline, current);
    expect(result).toContain('  - button "A"');
    expect(result).toContain('- - button "B"');
    expect(result).toContain('+ - button "X"');
    expect(result).toContain('  - button "C"');
  });

  it('handles completely different snapshots', () => {
    const baseline = makeRefMap('- button "Old"');
    const current = makeRefMap('- link "New"');

    const result = diffSnapshots(baseline, current);
    expect(result).toContain('- - button "Old"');
    expect(result).toContain('+ - link "New"');
  });

  it('handles empty baseline', () => {
    const baseline = makeRefMap('');
    const current = makeRefMap('- button "New"');

    const result = diffSnapshots(baseline, current);
    expect(result).toContain('+ - button "New"');
  });

  it('handles empty current', () => {
    const baseline = makeRefMap('- button "Old"');
    const current = makeRefMap('');

    const result = diffSnapshots(baseline, current);
    expect(result).toContain('- - button "Old"');
  });

  it('handles both empty', () => {
    const result = diffSnapshots(makeRefMap(''), makeRefMap(''));
    expect(result).toBe('(no changes detected)');
  });

  it('handles multiline diff with reordering', () => {
    const baseline = makeRefMap('A\nB\nC\nD');
    const current = makeRefMap('A\nC\nB\nD');

    const result = diffSnapshots(baseline, current);
    // B is removed before C, then added after C
    expect(result).toContain('- B');
    expect(result).toContain('+ B');
    expect(result).toContain('  A');
    expect(result).toContain('  D');
  });

  it('preserves unchanged lines with space prefix', () => {
    const baseline = makeRefMap('line1\nline2\nline3');
    const current = makeRefMap('line1\nline2\nline3');

    const result = diffSnapshots(baseline, current);
    expect(result).toBe('(no changes detected)');
  });

  it('handles single line change', () => {
    const baseline = makeRefMap('only line');
    const current = makeRefMap('different line');

    const result = diffSnapshots(baseline, current);
    expect(result).toContain('- only line');
    expect(result).toContain('+ different line');
  });
});
