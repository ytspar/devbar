/**
 * Shared environment-variable allowlist for simulator subprocess spawning.
 *
 * Both ios.ts and android.ts need the same minimal env when their
 * `inheritEnv` flag is off — kept here so the two simulator modules
 * cannot drift on which keys they propagate.
 */

export const MINIMAL_ENV_KEYS = [
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
];

export function pickMinimalEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of MINIMAL_ENV_KEYS) {
    const v = process.env[key];
    if (typeof v === 'string') out[key] = v;
  }
  return out;
}
