/**
 * Interactive Viewer Generator
 *
 * Generates a self-contained HTML file from a session manifest.
 * No external dependencies — works offline.
 *
 * Features:
 * - Screenshot timeline with step markers
 * - Dual-pane layout (screenshots + action list)
 * - Click to jump to action
 * - Error badge
 * - Console/network log tabs
 *
 * Security: All user-generated content (console messages, URLs, action names)
 * is escaped before insertion into the HTML template to prevent XSS.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import type { SessionManifest } from './session.js';
import type { ConsoleEntry, NetworkEntry } from './listeners.js';

export interface ViewerOptions {
  /** Directory containing session artifacts */
  sessionDir: string;
  /** Output path for the viewer HTML */
  outputPath?: string;
  /** Console entries to embed */
  consoleEntries?: ConsoleEntry[];
  /** Network entries to embed */
  networkEntries?: NetworkEntry[];
}

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate a self-contained HTML viewer from a session manifest.
 */
export async function generateViewer(
  manifest: SessionManifest,
  options: ViewerOptions
): Promise<string> {
  // Load screenshots as base64
  const screenshots: Array<{ name: string; data: string; action: string; timestamp: number }> = [];
  for (const cmd of manifest.commands) {
    if (cmd.screenshot) {
      const screenshotPath = path.join(options.sessionDir, cmd.screenshot);
      try {
        const buffer = await fs.readFile(screenshotPath);
        screenshots.push({
          name: cmd.screenshot,
          data: buffer.toString('base64'),
          action: `${cmd.action} ${cmd.args.join(' ')}`,
          timestamp: cmd.timestamp,
        });
      } catch {
        // Screenshot file may not exist
      }
    }
  }

  const totalErrors = manifest.errors.console + manifest.errors.network + manifest.errors.server;

  // Sanitize entries for safe embedding in script tag
  // JSON.stringify handles escaping for script context
  const sanitizedConsole = (options.consoleEntries ?? []).map(e => ({
    timestamp: e.timestamp,
    level: e.level,
    message: String(e.message).slice(0, 500),
    location: e.location ? String(e.location).slice(0, 200) : undefined,
  }));
  const sanitizedNetwork = (options.networkEntries ?? []).map(e => ({
    timestamp: e.timestamp,
    method: e.method,
    url: String(e.url).slice(0, 200),
    status: e.status,
    duration: e.duration,
  }));

  // Build timeline HTML with escaped content
  const timelineHtml = manifest.commands.map((cmd, i) => {
    const action = escapeHtml(`${cmd.action} ${cmd.args.join(' ')}`);
    return `<div class="action-item${i === 0 ? ' active' : ''}" data-index="${i}">
      <span class="action-ts">${cmd.timestamp.toFixed(1)}s</span>
      <span class="action-cmd">${action}</span>
    </div>`;
  }).join('\n');

  // Build scrub markers
  const scrubMarkers = screenshots.map((_, i) =>
    `<div class="scrub-marker${i === 0 ? ' active' : ''}" data-index="${i}"></div>`
  ).join('');

  const firstScreenshot = screenshots.length > 0
    ? `<img id="screenshot-img" src="data:image/png;base64,${screenshots[0]!.data}" />`
    : '<div class="empty">No screenshots captured</div>';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sweetlink Session: ${escapeHtml(manifest.sessionId)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e0e0e0; height: 100vh; display: flex; flex-direction: column; }
  header { background: #1a1a1a; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #333; }
  header h1 { font-size: 14px; font-weight: 600; }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .badge.green { background: #064e3b; color: #6ee7b7; }
  .badge.red { background: #7f1d1d; color: #fca5a5; }
  .main { display: flex; flex: 1; overflow: hidden; }
  .screenshot-pane { flex: 62%; display: flex; flex-direction: column; border-right: 1px solid #333; }
  .screenshot-view { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #111; padding: 16px; }
  .screenshot-view img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px; }
  .scrub-bar { height: 40px; background: #1a1a1a; display: flex; align-items: center; padding: 0 16px; gap: 4px; border-top: 1px solid #333; overflow-x: auto; }
  .scrub-marker { width: 8px; height: 8px; border-radius: 50%; background: #555; cursor: pointer; flex-shrink: 0; transition: all 0.15s; }
  .scrub-marker:hover, .scrub-marker.active { background: #3b82f6; transform: scale(1.5); }
  .sidebar { flex: 38%; display: flex; flex-direction: column; }
  .tabs { display: flex; background: #1a1a1a; border-bottom: 1px solid #333; }
  .tab { padding: 8px 16px; font-size: 12px; cursor: pointer; border-bottom: 2px solid transparent; color: #888; }
  .tab.active { color: #e0e0e0; border-bottom-color: #3b82f6; }
  .tab-content { flex: 1; overflow-y: auto; padding: 8px; }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }
  .action-item { padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; font-family: monospace; margin-bottom: 2px; display: flex; gap: 8px; }
  .action-item:hover { background: #1a1a1a; }
  .action-item.active { background: #1e3a5f; }
  .action-ts { color: #888; min-width: 50px; }
  .action-cmd { color: #93c5fd; }
  .log-entry { padding: 4px 8px; font-size: 12px; font-family: monospace; border-bottom: 1px solid #1a1a1a; }
  .log-entry.error { color: #fca5a5; }
  .log-entry.warning { color: #fcd34d; }
  .empty { color: #666; text-align: center; padding: 40px; }
</style>
</head>
<body>
<header>
  <h1>Sweetlink Session</h1>
  <div style="display:flex;gap:12px;align-items:center">
    <span style="font-size:12px;color:#888">${manifest.duration.toFixed(1)}s &middot; ${manifest.commands.length} actions</span>
    <span class="badge ${totalErrors === 0 ? 'green' : 'red'}">${totalErrors === 0 ? '0 errors' : totalErrors + ' errors'}</span>
  </div>
</header>
<div class="main">
  <div class="screenshot-pane">
    <div class="screenshot-view" id="screenshot-view">
      ${firstScreenshot}
    </div>
    <div class="scrub-bar" id="scrub-bar">
      ${scrubMarkers}
    </div>
  </div>
  <div class="sidebar">
    <div class="tabs">
      <div class="tab active" data-tab="timeline">Timeline</div>
      <div class="tab" data-tab="console">Console</div>
      <div class="tab" data-tab="network">Network</div>
    </div>
    <div class="tab-content">
      <div class="tab-panel active" id="tab-timeline">
        ${timelineHtml || '<div class="empty">No actions recorded</div>'}
      </div>
      <div class="tab-panel" id="tab-console">
        <div id="console-entries"></div>
      </div>
      <div class="tab-panel" id="tab-network">
        <div id="network-entries"></div>
      </div>
    </div>
  </div>
</div>
<script>
// Screenshot data (base64 encoded, safe)
const screenshots = ${JSON.stringify(screenshots.map(s => ({ data: s.data, timestamp: s.timestamp })))};
// Sanitized log entries (JSON.stringify handles escaping)
const consoleEntries = ${JSON.stringify(sanitizedConsole)};
const networkEntries = ${JSON.stringify(sanitizedNetwork)};

// Tab switching
document.querySelectorAll('.tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// Screenshot navigation
function showScreenshot(index) {
  if (index < 0 || index >= screenshots.length) return;
  var img = document.getElementById('screenshot-img');
  if (img) img.src = 'data:image/png;base64,' + screenshots[index].data;
  document.querySelectorAll('.scrub-marker').forEach(function(m, i) { m.classList.toggle('active', i === index); });
  document.querySelectorAll('.action-item').forEach(function(a, i) { a.classList.toggle('active', i === index); });
}

document.querySelectorAll('.scrub-marker').forEach(function(marker) {
  marker.addEventListener('click', function() { showScreenshot(parseInt(marker.dataset.index)); });
});
document.querySelectorAll('.action-item').forEach(function(item) {
  item.addEventListener('click', function() { showScreenshot(parseInt(item.dataset.index)); });
});

// Populate console entries using safe DOM methods
var consoleEl = document.getElementById('console-entries');
if (consoleEntries.length === 0) {
  consoleEl.textContent = 'No console messages';
  consoleEl.className = 'empty';
} else {
  consoleEntries.forEach(function(e) {
    var div = document.createElement('div');
    div.className = 'log-entry' + (e.level === 'error' ? ' error' : e.level === 'warning' ? ' warning' : '');
    var time = new Date(e.timestamp).toISOString().slice(11, 19);
    div.textContent = '[' + time + '] ' + e.level.toUpperCase() + ' ' + e.message;
    consoleEl.appendChild(div);
  });
}

// Populate network entries using safe DOM methods
var networkEl = document.getElementById('network-entries');
if (networkEntries.length === 0) {
  networkEl.textContent = 'No network requests';
  networkEl.className = 'empty';
} else {
  networkEntries.forEach(function(e) {
    var div = document.createElement('div');
    div.className = 'log-entry' + ((e.status >= 400 || e.status === 0) ? ' error' : '');
    var time = new Date(e.timestamp).toISOString().slice(11, 19);
    div.textContent = '[' + time + '] ' + e.status + ' ' + e.method + ' ' + e.url + ' ' + e.duration + 'ms';
    networkEl.appendChild(div);
  });
}
</script>
</body>
</html>`;

  const outputPath = options.outputPath ?? path.join(options.sessionDir, 'viewer.html');
  await fs.writeFile(outputPath, html, 'utf-8');

  return outputPath;
}
