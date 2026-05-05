/**
 * Small utilities shared across daemon and term modules.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Ensure the parent directory of a file path exists. Used by every
 * caller that's about to write to disk and is fine with a no-op if the
 * path is already at the cwd.
 */
export function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Register the same handler for SIGTERM and SIGINT. Both signals route
 * to graceful shutdown across the daemon and CLI entry points; doing it
 * once here keeps the three call sites in lockstep.
 */
export function registerGracefulShutdown(handler: () => void): void {
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sig, handler);
  }
}

/**
 * Read git branch + short SHA from `cwd` (defaults to process.cwd()).
 * Returns nulls when not in a git repo or git is missing — never throws.
 * The 3s timeout prevents a stuck git process (e.g. an interactive
 * credential prompt) from hanging the caller.
 */
export function detectGit(cwd?: string): { branch: string | null; commit: string | null } {
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return { branch: branch !== 'HEAD' ? branch : null, commit };
  } catch {
    return { branch: null, commit: null };
  }
}

/**
 * Escape HTML text content. Note we escape `'` too — single quotes can sit
 * inside attributes and a half-escaped string is a real source of subtle
 * injection bugs. Earlier copies of this function disagreed on whether to
 * escape `'`; consolidating here picks the safer behavior for everyone.
 */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Alias kept for callers that use the term `escapeAttr`. */
export const escapeAttr = escapeHtml;
