// @vitest-environment node

/**
 * Ref System Tests
 *
 * Tests parseAriaSnapshot parsing and formatRefMap output formatting.
 */

import { describe, expect, it } from 'vitest';
import type { RefMap } from './refs.js';
import { formatRefMap, parseAriaSnapshot } from './refs.js';

describe('parseAriaSnapshot', () => {
  it('parses a simple button line', () => {
    const result = parseAriaSnapshot('  - button "Click me"');
    expect(result).toEqual([{ ref: '@e1', role: 'button', name: 'Click me', attrs: {} }]);
  });

  it('parses multiple elements with sequential refs', () => {
    const snapshot = [
      '  - heading "Dashboard" [level=1]',
      '  - button "Submit"',
      '  - link "Settings"',
    ].join('\n');

    const result = parseAriaSnapshot(snapshot);
    expect(result).toHaveLength(3);
    expect(result[0]!.ref).toBe('@e1');
    expect(result[1]!.ref).toBe('@e2');
    expect(result[2]!.ref).toBe('@e3');
  });

  it('parses attributes with key=value', () => {
    const result = parseAriaSnapshot('  - heading "Dashboard" [level=1]');
    expect(result[0]!.attrs).toEqual({ level: '1' });
  });

  it('parses boolean attributes (no value)', () => {
    const result = parseAriaSnapshot('  - textbox "Email" [disabled]');
    expect(result[0]!.attrs).toEqual({ disabled: 'true' });
  });

  it('parses multiple attributes', () => {
    const result = parseAriaSnapshot('  - checkbox "Remember me" [checked=true, disabled]');
    expect(result[0]!.attrs).toEqual({ checked: 'true', disabled: 'true' });
  });

  it('skips non-matching lines', () => {
    const snapshot = [
      '  - button "OK"',
      '    some random text',
      '  - /url: /settings',
      '  - link "Home"',
    ].join('\n');

    const result = parseAriaSnapshot(snapshot);
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe('OK');
    expect(result[1]!.name).toBe('Home');
  });

  it('skips elements with empty names', () => {
    const snapshot = ['  - button ""', '  - button "Submit"', '  - link "   "'].join('\n');

    const result = parseAriaSnapshot(snapshot);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Submit');
  });

  it('returns empty array for empty string', () => {
    expect(parseAriaSnapshot('')).toEqual([]);
  });

  it('returns empty array for input with no matching lines', () => {
    expect(parseAriaSnapshot('no roles here\njust text')).toEqual([]);
  });

  describe('interactive filter', () => {
    it('filters to only interactive roles when interactive option is set', () => {
      const snapshot = [
        '  - heading "Title" [level=1]',
        '  - paragraph "Some text"',
        '  - button "Submit"',
        '  - textbox "Search"',
        '  - img "Logo"',
        '  - link "Home"',
      ].join('\n');

      const result = parseAriaSnapshot(snapshot, { interactive: true });
      expect(result).toHaveLength(3);
      expect(result.map((e) => e.role)).toEqual(['button', 'textbox', 'link']);
    });

    it('returns all roles when interactive is false', () => {
      const snapshot = ['  - heading "Title" [level=1]', '  - button "Submit"'].join('\n');

      const result = parseAriaSnapshot(snapshot, { interactive: false });
      expect(result).toHaveLength(2);
    });

    it('returns all roles when options is undefined', () => {
      const snapshot = '  - heading "Title" [level=1]';
      const result = parseAriaSnapshot(snapshot);
      expect(result).toHaveLength(1);
    });

    it('includes all interactive role types', () => {
      const interactiveRoles = [
        'button',
        'link',
        'textbox',
        'checkbox',
        'radio',
        'combobox',
        'listbox',
        'menuitem',
        'menuitemcheckbox',
        'menuitemradio',
        'option',
        'searchbox',
        'slider',
        'spinbutton',
        'switch',
        'tab',
        'treeitem',
      ];

      for (const role of interactiveRoles) {
        const result = parseAriaSnapshot(`  - ${role} "test"`, { interactive: true });
        expect(result).toHaveLength(1);
        expect(result[0]!.role).toBe(role);
      }
    });
  });

  it('handles varying indentation', () => {
    const snapshot = ['- button "A"', '  - button "B"', '      - button "C"'].join('\n');

    const result = parseAriaSnapshot(snapshot);
    expect(result).toHaveLength(3);
  });
});

describe('formatRefMap', () => {
  function makeRefMap(
    entries: Array<{ ref: string; role: string; name: string; attrs: Record<string, string> }>
  ): RefMap {
    const byRef = new Map(entries.map((e) => [e.ref, e]));
    return { entries, byRef, rawSnapshot: '', timestamp: Date.now() };
  }

  it('returns "(no elements found)" for empty entries', () => {
    const refMap = makeRefMap([]);
    expect(formatRefMap(refMap)).toBe('(no elements found)');
  });

  it('formats entries with role and name', () => {
    const refMap = makeRefMap([{ ref: '@e1', role: 'button', name: 'Submit', attrs: {} }]);
    expect(formatRefMap(refMap)).toBe('  @e1 [button] "Submit"');
  });

  it('formats entries with attributes', () => {
    const refMap = makeRefMap([
      { ref: '@e1', role: 'heading', name: 'Title', attrs: { level: '1' } },
    ]);
    expect(formatRefMap(refMap)).toBe('  @e1 [heading] "Title" [level=1]');
  });

  it('formats boolean attributes without =value', () => {
    const refMap = makeRefMap([
      { ref: '@e1', role: 'checkbox', name: 'Agree', attrs: { disabled: 'true', checked: 'true' } },
    ]);
    expect(formatRefMap(refMap)).toBe('  @e1 [checkbox] "Agree" [disabled, checked]');
  });

  it('formats mixed boolean and key=value attributes', () => {
    const refMap = makeRefMap([
      { ref: '@e1', role: 'heading', name: 'Title', attrs: { level: '2', hidden: 'true' } },
    ]);
    expect(formatRefMap(refMap)).toBe('  @e1 [heading] "Title" [level=2, hidden]');
  });

  it('formats multiple entries separated by newlines', () => {
    const refMap = makeRefMap([
      { ref: '@e1', role: 'button', name: 'OK', attrs: {} },
      { ref: '@e2', role: 'link', name: 'Home', attrs: {} },
    ]);
    const output = formatRefMap(refMap);
    const lines = output.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('@e1');
    expect(lines[1]).toContain('@e2');
  });
});
