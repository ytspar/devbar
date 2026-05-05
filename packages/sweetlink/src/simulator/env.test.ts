// @vitest-environment node

/**
 * Simulator Env Tests
 *
 * pickMinimalEnv is what the iOS and Android simulator wrappers use to
 * spawn subprocesses with a sanitized environment. The contract:
 *
 *   1. Only keys in the allowlist (PATH, HOME, USER, locale, shell,
 *      timezone, TMPDIR, PWD) are propagated. Everything else is dropped
 *      so no secrets like AWS_SECRET_KEY accidentally leak into a
 *      recorded artifact (an XCUITest video could surface them).
 *   2. Keys present on process.env are forwarded; absent keys are
 *      silently skipped (no `undefined` strings).
 *   3. The function is pure — it does not mutate process.env.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MINIMAL_ENV_KEYS, pickMinimalEnv } from './env.js';

const SAVED_ENV: Record<string, string | undefined> = {};
const TEST_KEYS = ['PATH', 'HOME', 'AWS_SECRET_KEY', 'GITHUB_TOKEN', 'TZ'];

beforeEach(() => {
  for (const k of TEST_KEYS) SAVED_ENV[k] = process.env[k];
});

afterEach(() => {
  for (const k of TEST_KEYS) {
    if (SAVED_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED_ENV[k];
  }
});

describe('MINIMAL_ENV_KEYS', () => {
  it('contains the documented baseline keys (no secrets)', () => {
    // Locking in the allowlist so a future PR adding `GITHUB_TOKEN` or
    // similar to it would surface here for review.
    expect(MINIMAL_ENV_KEYS).toEqual(
      expect.arrayContaining([
        'PATH',
        'HOME',
        'USER',
        'LANG',
        'LC_ALL',
        'LC_CTYPE',
        'TERM',
        'SHELL',
        'TZ',
        'TMPDIR',
        'PWD',
      ])
    );
  });

  it('does not include any token/secret-shaped keys', () => {
    for (const key of MINIMAL_ENV_KEYS) {
      expect(key).not.toMatch(/SECRET|TOKEN|KEY|PASSWORD/i);
    }
  });
});

describe('pickMinimalEnv', () => {
  it('forwards only allowlisted keys', () => {
    process.env.PATH = '/usr/bin';
    process.env.HOME = '/Users/x';
    process.env.AWS_SECRET_KEY = 'super-secret';
    process.env.GITHUB_TOKEN = 'ghp_abc';

    const env = pickMinimalEnv();

    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/Users/x');
    expect(env.AWS_SECRET_KEY).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
  });

  it('skips absent keys instead of writing undefined strings', () => {
    delete process.env.TZ;
    const env = pickMinimalEnv();
    // The output Record should not contain a TZ key with the literal
    // string "undefined".
    expect('TZ' in env).toBe(false);
  });

  it('does not mutate process.env', () => {
    const before = { ...process.env };
    pickMinimalEnv();
    // Snapshot equality on the keys the function looks at.
    for (const k of MINIMAL_ENV_KEYS) {
      expect(process.env[k]).toBe(before[k]);
    }
  });
});
