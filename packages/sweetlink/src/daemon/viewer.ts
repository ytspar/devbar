/**
 * Interactive Viewer Generator
 *
 * Generates a self-contained HTML file with:
 * - WebM video playback with play/pause/seek
 * - Scrub bar with action markers positioned by timestamp
 * - Canvas overlay for click ripple + action toast at bounding box coordinates
 * - Dual-pane layout (video + timeline/logs)
 * - Auto-step-through mode that pauses at each action
 * - Console/network log tabs with error highlighting
 *
 * Security: All user-generated content is escaped before insertion.
 * No external dependencies — works offline.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import type { SessionManifest } from './session.js';
import type { ConsoleEntry, NetworkEntry } from './listeners.js';
import { generateSummary } from './summary.js';

export interface ViewerOptions {
  sessionDir: string;
  outputPath?: string;
  consoleEntries?: ConsoleEntry[];
  networkEntries?: NetworkEntry[];
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function generateViewer(
  manifest: SessionManifest,
  options: ViewerOptions
): Promise<string> {
  // Load video as base64 if available
  let videoBase64: string | null = null;
  if (manifest.video) {
    const videoPath = path.join(options.sessionDir, manifest.video);
    try {
      const buffer = await fs.readFile(videoPath);
      videoBase64 = buffer.toString('base64');
    } catch { /* video file may not exist */ }
  }

  // Load action screenshots as base64 fallback
  const screenshots: Array<{ name: string; data: string }> = [];
  for (const cmd of manifest.commands) {
    if (cmd.screenshot) {
      try {
        const buffer = await fs.readFile(path.join(options.sessionDir, cmd.screenshot));
        screenshots.push({ name: cmd.screenshot, data: buffer.toString('base64') });
      } catch { /* skip missing */ }
    }
  }

  const totalErrors = manifest.errors.console + manifest.errors.network + manifest.errors.server;
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

  const timelineHtml = manifest.commands.map((cmd, i) => {
    const action = escapeHtml(`${cmd.action} ${cmd.args.join(' ')}`);
    const bb = cmd.boundingBox;
    const bbInfo = bb ? ` at (${Math.round(bb.x)},${Math.round(bb.y)})` : '';
    return `<div class="action-item" data-index="${i}" data-time="${cmd.timestamp.toFixed(3)}">
      <span class="action-ts">${cmd.timestamp.toFixed(1)}s</span>
      <span class="action-cmd">${action}</span>
      <span class="action-pos">${escapeHtml(bbInfo)}</span>
    </div>`;
  }).join('\n');

  const hasVideo = videoBase64 !== null;

  // Generate summary markdown for clipboard copy
  const summaryMd = generateSummary({
    manifest,
    consoleEntries: options.consoleEntries,
    networkEntries: options.networkEntries,
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sweetlink Session: ${escapeHtml(manifest.sessionId)}</title>
<style>
  /* Design System: devbar (Departure Mono, emerald accent, dark terminal aesthetic) */
  :root {
    --color-primary: #10b981;
    --color-primary-hover: #059669;
    --color-primary-glow: rgba(16, 185, 129, 0.4);
    --color-error: #ef4444;
    --color-warning: #f59e0b;
    --color-info: #3b82f6;
    --color-purple: #a855f7;
    --color-bg: #0a0f1a;
    --color-bg-card: rgba(17, 24, 39, 0.95);
    --color-bg-elevated: rgba(17, 24, 39, 0.98);
    --color-text: #f1f5f9;
    --color-text-secondary: #94a3b8;
    --color-text-muted: #6b7280;
    --color-border: rgba(16, 185, 129, 0.2);
    --color-border-subtle: rgba(255, 255, 255, 0.05);
    --font-mono: 'Departure Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    --radius-sm: 4px;
    --radius-md: 6px;
    --radius-lg: 12px;
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(16, 185, 129, 0.1);
    --transition-fast: 150ms;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: var(--font-mono); background: var(--color-bg); color: var(--color-text); height: 100vh; display: flex; flex-direction: column; font-size: 0.6875rem; letter-spacing: 0.05em; }
  header { background: var(--color-bg-card); padding: 10px 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
  header h1 { font-size: 0.75rem; font-weight: 600; color: var(--color-primary); letter-spacing: 0.1em; text-transform: uppercase; }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 9999px; font-size: 0.625rem; font-weight: 600; letter-spacing: 0.05em; }
  .badge.green { background: rgba(16, 185, 129, 0.15); color: var(--color-primary); border: 1px solid rgba(16, 185, 129, 0.3); }
  .badge.red { background: rgba(239, 68, 68, 0.15); color: var(--color-error); border: 1px solid rgba(239, 68, 68, 0.3); }
  .main { display: flex; flex: 1; overflow: hidden; }
  .video-pane { flex: 62%; display: flex; flex-direction: column; border-right: 1px solid var(--color-border); position: relative; }
  .video-container { flex: 1; position: relative; background: var(--color-bg); display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .video-container video, .video-container img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: var(--radius-sm); }
  .overlay-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
  .controls { height: 56px; background: var(--color-bg-card); border-top: 1px solid var(--color-border); display: flex; flex-direction: column; padding: 4px 16px; flex-shrink: 0; }
  .scrub-track { position: relative; height: 10px; background: var(--color-border-subtle); border-radius: 5px; margin-bottom: 6px; cursor: pointer; border: 1px solid var(--color-border); }
  .scrub-fill { position: absolute; top: 0; left: 0; height: 100%; background: var(--color-primary); border-radius: 5px; pointer-events: none; opacity: 0.6; }
  .scrub-marker { position: absolute; top: -3px; width: 4px; height: 16px; background: var(--color-warning); border-radius: 2px; transform: translateX(-50%); cursor: pointer; z-index: 2; box-shadow: 0 0 6px rgba(245, 158, 11, 0.4); }
  .scrub-marker:hover { background: #fbbf24; transform: translateX(-50%) scaleX(1.5); }
  .control-row { display: flex; align-items: center; gap: 12px; font-size: 0.625rem; }
  .btn { background: rgba(16, 185, 129, 0.1); border: 1px solid var(--color-border); color: var(--color-text-secondary); padding: 4px 12px; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.625rem; font-family: var(--font-mono); letter-spacing: 0.05em; transition: all var(--transition-fast); }
  .btn:hover { background: rgba(16, 185, 129, 0.2); color: var(--color-text); border-color: var(--color-primary); }
  .btn.active { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
  .time-display { color: var(--color-text-muted); min-width: 100px; }
  .sidebar { flex: 38%; display: flex; flex-direction: column; background: var(--color-bg-card); }
  .tabs { display: flex; background: var(--color-bg-elevated); border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
  .tab { padding: 8px 16px; font-size: 0.625rem; cursor: pointer; border-bottom: 2px solid transparent; color: var(--color-text-muted); font-family: var(--font-mono); letter-spacing: 0.1em; text-transform: uppercase; transition: all var(--transition-fast); }
  .tab:hover { color: var(--color-text-secondary); }
  .tab.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
  .tab-content { flex: 1; overflow-y: auto; padding: 8px; }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }
  .action-item { padding: 6px 12px; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.6875rem; margin-bottom: 2px; display: flex; gap: 8px; align-items: center; transition: background var(--transition-fast); border-left: 3px solid transparent; }
  .action-item:hover { background: rgba(16, 185, 129, 0.05); }
  .action-item.active { background: rgba(16, 185, 129, 0.1); border-left-color: var(--color-primary); }
  .action-ts { color: var(--color-text-muted); min-width: 45px; flex-shrink: 0; }
  .action-cmd { color: var(--color-primary); }
  .action-pos { color: var(--color-text-muted); font-size: 0.625rem; opacity: 0.6; }
  .log-entry { padding: 3px 8px; font-size: 0.6875rem; border-bottom: 1px solid var(--color-border-subtle); color: var(--color-text-secondary); }
  .log-entry.error { color: var(--color-error); }
  .log-entry.warning { color: var(--color-warning); }
  .empty { color: var(--color-text-muted); text-align: center; padding: 40px; letter-spacing: 0.05em; }
  .toast { position: absolute; bottom: 60px; left: 50%; transform: translateX(-50%); background: var(--color-bg-elevated); color: var(--color-primary); padding: 6px 16px; border-radius: var(--radius-md); font-size: 0.75rem; pointer-events: none; opacity: 0; transition: opacity 0.2s; z-index: 10; border: 1px solid var(--color-border); box-shadow: var(--shadow-md); }
  .toast.show { opacity: 1; }
  .toggle-row { display: flex; align-items: center; gap: 8px; font-size: 0.625rem; color: var(--color-text-muted); }
  .toggle { position: relative; width: 28px; height: 16px; background: var(--color-border-subtle); border-radius: 8px; cursor: pointer; transition: background var(--transition-fast); border: 1px solid var(--color-border); }
  .toggle.on { background: var(--color-primary); }
  .toggle-knob { position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; background: var(--color-text); border-radius: 50%; transition: left var(--transition-fast); }
  .toggle.on .toggle-knob { left: 14px; }
  .git-info { font-size: 0.625rem; color: var(--color-text-muted); opacity: 0.7; }
  .share-btn { background: none; border: 1px solid var(--color-border); color: var(--color-text-muted); padding: 3px 10px; border-radius: var(--radius-sm); cursor: pointer; font-family: var(--font-mono); font-size: 0.575rem; letter-spacing: 0.05em; transition: all var(--transition-fast); }
  .share-btn:hover { color: var(--color-primary); border-color: var(--color-primary); }
  .share-btn.copied { color: var(--color-primary); border-color: var(--color-primary); }
  @keyframes ripple { 0% { transform: translate(-50%,-50%) scale(0.5); opacity: 0.8; } 100% { transform: translate(-50%,-50%) scale(3); opacity: 0; } }
  @media (max-width: 768px) {
    .main { flex-direction: column; }
    .video-pane { flex: none; height: 50vh; border-right: none; border-bottom: 1px solid var(--color-border); }
    .sidebar { flex: 1; }
  }
</style>
</head>
<body>
<header>
  <div style="display:flex;align-items:center;gap:12px">
    ${manifest.url ? `<a href="${escapeHtml(manifest.url)}" style="color:var(--color-text-muted);text-decoration:none;font-size:0.75rem;transition:color var(--transition-fast)" onmouseover="this.style.color='var(--color-primary)'" onmouseout="this.style.color='var(--color-text-muted)'">&larr; Back to app</a><span style="color:var(--color-border)">|</span>` : ''}
    <h1>Sweetlink Session</h1>
  </div>
  <div style="display:flex;gap:12px;align-items:center">
    ${manifest.gitBranch ? `<span class="git-info">${escapeHtml(manifest.gitBranch)}${manifest.gitCommit ? ' @ ' + escapeHtml(manifest.gitCommit) : ''}</span><span style="color:var(--color-border)">|</span>` : ''}
    <span style="font-size:0.625rem;color:var(--color-text-muted)">${manifest.duration.toFixed(1)}s &middot; ${manifest.commands.length} actions${hasVideo ? ' &middot; video' : ''}</span>
    <span class="badge ${totalErrors === 0 ? 'green' : 'red'}">${totalErrors === 0 ? '0 errors' : totalErrors + ' errors'}</span>
    <button class="share-btn" id="btn-copy-report" title="Copy summary report to clipboard">Copy Report</button>
    <button class="share-btn" id="btn-download" title="Download this viewer as a file">Download</button>
  </div>
</header>
<div class="main">
  <div class="video-pane">
    <div class="video-container" id="video-container">
      ${hasVideo
        ? `<video id="player" src="data:video/webm;base64,${videoBase64}" preload="auto"></video>`
        : screenshots.length > 0
          ? `<img id="screenshot-img" src="data:image/png;base64,${screenshots[0]!.data}" />`
          : '<div class="empty">No video or screenshots</div>'
      }
      <canvas class="overlay-canvas" id="overlay"></canvas>
    </div>
    <div class="toast" id="toast"></div>
    <div class="controls">
      <div class="scrub-track" id="scrub-track">
        <div class="scrub-fill" id="scrub-fill"></div>
        ${manifest.commands.map((cmd, i) => {
          const pct = manifest.duration > 0 ? (cmd.timestamp / manifest.duration) * 100 : 0;
          return `<div class="scrub-marker" data-index="${i}" data-time="${cmd.timestamp}" style="left:${pct}%" title="${escapeHtml(cmd.action + ' ' + cmd.args.join(' '))}"></div>`;
        }).join('')}
      </div>
      <div class="control-row">
        ${hasVideo ? '<button class="btn" id="btn-play">Play</button>' : ''}
        <button class="btn" id="btn-prev">&larr; Prev</button>
        <button class="btn" id="btn-next">Next &rarr;</button>
        <button class="btn" id="btn-auto">Auto Step</button>
        <span class="time-display" id="time-display">0.0s / ${manifest.duration.toFixed(1)}s</span>
        <span style="flex:1"></span>
        <div class="toggle-row">
          <span>Overlays</span>
          <div class="toggle on" id="toggle-overlays"><div class="toggle-knob"></div></div>
        </div>
      </div>
    </div>
  </div>
  <div class="sidebar">
    <div class="tabs">
      <div class="tab active" data-tab="timeline">Timeline (${manifest.commands.length})</div>
      <div class="tab" data-tab="console">Console</div>
      <div class="tab" data-tab="network">Network</div>
    </div>
    <div class="tab-content">
      <div class="tab-panel active" id="tab-timeline">
        ${timelineHtml || '<div class="empty">No actions recorded</div>'}
      </div>
      <div class="tab-panel" id="tab-console"><div id="console-entries"></div></div>
      <div class="tab-panel" id="tab-network"><div id="network-entries"></div></div>
    </div>
  </div>
</div>
<script>
var actions = ${JSON.stringify(manifest.commands.map(c => ({
    timestamp: c.timestamp,
    action: c.action,
    args: c.args,
    boundingBox: c.boundingBox,
  })))};
var screenshots = ${JSON.stringify(screenshots.map(s => s.data))};
var duration = ${manifest.duration};
var hasVideo = ${hasVideo};
var summaryReport = ${JSON.stringify(summaryMd)};
var consoleEntries = ${JSON.stringify(sanitizedConsole)};
var networkEntries = ${JSON.stringify(sanitizedNetwork)};

var currentAction = -1;
var autoStepping = false;
var autoTimer = null;
var overlaysEnabled = true;

// Elements
var player = document.getElementById('player');
var screenshotImg = document.getElementById('screenshot-img');
var overlay = document.getElementById('overlay');
var ctx = overlay ? overlay.getContext('2d') : null;
var scrubFill = document.getElementById('scrub-fill');
var timeDisplay = document.getElementById('time-display');
var toast = document.getElementById('toast');
var btnPlay = document.getElementById('btn-play');
var btnPrev = document.getElementById('btn-prev');
var btnNext = document.getElementById('btn-next');
var btnAuto = document.getElementById('btn-auto');

// Resize overlay canvas to match container
function resizeOverlay() {
  if (!overlay) return;
  var container = document.getElementById('video-container');
  overlay.width = container.offsetWidth;
  overlay.height = container.offsetHeight;
}
window.addEventListener('resize', resizeOverlay);
resizeOverlay();

// Show toast message
function showToast(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 1500);
}

// Draw click ripple overlay
function drawClickRipple(bb) {
  if (!ctx || !overlay || !bb || !overlaysEnabled) return;
  var container = document.getElementById('video-container');
  var media = player || screenshotImg;
  if (!media) return;

  // Map bounding box coordinates from page space to display space
  var mediaRect = media.getBoundingClientRect();
  var containerRect = container.getBoundingClientRect();
  var scaleX = mediaRect.width / 1280;
  var scaleY = mediaRect.height / 720;
  var offsetX = mediaRect.left - containerRect.left;
  var offsetY = mediaRect.top - containerRect.top;

  var cx = offsetX + (bb.x + bb.width / 2) * scaleX;
  var cy = offsetY + (bb.y + bb.height / 2) * scaleY;

  // Animate ripple
  var frame = 0;
  var maxFrames = 30;
  function animate() {
    if (frame >= maxFrames) { ctx.clearRect(0, 0, overlay.width, overlay.height); return; }
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    var progress = frame / maxFrames;
    var radius = 10 + progress * 40;
    var alpha = 1 - progress;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(16, 185, 129, ' + alpha + ')';
    ctx.lineWidth = 3;
    ctx.stroke();
    // Dot
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16, 185, 129, ' + (alpha * 0.6) + ')';
    ctx.fill();
    frame++;
    requestAnimationFrame(animate);
  }
  animate();
}

// Navigate to action by index
function goToAction(idx) {
  if (idx < 0 || idx >= actions.length) return;
  currentAction = idx;

  var action = actions[idx];

  // Seek video or show screenshot
  if (hasVideo && player) {
    player.currentTime = action.timestamp;
  } else if (screenshotImg && idx < screenshots.length) {
    screenshotImg.src = 'data:image/png;base64,' + screenshots[idx];
  }

  // Update scrub bar
  var pct = duration > 0 ? (action.timestamp / duration) * 100 : 0;
  if (scrubFill) scrubFill.style.width = pct + '%';
  if (timeDisplay) timeDisplay.textContent = action.timestamp.toFixed(1) + 's / ' + duration.toFixed(1) + 's';

  // Highlight timeline item
  document.querySelectorAll('.action-item').forEach(function(el, i) {
    el.classList.toggle('active', i === idx);
    if (i === idx) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  // Show toast (only when overlays enabled)
  if (overlaysEnabled) showToast(action.action + ' ' + action.args.join(' '));

  // Draw click ripple if bounding box available
  if (action.boundingBox) {
    setTimeout(function() { drawClickRipple(action.boundingBox); }, 100);
  }
}

// Video playback sync
if (player) {
  player.addEventListener('timeupdate', function() {
    var t = player.currentTime;
    var pct = duration > 0 ? (t / duration) * 100 : 0;
    if (scrubFill) scrubFill.style.width = pct + '%';
    if (timeDisplay) timeDisplay.textContent = t.toFixed(1) + 's / ' + duration.toFixed(1) + 's';

    // Highlight nearest action
    var nearest = -1;
    for (var i = 0; i < actions.length; i++) {
      if (actions[i].timestamp <= t + 0.1) nearest = i;
    }
    if (nearest !== currentAction && nearest >= 0) {
      currentAction = nearest;
      document.querySelectorAll('.action-item').forEach(function(el, j) {
        el.classList.toggle('active', j === nearest);
      });
      if (actions[nearest].boundingBox) drawClickRipple(actions[nearest].boundingBox);
    }
  });

  if (btnPlay) {
    btnPlay.addEventListener('click', function() {
      if (player.paused) { player.play(); btnPlay.textContent = 'Pause'; }
      else { player.pause(); btnPlay.textContent = 'Play'; }
    });
  }
}

// Scrub track click
document.getElementById('scrub-track').addEventListener('click', function(e) {
  var rect = this.getBoundingClientRect();
  var pct = (e.clientX - rect.left) / rect.width;
  var t = pct * duration;
  if (player) player.currentTime = t;
  // Find nearest action
  var nearest = 0;
  for (var i = 0; i < actions.length; i++) {
    if (Math.abs(actions[i].timestamp - t) < Math.abs(actions[nearest].timestamp - t)) nearest = i;
  }
  goToAction(nearest);
});

// Scrub markers
document.querySelectorAll('.scrub-marker').forEach(function(marker) {
  marker.addEventListener('click', function(e) {
    e.stopPropagation();
    goToAction(parseInt(marker.dataset.index));
  });
});

// Timeline items
document.querySelectorAll('.action-item').forEach(function(item) {
  item.addEventListener('click', function() { goToAction(parseInt(item.dataset.index)); });
});

// Prev/Next buttons
if (btnPrev) btnPrev.addEventListener('click', function() { goToAction(Math.max(0, currentAction - 1)); });
if (btnNext) btnNext.addEventListener('click', function() { goToAction(Math.min(actions.length - 1, currentAction + 1)); });

// Auto-step mode
if (btnAuto) {
  btnAuto.addEventListener('click', function() {
    autoStepping = !autoStepping;
    btnAuto.classList.toggle('active', autoStepping);
    btnAuto.textContent = autoStepping ? 'Stop Auto' : 'Auto Step';

    if (autoStepping) {
      if (currentAction < 0) goToAction(0);
      autoTimer = setInterval(function() {
        var next = currentAction + 1;
        if (next >= actions.length) {
          next = 0; // loop
        }
        goToAction(next);
        // If video, also play a short segment
        if (player && next < actions.length) {
          player.currentTime = actions[next].timestamp;
          player.play();
          setTimeout(function() { if (autoStepping) player.pause(); }, 1500);
        }
      }, 2000);
    } else {
      clearInterval(autoTimer);
      if (player) player.pause();
    }
  });
}

// Tab switching
document.querySelectorAll('.tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// Populate console entries
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

// Populate network entries
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

// Overlay toggle
var toggleOverlays = document.getElementById('toggle-overlays');
if (toggleOverlays) {
  toggleOverlays.addEventListener('click', function() {
    overlaysEnabled = !overlaysEnabled;
    toggleOverlays.classList.toggle('on', overlaysEnabled);
    if (!overlaysEnabled && ctx && overlay) ctx.clearRect(0, 0, overlay.width, overlay.height);
  });
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  if (e.key === 'ArrowLeft') goToAction(Math.max(0, currentAction - 1));
  if (e.key === 'ArrowRight') goToAction(Math.min(actions.length - 1, currentAction + 1));
  if (e.key === ' ' && player) { e.preventDefault(); if (player.paused) player.play(); else player.pause(); }
});

// Start at first action
// Share buttons
// Clipboard helper — falls back to execCommand for file:// contexts
function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback for file:// or non-secure contexts
  var textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  var ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  return ok ? Promise.resolve() : Promise.reject(new Error('execCommand failed'));
}

var btnCopyReport = document.getElementById('btn-copy-report');
if (btnCopyReport) {
  btnCopyReport.addEventListener('click', function() {
    copyToClipboard(summaryReport).then(function() {
      btnCopyReport.textContent = 'Copied!';
      btnCopyReport.classList.add('copied');
      setTimeout(function() {
        btnCopyReport.textContent = 'Copy Report';
        btnCopyReport.classList.remove('copied');
      }, 2000);
    }, function() {
      btnCopyReport.textContent = 'Failed';
      setTimeout(function() { btnCopyReport.textContent = 'Copy Report'; }, 2000);
    });
  });
}

var btnDownload = document.getElementById('btn-download');
if (btnDownload) {
  btnDownload.addEventListener('click', function() {
    var blob = new Blob([document.documentElement.outerHTML], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'sweetlink-session.html';
    a.click();
    URL.revokeObjectURL(url);
    btnDownload.textContent = 'Downloaded!';
    btnDownload.classList.add('copied');
    setTimeout(function() {
      btnDownload.textContent = 'Download';
      btnDownload.classList.remove('copied');
    }, 2000);
  });
}

if (actions.length > 0) goToAction(0);
</script>
</body>
</html>`;

  const outputPath = options.outputPath ?? path.join(options.sessionDir, 'viewer.html');
  await fs.writeFile(outputPath, html, 'utf-8');
  return outputPath;
}
