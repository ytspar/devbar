/**
 * Session Recording
 *
 * Records browser sessions as WebM video via Playwright's Chromium screencast,
 * with synchronized action timeline and bounding box capture for overlays.
 *
 * Architecture:
 * - On `startRecording()`, a NEW BrowserContext is created with `recordVideo`
 * - The recording page navigates to the same URL as the daemon's main page
 * - Actions (click, fill) are executed on the RECORDING page (not the main page)
 * - On `stopRecording()`, the recording page/context are closed, which finalizes the video
 * - The video file path is available via `page.video().path()` after close
 */

import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { SessionManifest, ActionEntry } from './session.js';
import { installCursorHighlight } from './cursor.js';
import { consoleBuffer, installListeners, networkBuffer } from './listeners.js';
import { DEFAULT_VIEWPORT } from '../viewportUtils.js';

type Browser = import('playwright').Browser;
type BrowserContext = import('playwright').BrowserContext;
type Page = import('playwright').Page;

// ============================================================================
// Constants
// ============================================================================

// Match the daemon's default viewport so what's recorded looks like what
// the user sees in their normal browser tab. Callers can override via
// startRecording's `viewport` option (e.g. `record start --viewport mobile`).
const RECORDING_VIEWPORT = DEFAULT_VIEWPORT;

// ============================================================================
// State
// ============================================================================

let recording = false;
let paused = false;
let pausedAt: number | null = null;
let totalPausedMs = 0;
let sessionId: string | null = null;
let startedAt: number | null = null;
let actions: ActionEntry[] = [];
let screenshotPaths: string[] = [];
let sessionDir: string | null = null;
let recordingContext: BrowserContext | null = null;
let recordingPage: Page | null = null;
let recordingVideoPath: string | null = null;
let recordingUrl: string | null = null;
let recordingGitBranch: string | null = null;
let recordingGitCommit: string | null = null;
let recordingLabel: string | null = null;
// Buffer cursors snapshotted at startRecording so the manifest only counts
// events that landed during this session (the ring buffers are global).
let consoleStartCursor = 0;
let networkStartCursor = 0;

function detectGit(): { branch: string | null; commit: string | null } {
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return { branch: branch !== 'HEAD' ? branch : null, commit };
  } catch {
    return { branch: null, commit: null };
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Start recording a session with real video capture.
 * Creates a new BrowserContext with recordVideo enabled.
 */
export async function startRecording(
  browser: Browser,
  url: string,
  outputDir: string,
  options?: {
    viewport?: { width: number; height: number };
    label?: string;
    /** Path to a Playwright storageState JSON (cookies + localStorage) — for testing logged-in flows. */
    storageState?: string;
    /** Enable Playwright trace recording (writes trace.zip on stop). */
    trace?: boolean;
  }
): Promise<{ sessionId: string }> {
  if (recording) {
    throw new Error('Recording already in progress. Stop it first.');
  }

  // Human-sortable timestamp: session-2026-04-26T19-47-14
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  sessionId = `session-${stamp}`;
  sessionDir = path.join(outputDir, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });

  const viewport = options?.viewport ?? RECORDING_VIEWPORT;

  // Create a new context with video recording (and optionally
  // pre-authenticated storage state for testing logged-in flows).
  recordingContext = await browser.newContext({
    viewport,
    recordVideo: {
      dir: sessionDir,
      size: viewport,
    },
    ...(options?.storageState ? { storageState: options.storageState } : {}),
  });

  // Optional Playwright trace for full DevTools-grade debugging.
  if (options?.trace) {
    try {
      await recordingContext.tracing.start({ screenshots: true, snapshots: true, sources: true });
    } catch (e) {
      console.error('[Daemon] Could not start trace:', e instanceof Error ? e.message : e);
    }
  }

  recordingPage = await recordingContext.newPage();

  // Install cursor highlight so clicks are visible in the video
  await installCursorHighlight(recordingPage);

  // Install event listeners for ring buffer capture during recording
  installListeners(recordingPage);

  // Mark session start BEFORE navigating so any console/network events
  // emitted during the initial page load are attributed to this session.
  recording = true;
  startedAt = Date.now();
  actions = [];
  screenshotPaths = [];
  consoleStartCursor = consoleBuffer.size;
  networkStartCursor = networkBuffer.size;
  recordingUrl = url;
  recordingLabel = options?.label ?? null;

  // Navigate to the same URL (events from this load count toward the session)
  await recordingPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  const git = detectGit();
  recordingGitBranch = git.branch;
  recordingGitCommit = git.commit;

  console.error(`[Daemon] Recording started: ${sessionId} (video: ${viewport.width}x${viewport.height})`);
  return { sessionId };
}

/**
 * Get the recording page for executing actions.
 * Actions during recording should use THIS page, not the main daemon page.
 */
export function getRecordingPage(): Page | null {
  return recordingPage;
}

/**
 * Log an action during recording.
 * Captures a screenshot at the moment of the action for the viewer thumbnail.
 */
export async function logAction(
  action: string,
  args: string[],
  page: Page,
  boundingBox?: { x: number; y: number; width: number; height: number },
  durationMs?: number
): Promise<void> {
  if (!recording || !startedAt || !sessionDir) return;
  // Drop actions while paused — the user explicitly asked us to ignore
  // this window. The action will appear once they resume.
  if (paused) return;

  // Subtract the time we spent paused from the timeline so timestamps
  // stay relative to active recording.
  const timestamp = (Date.now() - startedAt - totalPausedMs) / 1000;
  const screenshotName = `action-${actions.length}.png`;
  const screenshotPath = path.join(sessionDir, screenshotName);

  try {
    // If we have a bounding box, briefly inject a marker pulse at the
    // action's center so the action screenshot makes the click site
    // visible. The marker is removed before resolving.
    let markerInjected = false;
    if (boundingBox) {
      const cx = Math.round(boundingBox.x + boundingBox.width / 2);
      const cy = Math.round(boundingBox.y + boundingBox.height / 2);
      try {
        await page.evaluate(
          ({ cx, cy }) => {
            const m = document.createElement('div');
            m.id = '__sl_action_marker__';
            Object.assign(m.style, {
              position: 'fixed',
              left: `${cx}px`,
              top: `${cy}px`,
              width: '0', height: '0',
              pointerEvents: 'none',
              zIndex: '2147483647',
              transform: 'translate(-50%, -50%)',
              boxSizing: 'border-box',
            });
            const dot = document.createElement('div');
            Object.assign(dot.style, {
              position: 'absolute',
              left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
              width: '20px', height: '20px',
              borderRadius: '50%',
              background: 'rgba(255, 64, 32, 0.85)',
              border: '3px solid #fff',
              boxShadow: '0 0 0 2px rgba(255, 64, 32, 0.5), 0 2px 8px rgba(0,0,0,0.3)',
            });
            m.appendChild(dot);
            document.body.appendChild(m);
          },
          { cx, cy },
        );
        markerInjected = true;
      } catch { /* page may not be ready */ }
    }
    const buffer = await page.screenshot();
    if (markerInjected) {
      try {
        await page.evaluate(() => {
          const m = document.getElementById('__sl_action_marker__');
          if (m) m.remove();
        });
      } catch { /* ignore */ }
    }
    await fs.writeFile(screenshotPath, buffer);
    screenshotPaths.push(screenshotPath);
  } catch {
    // Screenshot may fail if page is navigating
  }

  actions.push({
    timestamp,
    action,
    args,
    duration: durationMs ?? 0,
    boundingBox,
    screenshot: screenshotName,
  });
}

/**
 * Stop recording and generate session manifest.
 * Closes the recording context which finalizes the video file.
 */
export async function stopRecording(): Promise<SessionManifest | null> {
  if (!recording || !sessionId || !startedAt || !sessionDir) {
    return null;
  }

  const startedAtMs = startedAt;
  // If we stop while paused, finalise the pause window first.
  if (paused && pausedAt) {
    totalPausedMs += Date.now() - pausedAt;
    paused = false;
    pausedAt = null;
  }
  const endedAt = Date.now();
  // Active-recording duration excludes time spent paused.
  const duration = (endedAt - startedAtMs - totalPausedMs) / 1000;

  // Get video path BEFORE closing (it's set when the page was created)
  let videoFilename: string | undefined;

  if (recordingPage) {
    const video = recordingPage.video();
    if (video) {
      recordingVideoPath = await video.path();
    }

    // Close the page and context to finalize the video
    try {
      await recordingPage.close();
    } catch { /* may already be closed */ }
  }

  if (recordingContext) {
    // If tracing was active, stop and write trace.zip into the session dir
    // before closing the context.
    try {
      await recordingContext.tracing.stop({ path: path.join(sessionDir, 'trace.zip') });
    } catch { /* tracing may not have been started */ }
    try {
      await recordingContext.close();
    } catch { /* may already be closed */ }
  }

  // Move the video file to a predictable name
  if (recordingVideoPath) {
    try {
      videoFilename = 'session.webm';
      const destPath = path.join(sessionDir, videoFilename);
      await fs.rename(recordingVideoPath, destPath);
      recordingVideoPath = destPath;
      const stat = await fs.stat(destPath);
      console.error(`[Daemon] Video saved: ${destPath} (${(stat.size / 1024).toFixed(0)}KB)`);
    } catch (e) {
      console.error('[Daemon] Failed to save video:', e);
      videoFilename = undefined;
    }
  }

  // Count only entries pushed AFTER startRecording (cursor-based). The
  // ring buffers are daemon-global so timestamp filtering alone would
  // miss events that fire after startRecording but share a millisecond
  // with init-time events. Cursor-based slicing is atomic.
  const consoleSlice = consoleBuffer.toArray().slice(consoleStartCursor);
  const networkSlice = networkBuffer.toArray().slice(networkStartCursor);
  const consoleErrors = consoleSlice.filter((e) => e.level === 'error').length;
  const networkFailures = networkSlice.filter((e) => e.status === 0 || e.status >= 400).length;

  const manifest: SessionManifest = {
    sessionId,
    label: recordingLabel ?? undefined,
    url: recordingUrl ?? undefined,
    gitBranch: recordingGitBranch ?? undefined,
    gitCommit: recordingGitCommit ?? undefined,
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    duration,
    commands: actions,
    screenshots: screenshotPaths.map((p) => path.basename(p)),
    video: videoFilename,
    errors: { console: consoleErrors, network: networkFailures, server: 0 },
  };

  // Write manifest
  const manifestPath = path.join(sessionDir, 'sweetlink-session.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.error(`[Daemon] Recording stopped: ${manifestPath}`);

  // Reset state
  recording = false;
  const result = manifest;
  sessionId = null;
  startedAt = null;
  actions = [];
  screenshotPaths = [];
  sessionDir = null;
  recordingContext = null;
  recordingPage = null;
  recordingVideoPath = null;
  recordingUrl = null;
  recordingGitBranch = null;
  recordingGitCommit = null;
  recordingLabel = null;
  paused = false;
  pausedAt = null;
  totalPausedMs = 0;

  return result;
}

/** Check if recording is in progress (returns true even when paused). */
export function isRecording(): boolean {
  return recording;
}

/** Check if recording is paused. */
export function isRecordingPaused(): boolean {
  return paused;
}

/**
 * Pause the active recording. Subsequent action logs are skipped, and the
 * paused window is subtracted from the manifest duration. The video
 * stream from Playwright keeps recording (Playwright's video API has no
 * pause primitive), but the action timeline is gapped honestly.
 */
export function pauseRecording(): { pausedAt: number } | null {
  if (!recording || paused) return null;
  paused = true;
  pausedAt = Date.now();
  return { pausedAt };
}

/** Resume a paused recording. */
export function resumeRecording(): { pausedDurationMs: number } | null {
  if (!recording || !paused || !pausedAt) return null;
  const delta = Date.now() - pausedAt;
  totalPausedMs += delta;
  paused = false;
  pausedAt = null;
  return { pausedDurationMs: delta };
}

/** Get recording status info. */
export function getRecordingStatus(): {
  recording: boolean;
  sessionId: string | null;
  duration: number | null;
  actionCount: number;
} {
  return {
    recording,
    sessionId,
    duration: startedAt ? (Date.now() - startedAt) / 1000 : null,
    actionCount: actions.length,
  };
}
