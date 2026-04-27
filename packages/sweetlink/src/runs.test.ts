import * as path from 'node:path';
import { describe, expect, test } from 'vitest';
import { runSlot, slugifyNamespace } from './runs.js';

describe('slugifyNamespace', () => {
  test('passes through alphanumeric, dash, underscore', () => {
    expect(slugifyNamespace('app_one-2')).toBe('app_one-2');
  });

  test('slashes and dots become dashes — blocks traversal', () => {
    expect(slugifyNamespace('../../../etc/passwd')).toBe('etc-passwd');
  });

  test('absolute path-like input is reduced to safe segments without separators or dots', () => {
    const result = slugifyNamespace('/Users/victim/.ssh');
    expect(result.includes('/')).toBe(false);
    expect(result.includes('..')).toBe(false);
    expect(result.startsWith('-')).toBe(false);
    expect(result.endsWith('-')).toBe(false);
  });

  test('throws on inputs that yield empty after slugify', () => {
    expect(() => slugifyNamespace('....')).toThrow();
    expect(() => slugifyNamespace('///')).toThrow();
    expect(() => slugifyNamespace('')).toThrow();
  });

  test('caps overly long namespaces', () => {
    const long = 'a'.repeat(200);
    expect(slugifyNamespace(long).length).toBeLessThanOrEqual(64);
  });
});

describe('runSlot', () => {
  test('without app returns base / kind subdir', () => {
    const out = runSlot({ baseDir: '/tmp/proj', kind: 'term' });
    expect(out).toBe(path.join('/tmp/proj/.sweetlink', 'term'));
  });

  test('with app builds <base>/<app>/<ymd>/<run>/<kind>', () => {
    const out = runSlot({
      baseDir: '/tmp/proj',
      app: 'myapp',
      run: '0900-00',
      kind: 'sim',
    });
    expect(out).toMatch(/\/tmp\/proj\/.sweetlink\/myapp\/\d{8}\/0900-00\/sim$/);
  });

  test('rejects path-traversal in --app', () => {
    expect(() =>
      runSlot({ baseDir: '/tmp/proj', app: '../../../tmp/x', run: '0900-00', kind: 'term' })
    ).not.toThrow(); // it slugifies, doesn't throw
    const safe = runSlot({
      baseDir: '/tmp/proj',
      app: '../../../tmp/x',
      run: '0900-00',
      kind: 'term',
    });
    // The slugified path stays inside .sweetlink — never escapes baseDir.
    expect(safe.startsWith(path.join('/tmp/proj/.sweetlink'))).toBe(true);
    expect(safe.includes('..')).toBe(false);
  });

  test('rejects path-traversal in --run', () => {
    const safe = runSlot({
      baseDir: '/tmp/proj',
      app: 'myapp',
      run: '../../../etc/cron.d',
      kind: 'term',
    });
    expect(safe.startsWith(path.join('/tmp/proj/.sweetlink'))).toBe(true);
    expect(safe.includes('..')).toBe(false);
  });
});
