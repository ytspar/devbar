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
  // Emit ISO 8601 with timezone so the report is unambiguous when shared
  // across machines/timezones. e.g. `2026-04-26T18:57:00-07:00`.
  const d = new Date(iso);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  const tzMin = -d.getTimezoneOffset();
  const tzSign = tzMin >= 0 ? '+' : '-';
  const tzAbs = Math.abs(tzMin);
  const tz = `${tzSign}${pad(Math.floor(tzAbs / 60))}:${pad(tzAbs % 60)}`;
  return `${year}-${month}-${day}T${hh}:${mm}:${ss}${tz}`;
}

function statusCell(count: number, label: string): string {
  if (count === 0) return '0 | ✅ Clean';
  const emoji = label === 'error' ? '❌' : '⚠️';
  return `${count} | ${emoji}`;
}

function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/**
 * Render the action arguments as a human-friendly description.
 * - Ref-based actions (click @e2): show "@e2"
 * - CSS-selector actions (click --selector=#cta): show "#cta"
 * - Text-search actions (click --text=Submit): show ‟Submit"
 * - Fill actions: show "@e2 ← \"value\""
 */
function formatActionDetails(entry: ActionEntry): string {
  const args = entry.args;
  if (args.length === 0) return '';

  // Ref form: ['@e2', value?]
  const refArg = args.find((a) => /^@e\d+$/.test(a));
  if (refArg) {
    if (entry.action === 'fill' && args.length >= 2) {
      const val = args[args.indexOf(refArg) + 1] ?? '';
      return escapeMarkdown(`${refArg} ← "${val}"`);
    }
    return escapeMarkdown(refArg);
  }

  // CLI-flag form: ['--selector=#cta', '--full-page', ...]
  const selectorFlag = args.find((a) => a.startsWith('--selector='));
  if (selectorFlag) {
    return escapeMarkdown(selectorFlag.slice('--selector='.length));
  }
  const textFlag = args.find((a) => a.startsWith('--text='));
  if (textFlag) {
    return escapeMarkdown(`"${textFlag.slice('--text='.length)}"`);
  }

  // Fallback: quote everything.
  return escapeMarkdown(args.map((a) => `"${a}"`).join(' '));
}

// ============================================================================
// Report Sections
// ============================================================================

function renderMetadata(options: SummaryOptions): string {
  const { manifest, gitBranch, gitCommit } = options;
  const lines = [
    `# Session Report${manifest.label ? `: ${manifest.label}` : ''}`,
    '',
    `**Date:** ${formatDate(manifest.startedAt)}  `,
    `**Session:** ${manifest.sessionId}  `,
    `**Duration:** ${formatTimestamp(manifest.duration)}  `,
  ];

  if (manifest.label) {
    lines.push(`**Label:** ${manifest.label}  `);
  }

  if (manifest.url) {
    lines.push(`**URL:** ${manifest.url}  `);
  }

  if (gitBranch || gitCommit) {
    const branch = gitBranch ?? 'unknown';
    const commit = gitCommit ? ` @ ${gitCommit.slice(0, 7)}` : '';
    lines.push(`**Git:** ${branch}${commit}  `);
  } else {
    // Surface the absence of git context — silently dropping it makes
    // the session look reproducible when it isn't.
    lines.push('**Git:** (not in a repository)  ');
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
    '| Time | Action | Target | Took | Screenshot |',
    '|------|--------|--------|------|------------|',
  ];

  for (const cmd of manifest.commands) {
    const time = formatTimestamp(cmd.timestamp);
    const details = formatActionDetails(cmd);
    const took = cmd.duration > 0 ? `${cmd.duration}ms` : '—';
    const shot = cmd.screenshot ? `[\`${cmd.screenshot}\`](${cmd.screenshot})` : '—';
    lines.push(`| ${time} | ${cmd.action} | ${details} | ${took} | ${shot} |`);
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
