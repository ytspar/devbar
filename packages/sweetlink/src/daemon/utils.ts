/**
 * Small utilities shared across daemon and term modules.
 */

import { execFileSync } from 'node:child_process';

/**
 * Read git branch + short SHA. Returns nulls when not in a git repo or git
 * is missing — never throws. The 3s timeout prevents a stuck git process
 * (e.g. an interactive credential prompt) from hanging the caller.
 */
export function detectGit(): { branch: string | null; commit: string | null } {
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
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
