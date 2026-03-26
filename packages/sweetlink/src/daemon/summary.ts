/**
 * Summary Report Generator
 *
 * Generates a SUMMARY.md markdown report from a session recording.
 * Includes: metadata, action timeline, error summary, screenshots list.
 */

import type { SessionManifest, ActionEntry } from './session.js';
import type { ConsoleEntry, NetworkEntry } from './listeners.js';

// ============================================================================
// Types
// ============================================================================

export interface DetectedError {
  source: 'console' | 'network' | 'server';
  message: string;
  timestamp: number;
  /** e.g. status code for network, log level for console */
  code?: string;
}

export interface SummaryOptions {
  manifest: SessionManifest;
  consoleEntries?: ConsoleEntry[];
  networkEntries?: NetworkEntry[];
  serverErrors?: DetectedError[];
  gitBranch?: string;
  gitCommit?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function formatTimestamp(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function statusCell(count: number, label: string): string {
  if (count === 0) return '0 | ✅ Clean';
  const emoji = label === 'error' ? '❌' : '⚠️';
  return `${count} | ${emoji}`;
}

function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function formatActionDetails(entry: ActionEntry): string {
  const args = entry.args.map((a) => `"${a}"`).join(' ');
  return escapeMarkdown(args);
}

// ============================================================================
// Report Sections
// ============================================================================

function renderMetadata(options: SummaryOptions): string {
  const { manifest, gitBranch, gitCommit } = options;
  const lines = [
    '# Session Report',
    '',
    `**Date:** ${formatDate(manifest.startedAt)}  `,
    `**Session:** ${manifest.sessionId}  `,
    `**Duration:** ${formatTimestamp(manifest.duration)}  `,
  ];

  if (manifest.url) {
    lines.push(`**URL:** ${manifest.url}  `);
  }

  if (gitBranch || gitCommit) {
    const branch = gitBranch ?? 'unknown';
    const commit = gitCommit ? ` @ ${gitCommit.slice(0, 7)}` : '';
    lines.push(`**Git:** ${branch}${commit}  `);
  }

  return lines.join('\n');
}

function renderStatus(options: SummaryOptions): string {
  const { manifest, consoleEntries = [], networkEntries = [], serverErrors = [] } = options;

  const consoleErrors = consoleEntries.filter((e) => e.level === 'error').length;
  const consoleWarnings = consoleEntries.filter((e) => e.level === 'warning').length;
  const failedRequests = networkEntries.filter((e) => e.status === 0 || e.status >= 400).length;
  const serverErrorCount = serverErrors.length;

  const lines = [
    '## Status',
    '',
    '| Category | Count | Status |',
    '|----------|-------|--------|',
    `| Console Errors | ${statusCell(consoleErrors, 'error')} |`,
    `| Console Warnings | ${statusCell(consoleWarnings, 'warning')} |`,
    `| Failed Requests | ${statusCell(failedRequests, 'error')} |`,
    `| Server Errors | ${statusCell(serverErrorCount, 'error')} |`,
  ];

  return lines.join('\n');
}

function renderTimeline(manifest: SessionManifest): string {
  if (manifest.commands.length === 0) {
    return '## Action Timeline\n\nNo actions recorded.';
  }

  const lines = [
    '## Action Timeline',
    '',
    '| Time | Action | Details |',
    '|------|--------|---------|',
  ];

  for (const cmd of manifest.commands) {
    const time = formatTimestamp(cmd.timestamp);
    const details = formatActionDetails(cmd);
    lines.push(`| ${time} | ${cmd.action} | ${details} |`);
  }

  return lines.join('\n');
}

function renderConsoleErrors(consoleEntries: ConsoleEntry[]): string {
  const errors = consoleEntries.filter((e) => e.level === 'error');

  const lines = ['## Console Errors', ''];

  if (errors.length === 0) {
    lines.push('No console errors detected.');
    return lines.join('\n');
  }

  for (const err of errors) {
    const location = err.location ? ` (${err.location})` : '';
    lines.push(`- ${escapeMarkdown(err.message)}${location}`);
  }

  return lines.join('\n');
}

function renderScreenshots(manifest: SessionManifest): string {
  if (manifest.screenshots.length === 0) {
    return '## Screenshots\n\nNo screenshots captured.';
  }

  const lines = ['## Screenshots', ''];

  for (const filename of manifest.screenshots) {
    // Try to find the matching action for this screenshot
    const action = manifest.commands.find((c) => c.screenshot === filename);
    if (action) {
      const time = formatTimestamp(action.timestamp);
      const args = action.args.join(' ');
      lines.push(`- \`${filename}\` — ${action.action} ${args} (${time})`);
    } else {
      lines.push(`- \`${filename}\``);
    }
  }

  return lines.join('\n');
}

function renderVideo(manifest: SessionManifest): string {
  if (!manifest.video) return '';

  const lines = [
    '## Video',
    '',
    `- \`${manifest.video}\` (${formatTimestamp(manifest.duration)})`,
    '- Interactive viewer: `viewer.html`',
  ];

  return lines.join('\n');
}

// ============================================================================
// Main
// ============================================================================

/**
 * Generate a SUMMARY.md report from a session manifest and associated data.
 */
export function generateSummary(options: SummaryOptions): string {
  const sections = [
    renderMetadata(options),
    renderStatus(options),
    renderTimeline(options.manifest),
    renderConsoleErrors(options.consoleEntries ?? []),
    renderScreenshots(options.manifest),
    renderVideo(options.manifest),
  ].filter(Boolean);

  return sections.join('\n\n') + '\n';
}
