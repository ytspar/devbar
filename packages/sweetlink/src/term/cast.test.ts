import { describe, expect, test } from 'vitest';
import { escapeJsonForScript } from './cast.js';

describe('escapeJsonForScript', () => {
  test('escapes </script> so attacker-controlled bytes cannot break out of the script tag', () => {
    const json = JSON.stringify({ msg: '</script><img src=x onerror=alert(1)>' });
    const safe = escapeJsonForScript(json);
    expect(safe.includes('</script>')).toBe(false);
    expect(safe.includes('\\u003c/script\\u003e')).toBe(true);
  });

  test('escapes HTML comment opener `<!--` indirectly via `<`', () => {
    const json = JSON.stringify({ msg: '<!-- hide -->' });
    const safe = escapeJsonForScript(json);
    expect(safe.includes('<!--')).toBe(false);
    expect(safe.includes('\\u003c')).toBe(true);
  });

  test('escapes U+2028 line separator (some browsers terminate JS strings on it)', () => {
    const ls = String.fromCharCode(0x2028);
    const json = JSON.stringify({ msg: `before${ls}after` });
    const safe = escapeJsonForScript(json);
    expect(safe.includes(ls)).toBe(false);
    expect(safe.includes('\\u2028')).toBe(true);
  });

  test('escapes U+2029 paragraph separator', () => {
    const ps = String.fromCharCode(0x2029);
    const json = JSON.stringify({ msg: `before${ps}after` });
    const safe = escapeJsonForScript(json);
    expect(safe.includes(ps)).toBe(false);
    expect(safe.includes('\\u2029')).toBe(true);
  });

  test('escaped JSON is still valid JSON when parsed', () => {
    const original = { msg: '</script>' + String.fromCharCode(0x2028) + 'hi' };
    const safe = escapeJsonForScript(JSON.stringify(original));
    const parsed = JSON.parse(safe);
    expect(parsed).toEqual(original);
  });
});
