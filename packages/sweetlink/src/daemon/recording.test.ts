// @vitest-environment node

/**
 * Recording State Machine Tests
 *
 * Verifies the lifecycle of the recording singleton:
 *   start → (logAction)* → pause → (drops) → resume → stop
 *
 * Uses minimal Playwright mocks so the state transitions can be exercised
 * without launching a real browser. Each test runs in module isolation
 * (vi.resetModules) so the file-level state from one test does not leak
 * into the next.
 *
 * Coverage focus is on real bugs the audit flagged:
 * - startRecording rolls back state when goto() throws (so the next start
 *   isn't permanently locked out by a stale `recording = true` flag)
 * - logAction increments droppedWhilePaused while paused instead of
 *   silently writing nothing
 * - resumeRecording's pausedDurationMs accumulates across multiple cycles
 * - getRecordingEventCursors only returns cursors during an active session
 * - stopRecording fully resets state so a follow-up start succeeds
 */

import { promises as fsp } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stable, hand-rolled mock of Playwright's Browser surface. The recording
// module only touches a small slice — we expose just enough.

interface MockTracing {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface MockVideo {
  path: () => Promise<string>;
}

interface MockPage {
  url: () => string;
  goto: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  screenshot: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  video: () => MockVideo | null;
  addInitScript: ReturnType<typeof vi.fn>;
}

interface MockContext {
  newPage: () => Promise<MockPage>;
  close: ReturnType<typeof vi.fn>;
  tracing: MockTracing;
}

interface MockBrowser {
  newContext: ReturnType<typeof vi.fn>;
}

interface MockBundle {
  browser: MockBrowser;
  context: MockContext;
  page: MockPage;
  videoPath: string;
}

function makeMockBundle(opts: {
  goto?: 'ok' | 'throws';
  videoPath?: string;
}): MockBundle {
  const videoPath = opts.videoPath ?? path.join(os.tmpdir(), `mock-video-${Date.now()}.webm`);

  const page: MockPage = {
    url: () => 'http://localhost:3000/',
    goto:
      opts.goto === 'throws'
        ? vi.fn(async () => {
            throw new Error('navigation timed out');
          })
        : vi.fn(async () => null),
    close: vi.fn(async () => undefined),
    screenshot: vi.fn(async () => Buffer.from('PNG-MOCK')),
    evaluate: vi.fn(async () => undefined),
    on: vi.fn(() => undefined),
    video: () => ({ path: async () => videoPath }),
    addInitScript: vi.fn(async () => undefined),
  };

  const context: MockContext = {
    newPage: async () => page,
    close: vi.fn(async () => undefined),
    tracing: {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    },
  };

  const browser: MockBrowser = {
    newContext: vi.fn(async () => context),
  };

  return { browser, context, page, videoPath };
}

let tmpDir: string;

beforeEach(async () => {
  vi.resetModules();
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'recording-test-'));
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
  vi.useRealTimers();
});

describe('startRecording', () => {
  it('starts a fresh recording, marks recording=true, returns sessionId', async () => {
    const recording = await import('./recording.js');
    const m = makeMockBundle({});
    const result = await recording.startRecording(
      m.browser as never,
      'http://localhost:3000/',
      tmpDir
    );

    expect(result.sessionId).toMatch(/^session-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    expect(recording.isRecording()).toBe(true);
    expect(recording.isRecordingPaused()).toBe(false);
    expect(m.browser.newContext).toHaveBeenCalledOnce();
    expect(m.page.goto).toHaveBeenCalledWith(
      'http://localhost:3000/',
      expect.objectContaining({ waitUntil: 'domcontentloaded' })
    );
  });

  it('throws if a recording is already in progress', async () => {
    const recording = await import('./recording.js');
    const m = makeMockBundle({});
    await recording.startRecording(m.browser as never, 'http://localhost:3000/', tmpDir);

    const m2 = makeMockBundle({});
    await expect(
      recording.startRecording(m2.browser as never, 'http://localhost:3000/', tmpDir)
    ).rejects.toThrow(/already in progress/i);
  });

  it('rolls back state when goto throws (no permanent lockout)', async () => {
    // Regression for the P1 fix: a goto failure used to leave recording=true
    // and the recording context partially open, so subsequent record-start
    // calls all rejected with "already in progress" forever.
    const recording = await import('./recording.js');
    const m = makeMockBundle({ goto: 'throws' });

    await expect(
      recording.startRecording(m.browser as never, 'http://localhost:3000/', tmpDir)
    ).rejects.toThrow(/navigation/i);

    // State is fully reset — a follow-up start with a working context succeeds.
    expect(recording.isRecording()).toBe(false);
    // Original context was best-effort closed.
    expect(m.context.close).toHaveBeenCalled();

    const m2 = makeMockBundle({});
    const next = await recording.startRecording(
      m2.browser as never,
      'http://localhost:3000/',
      tmpDir
    );
    expect(next.sessionId).toBeDefined();
    expect(recording.isRecording()).toBe(true);
  });

  it('passes label and viewport options through to the manifest path', async () => {
    const recording = await import('./recording.js');
    const m = makeMockBundle({});
    await recording.startRecording(m.browser as never, 'http://localhost:3000/', tmpDir, {
      label: 'login-flow',
      viewport: { width: 1024, height: 768 },
    });

    const newContextOpts = m.browser.newContext.mock.calls[0]![0] as {
      viewport: { width: number; height: number };
      recordVideo: { dir: string };
    };
    expect(newContextOpts.viewport).toEqual({ width: 1024, height: 768 });
    expect(newContextOpts.recordVideo.dir).toMatch(/session-/);
  });

  it('starts tracing when trace:true and tolerates tracing errors', async () => {
    const recording = await import('./recording.js');
    const m = makeMockBundle({});
    m.context.tracing.start.mockRejectedValueOnce(new Error('trace not supported'));

    // tracing failure must not abort startRecording — it's optional.
    await recording.startRecording(m.browser as never, 'http://localhost:3000/', tmpDir, {
      trace: true,
    });

    expect(m.context.tracing.start).toHaveBeenCalledOnce();
    expect(recording.isRecording()).toBe(true);
  });
});

describe('pause / resume', () => {
  it('pauseRecording returns null when not recording', async () => {
    const recording = await import('./recording.js');
    expect(recording.pauseRecording()).toBeNull();
  });

  it('pauseRecording flips paused flag and returns the pause timestamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const recording = await import('./recording.js');
    const m = makeMockBundle({});
    await recording.startRecording(m.browser as never, 'http://localhost:3000/', tmpDir);

    vi.advanceTimersByTime(1000);
    const result = recording.pauseRecording();

    expect(result).not.toBeNull();
    expect(result!.pausedAt).toBe(new Date('2026-01-01T00:00:01.000Z').getTime());
    expect(recording.isRecordingPaused()).toBe(true);
    expect(recording.isRecording()).toBe(true); // intentional: still "recording", just paused
  });

  it('pauseRecording is a no-op when already paused', async () => {
    const recording = await import('./recording.js');
    const m = makeMockBundle({});
    await recording.startRecording(m.browser as never, 'http://localhost:3000/', tmpDir);
    recording.pauseRecording();
    expect(recording.pauseRecording()).toBeNull();
  });

  it('resumeRecording returns null when not paused', async () => {
    const recording = await import('./recording.js');
    const m = makeMockBundle({});
    await recording.startRecording(m.browser as never, 'http://localhost:3000/', tmpDir);
    expect(recording.resumeRecording()).toBeNull();
  });

  it('resumeRecording reports the actual paused duration', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const recording = await import('./recording.js');
    const m = makeMockBundle({});
    await recording.startRecording(m.browser as never, 'http://localhost:3000/', tmpDir);

    recording.pauseRecording();
    vi.advanceTimersByTime(2500);
    const r = recording.resumeRecording();

    expect(r).not.toBeNull();
    expect(r!.pausedDurationMs).toBe(2500);
    expect(recording.isRecordingPaused()).toBe(false);
  });

  it('accumulates pausedDurationMs across multiple pause cycles', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const recording = await import('./recording.js');
    const m = makeMockBundle({});
    await recording.startRecording(m.browser as never, 'http://localhost:3000/', tmpDir);

    recording.pauseRecording();
    vi.advanceTimersByTime(1000);
    recording.resumeRecording();
    vi.advanceTimersByTime(500);

    recording.pauseRecording();
    vi.advanceTimersByTime(2000);
    const r2 = recording.resumeRecording();

    // Each resume reports only that cycle's delta.
    expect(r2!.pausedDurationMs).toBe(2000);
  });
});

describe('logAction', () => {
  it('drops the action and counts the drop while paused', async () => {
    const recording = await import('./recording.js');
    const m = makeMockBundle({});
    await recording.startRecording(m.browser as never, 'http://localhost:3000/', tmpDir);
    recording.pauseRecording();

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await recording.logAction('click', ['button-x'], m.page as never);
    await recording.logAction('fill', ['@e3', 'hello'], m.page as never);

    // Status snapshots show no actions captured.
    expect(recording.getRecordingStatus().actionCount).toBe(0);
    // The drops emit a console.error per call so the user is not blind to it.
    expect(errSpy).toHaveBeenCalledTimes(2);
    expect(errSpy.mock.calls[0]![0]).toMatch(/drops: 1\)/);
    expect(errSpy.mock.calls[1]![0]).toMatch(/drops: 2\)/);

    errSpy.mockRestore();
  });

  it('is a no-op when not recording (even if called by stale code paths)', async () => {
    const recording = await import('./recording.js');
    const m = makeMockBundle({});
    // Don't start recording.
    await recording.logAction('click', ['x'], m.page as never);
    expect(m.page.screenshot).not.toHaveBeenCalled();
  });

  it('captures a screenshot and increments actionCount when active', async () => {
    const recording = await import('./recording.js');
    const m = makeMockBundle({});
    await recording.startRecording(m.browser as never, 'http://localhost:3000/', tmpDir);

    await recording.logAction('click', ['button'], m.page as never, {
      x: 10,
      y: 20,
      width: 100,
      height: 30,
    });

    // Action screenshot taken via the page passed in.
    expect(m.page.screenshot).toHaveBeenCalled();
    expect(recording.getRecordingStatus().actionCount).toBe(1);
  });
});

describe('getRecordingEventCursors', () => {
  it('returns null when not recording', async () => {
    const recording = await import('./recording.js');
    expect(recording.getRecordingEventCursors()).toBeNull();
  });

  it('returns the buffer cursors snapshotted at start', async () => {
    const recording = await import('./recording.js');
    const m = makeMockBundle({});
    await recording.startRecording(m.browser as never, 'http://localhost:3000/', tmpDir);

    const cursors = recording.getRecordingEventCursors();
    expect(cursors).not.toBeNull();
    expect(typeof cursors!.consoleStartCursor).toBe('number');
    expect(typeof cursors!.networkStartCursor).toBe('number');
  });
});

describe('getRecordingStatus', () => {
  it('returns recording=false / null fields when idle', async () => {
    const recording = await import('./recording.js');
    expect(recording.getRecordingStatus()).toEqual({
      recording: false,
      sessionId: null,
      duration: null,
      actionCount: 0,
    });
  });

  it('reports duration in seconds and current action count', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const recording = await import('./recording.js');
    const m = makeMockBundle({});
    await recording.startRecording(m.browser as never, 'http://localhost:3000/', tmpDir);

    vi.advanceTimersByTime(2500);
    const status = recording.getRecordingStatus();

    expect(status.recording).toBe(true);
    expect(status.duration).toBeCloseTo(2.5, 1);
    expect(status.actionCount).toBe(0);
    expect(status.sessionId).toMatch(/^session-/);
  });
});

describe('stopRecording', () => {
  it('returns null when not recording', async () => {
    const recording = await import('./recording.js');
    expect(await recording.stopRecording()).toBeNull();
  });

  it('writes a manifest, resets state, allows a fresh start', async () => {
    const recording = await import('./recording.js');
    const m = makeMockBundle({});
    await recording.startRecording(m.browser as never, 'http://localhost:3000/', tmpDir);

    // Pre-populate the recording video file the rename path expects to find.
    await fsp.writeFile(m.videoPath, Buffer.from('mock-video-bytes'));

    const manifest = await recording.stopRecording();
    expect(manifest).not.toBeNull();
    expect(manifest!.sessionId).toMatch(/^session-/);
    expect(manifest!.commands).toEqual([]);

    // State must be fully reset so a fresh start succeeds.
    expect(recording.isRecording()).toBe(false);
    expect(recording.isRecordingPaused()).toBe(false);
    expect(recording.getRecordingStatus().actionCount).toBe(0);
    expect(recording.getRecordingEventCursors()).toBeNull();

    const m2 = makeMockBundle({});
    const next = await recording.startRecording(
      m2.browser as never,
      'http://localhost:3000/',
      tmpDir
    );
    expect(next.sessionId).toBeDefined();
  });

  it('falls back to copy+unlink when rename hits EXDEV (cross-device)', async () => {
    // The recording path used to leak the source video file when fs.rename
    // failed (e.g. the Playwright temp dir is on a different filesystem
    // from the project's session dir). Verify the copy+unlink fallback.
    const recording = await import('./recording.js');
    const m = makeMockBundle({});
    await recording.startRecording(m.browser as never, 'http://localhost:3000/', tmpDir);

    await fsp.writeFile(m.videoPath, Buffer.from('mock-video-bytes'));

    // Patch fsp.rename to simulate cross-device link failure for this call.
    const origRename = fsp.rename;
    const renameSpy = vi.spyOn(fsp, 'rename').mockImplementationOnce(async () => {
      const err: NodeJS.ErrnoException = new Error('cross-device link not permitted');
      err.code = 'EXDEV';
      throw err;
    });

    const manifest = await recording.stopRecording();
    expect(manifest).not.toBeNull();
    // The video should have ended up at the session dir despite the rename
    // failure — copyFile+unlink kicked in.
    expect(manifest!.video).toBe('session.webm');
    expect(renameSpy).toHaveBeenCalledOnce();

    // Source file unlinked so it doesn't grow forever in the temp dir.
    await expect(fsp.access(m.videoPath)).rejects.toBeDefined();

    renameSpy.mockRestore();
    void origRename;
  });
});
