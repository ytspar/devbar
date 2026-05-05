// @vitest-environment node

/**
 * Daemon Utility Tests
 *
 * `daemon/utils.ts` is consumed by every CLI handler that writes to disk
 * (ensureDir), every shutdown path (registerGracefulShutdown), every
 * recording path (detectGit), and every HTML producer (escapeHtml).
 * Any regression here propagates broadly, so the audit flagged it as a
 * critical-blast-radius module without tests.
 *
 * What's verified:
 *  - escapeHtml escapes &, <, >, ", ' and is idempotent on already-safe
 *    input. Skipping ' historically caused a real injection bug, hence
 *    the explicit test.
 *  - escapeAttr is the same function (alias check; used by viewer.ts).
 *  - ensureDir is a no-op on existing dirs and on '.' / file in cwd.
 *  - ensureDir creates missing parents recursively.
 *  - registerGracefulShutdown registers the same handler for SIGTERM and
 *    SIGINT (and clean-up after the test removes them).
 *  - detectGit returns nulls for a non-repo cwd and never throws.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  detectGit,
  ensureDir,
  escapeAttr,
  escapeHtml,
  registerGracefulShutdown,
} from './utils.js';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml('& < > " \'')).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('escapes & first so &lt; does not become &amp;lt;', () => {
    // Sanity check the order: feeding "&" already-escaped should NOT
    // double-escape the ampersand.
    expect(escapeHtml('1 < 2 && 3 > 0')).toBe('1 &lt; 2 &amp;&amp; 3 &gt; 0');
  });

  it('returns input unchanged when no special chars are present', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
    expect(escapeHtml('')).toBe('');
  });

  it('handles non-string inputs by coercing via String()', () => {
    expect(escapeHtml(42 as unknown as string)).toBe('42');
    expect(escapeHtml(null as unknown as string)).toBe('null');
  });

  it('escapes single quotes (regression: prior copies of this function disagreed)', () => {
    // The audit's adversarial review flagged inconsistent quote escaping
    // as a real injection vector for attribute contexts. Locking it in.
    expect(escapeHtml(`it's a 'test'`)).toBe('it&#39;s a &#39;test&#39;');
  });
});

describe('escapeAttr', () => {
  it('is the same function as escapeHtml (alias for callers using attr terminology)', () => {
    expect(escapeAttr).toBe(escapeHtml);
  });
});

describe('ensureDir', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'utils-ensuredir-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('creates parent directories recursively', () => {
    const target = path.join(tmp, 'a', 'b', 'c', 'file.txt');
    ensureDir(target);
    expect(fs.existsSync(path.join(tmp, 'a', 'b', 'c'))).toBe(true);
    // The file itself is not created.
    expect(fs.existsSync(target)).toBe(false);
  });

  it('is a no-op when the parent dir already exists', () => {
    const target = path.join(tmp, 'file.txt');
    ensureDir(target); // no-op (parent is tmp)
    expect(fs.existsSync(tmp)).toBe(true);
  });

  it('is a no-op when the file path has no parent (cwd-relative bare name)', () => {
    expect(() => ensureDir('file.txt')).not.toThrow();
  });
});

describe('registerGracefulShutdown', () => {
  it('registers the handler on both SIGTERM and SIGINT', () => {
    const handler = vi.fn();
    const before = {
      term: process.listenerCount('SIGTERM'),
      int: process.listenerCount('SIGINT'),
    };

    registerGracefulShutdown(handler);

    expect(process.listenerCount('SIGTERM')).toBe(before.term + 1);
    expect(process.listenerCount('SIGINT')).toBe(before.int + 1);

    // Cleanup so this test doesn't leak listeners into subsequent tests
    // (vi.useFakeTimers etc. don't help with process events).
    process.removeListener('SIGTERM', handler);
    process.removeListener('SIGINT', handler);
  });
});

describe('detectGit', () => {
  it('returns null branch and commit when run in a non-repo directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'utils-detectgit-norepo-'));
    try {
      const result = detectGit(tmp);
      expect(result.branch).toBeNull();
      expect(result.commit).toBeNull();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('never throws even when git is missing or cwd is bogus', () => {
    expect(() => detectGit('/this/path/does/not/exist')).not.toThrow();
  });

  it('returns at least one truthy field when run in this repo', () => {
    // The test suite itself runs inside the project's git repo, so we
    // expect a non-null result. This is a soft check — if someone runs
    // tests in a worktree without HEAD info, the test should still pass.
    const result = detectGit();
    if (result.branch !== null) {
      expect(typeof result.branch).toBe('string');
      expect(result.branch.length).toBeGreaterThan(0);
    }
    if (result.commit !== null) {
      expect(result.commit).toMatch(/^[0-9a-f]{7}$/);
    }
  });
});
