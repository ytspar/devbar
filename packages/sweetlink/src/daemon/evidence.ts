/**
 * Evidence Upload & Terminal Capture
 *
 * - Upload session artifacts to GitHub PR as comments
 * - Capture terminal output as asciicast + self-contained HTML player
 */

import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { SessionManifest } from './session.js';

// ============================================================================
// PR Evidence Upload
// ============================================================================

/**
 * Upload session evidence to a GitHub PR.
 * Uses `gh` CLI for uploading and commenting.
 */
export async function uploadEvidence(
  manifest: SessionManifest,
  sessionDir: string,
  prNumber: number,
  options?: { repo?: string }
): Promise<{ commentUrl: string }> {
  // Build comment body
  const screenshotCount = manifest.screenshots.length;
  const duration = manifest.duration.toFixed(1);
  const actionCount = manifest.commands.length;
  const errors = manifest.errors;

  let body = `## Sweetlink QA Evidence\n\n`;
  body += `**Session:** \`${manifest.sessionId}\`\n`;
  body += `**Duration:** ${duration}s | **Actions:** ${actionCount} | **Screenshots:** ${screenshotCount}\n`;
  body += `**Errors:** Console: ${errors.console} | Network: ${errors.network} | Server: ${errors.server}\n\n`;

  // Add action timeline
  if (manifest.commands.length > 0) {
    body += `### Action Timeline\n\n`;
    body += `| Time | Action |\n|------|--------|\n`;
    for (const cmd of manifest.commands) {
      body += `| ${cmd.timestamp.toFixed(1)}s | \`${cmd.action} ${cmd.args.join(' ')}\` |\n`;
    }
    body += `\n`;
  }

  // Check if viewer.html exists
  const viewerPath = path.join(sessionDir, 'viewer.html');
  const hasViewer = await fs.access(viewerPath).then(() => true).catch(() => false);
  if (hasViewer) {
    body += `> Interactive viewer: \`${viewerPath}\`\n`;
  }

  // Post comment via gh CLI
  const repoFlag = options?.repo ? ['--repo', options.repo] : [];
  try {
    const output = execFileSync(
      'gh',
      ['pr', 'comment', String(prNumber), '--body', body, ...repoFlag],
      { encoding: 'utf-8', timeout: 30_000 }
    );
    const commentUrl = output.trim();
    return { commentUrl };
  } catch (error) {
    throw new Error(
      `Failed to post PR comment. Ensure \`gh\` CLI is installed and authenticated.\n` +
        (error instanceof Error ? error.message : String(error))
    );
  }
}

// ============================================================================
// Terminal Capture
// ============================================================================

export interface TerminalCaptureResult {
  castPath: string;
  htmlPath: string;
  lines: number;
  duration: number;
}

/**
 * Run a command, capture its output with timing, and produce:
 * - .cast file (asciicast v2 format)
 * - Self-contained HTML player
 */
export async function captureTerminal(
  command: string,
  args: string[],
  outputDir: string
): Promise<TerminalCaptureResult> {
  await fs.mkdir(outputDir, { recursive: true });

  const startTime = Date.now();
  const events: Array<[number, string, string]> = [];
  let output = '';

  try {
    output = execFileSync(command, args, {
      encoding: 'utf-8',
      timeout: 120_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    // Capture output even on failure
    if (error && typeof error === 'object' && 'stdout' in error) {
      output = String((error as { stdout: unknown }).stdout);
    }
    if (error && typeof error === 'object' && 'stderr' in error) {
      output += String((error as { stderr: unknown }).stderr);
    }
  }

  const duration = (Date.now() - startTime) / 1000;

  // Split into lines and create timed events
  const lines = output.split('\n');
  const timePerLine = duration / Math.max(lines.length, 1);
  for (let i = 0; i < lines.length; i++) {
    events.push([i * timePerLine, 'o', lines[i]! + '\n']);
  }

  // Write asciicast v2 format
  const castFilename = `terminal-${Date.now()}.cast`;
  const castPath = path.join(outputDir, castFilename);
  const header = JSON.stringify({
    version: 2,
    width: 120,
    height: 40,
    timestamp: Math.floor(startTime / 1000),
    title: `${command} ${args.join(' ')}`,
    env: { SHELL: '/bin/bash', TERM: 'xterm-256color' },
  });
  const castContent = [header, ...events.map((e) => JSON.stringify(e))].join('\n');
  await fs.writeFile(castPath, castContent, 'utf-8');

  // Generate self-contained HTML player
  const htmlFilename = `terminal-${Date.now()}.html`;
  const htmlPath = path.join(outputDir, htmlFilename);
  const escapedOutput = output
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>Terminal: ${command} ${args.join(' ')}</title>
<style>
  body { margin: 0; background: #0a0f1a; color: #f1f5f9; font-family: 'Departure Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  .header { padding: 12px 20px; background: rgba(17, 24, 39, 0.95); border-bottom: 1px solid rgba(16, 185, 129, 0.2); font-size: 0.75rem; letter-spacing: 0.05em; }
  .header strong { color: #10b981; }
  .header span { color: #6b7280; }
  pre { padding: 20px; font-size: 0.6875rem; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; overflow-x: auto; color: #94a3b8; }
  .ansi-red { color: #ef4444; }
  .ansi-green { color: #10b981; }
  .ansi-yellow { color: #f59e0b; }
</style>
</head><body>
<div class="header">
  <strong>$ ${command} ${args.join(' ')}</strong>
  <span> &middot; ${duration.toFixed(1)}s &middot; ${lines.length} lines</span>
</div>
<pre>${escapedOutput}</pre>
</body></html>`;

  await fs.writeFile(htmlPath, html, 'utf-8');

  return { castPath, htmlPath, lines: lines.length, duration };
}
