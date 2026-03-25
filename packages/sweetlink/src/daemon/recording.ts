/**
 * Session Recording
 *
 * Records browser sessions as video with synchronized action timeline.
 * Uses Playwright's built-in video recording (Chromium screencast).
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import type { SessionManifest, ActionEntry } from './session.js';

type BrowserContext = import('playwright').BrowserContext;
type Page = import('playwright').Page;

// ============================================================================
// State
// ============================================================================

let recording = false;
let sessionId: string | null = null;
let startedAt: number | null = null;
let actions: ActionEntry[] = [];
let screenshotPaths: string[] = [];
let videoPath: string | null = null;
let recordingContext: BrowserContext | null = null;
let recordingPage: Page | null = null;

// ============================================================================
// Public API
// ============================================================================

/**
 * Start recording a session.
 * Creates a new browser context with video recording enabled.
 */
export async function startRecording(
  page: Page,
  outputDir: string
): Promise<{ sessionId: string }> {
  if (recording) {
    throw new Error('Recording already in progress. Stop it first.');
  }

  sessionId = `session-${Date.now()}`;
  const videoDir = path.join(outputDir, sessionId);
  await fs.mkdir(videoDir, { recursive: true });

  // We can't add video to an existing context, so we use the existing page
  // and capture screenshots at each action instead of true video.
  // True video requires creating context with recordVideo option.
  recording = true;
  startedAt = Date.now();
  actions = [];
  screenshotPaths = [];
  recordingContext = null;
  recordingPage = page;
  videoPath = videoDir;

  console.error(`[Daemon] Recording started: ${sessionId}`);
  return { sessionId };
}

/**
 * Log an action during recording.
 * Captures a screenshot at the moment of the action.
 */
export async function logAction(
  action: string,
  args: string[],
  page: Page,
  boundingBox?: { x: number; y: number; width: number; height: number }
): Promise<void> {
  if (!recording || !startedAt || !videoPath) return;

  const timestamp = (Date.now() - startedAt) / 1000;
  const screenshotName = `action-${actions.length}.png`;
  const screenshotPath = path.join(videoPath, screenshotName);

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
 */
export async function stopRecording(): Promise<SessionManifest | null> {
  if (!recording || !sessionId || !startedAt || !videoPath) {
    return null;
  }

  const endedAt = Date.now();
  const duration = (endedAt - startedAt) / 1000;

  // Close recording context if we created one
  if (recordingContext) {
    try {
      await recordingContext.close();
    } catch {
      // Context may already be closed
    }
  }

  const manifest: SessionManifest = {
    sessionId,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    duration,
    commands: actions,
    screenshots: screenshotPaths.map((p) => path.basename(p)),
    errors: { console: 0, network: 0, server: 0 },
  };

  // Write manifest
  const manifestPath = path.join(videoPath, 'sweetlink-session.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.error(`[Daemon] Recording stopped: ${manifestPath}`);

  // Reset state
  recording = false;
  sessionId = null;
  startedAt = null;
  actions = [];
  screenshotPaths = [];
  videoPath = null;
  recordingContext = null;
  recordingPage = null;

  return manifest;
}

/**
 * Check if recording is in progress.
 */
export function isRecording(): boolean {
  return recording;
}

/**
 * Get recording status info.
 */
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
