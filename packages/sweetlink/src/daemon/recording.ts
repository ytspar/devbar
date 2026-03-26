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
import { installListeners } from './listeners.js';

type Browser = import('playwright').Browser;
type BrowserContext = import('playwright').BrowserContext;
type Page = import('playwright').Page;

// ============================================================================
// Constants
// ============================================================================

const RECORDING_VIEWPORT = { width: 1280, height: 720 };

// ============================================================================
// State
// ============================================================================

let recording = false;
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
  outputDir: string
): Promise<{ sessionId: string }> {
  if (recording) {
    throw new Error('Recording already in progress. Stop it first.');
  }

  sessionId = `session-${Date.now()}`;
  sessionDir = path.join(outputDir, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });

  // Create a new context with video recording
  recordingContext = await browser.newContext({
    viewport: RECORDING_VIEWPORT,
    recordVideo: {
      dir: sessionDir,
      size: RECORDING_VIEWPORT,
    },
  });

  recordingPage = await recordingContext.newPage();

  // Install cursor highlight so clicks are visible in the video
  await installCursorHighlight(recordingPage);

  // Install event listeners for ring buffer capture during recording
  installListeners(recordingPage);

  // Navigate to the same URL
  await recordingPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  recording = true;
  startedAt = Date.now();
  actions = [];
  screenshotPaths = [];
  recordingUrl = url;
  const git = detectGit();
  recordingGitBranch = git.branch;
  recordingGitCommit = git.commit;

  console.error(`[Daemon] Recording started: ${sessionId} (video: ${RECORDING_VIEWPORT.width}x${RECORDING_VIEWPORT.height})`);
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
  boundingBox?: { x: number; y: number; width: number; height: number }
): Promise<void> {
  if (!recording || !startedAt || !sessionDir) return;

  const timestamp = (Date.now() - startedAt) / 1000;
  const screenshotName = `action-${actions.length}.png`;
  const screenshotPath = path.join(sessionDir, screenshotName);

  try {
    const buffer = await page.screenshot();
    await fs.writeFile(screenshotPath, buffer);
    screenshotPaths.push(screenshotPath);
  } catch {
    // Screenshot may fail if page is navigating
  }

  actions.push({
    timestamp,
    action,
    args,
    duration: 0,
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

  const endedAt = Date.now();
  const duration = (endedAt - startedAt) / 1000;

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

  const manifest: SessionManifest = {
    sessionId,
    url: recordingUrl ?? undefined,
    gitBranch: recordingGitBranch ?? undefined,
    gitCommit: recordingGitCommit ?? undefined,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    duration,
    commands: actions,
    screenshots: screenshotPaths.map((p) => path.basename(p)),
    video: videoFilename,
    errors: { console: 0, network: 0, server: 0 },
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

  return result;
}

/** Check if recording is in progress. */
export function isRecording(): boolean {
  return recording;
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
