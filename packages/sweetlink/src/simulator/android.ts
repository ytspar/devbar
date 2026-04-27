/**
 * Android Emulator screen recording via `adb shell screenrecord`.
 *
 * `adb shell screenrecord` records to a file ON THE EMULATOR and stops on
 * SIGINT. Maximum length is 180 seconds (an Android limitation, not ours)
 * — we surface that as a clear error if the user requests longer.
 *
 * Workflow:
 *   1. Pick a device (preference → first online emulator)
 *   2. Start `adb shell screenrecord /sdcard/sl-<stamp>.mp4` as a child
 *   3. Run the user's test command
 *   4. SIGINT screenrecord, wait for it to flush
 *   5. `adb pull` the .mp4 off the emulator to the user-requested output
 */

import { type ChildProcess, execFile, spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface AndroidRecordOptions {
  command: string;
  output: string;
  /** Device serial. Defaults to the first online emulator. */
  device?: string;
  cwd?: string;
  shell?: string;
  /** Recording cap in seconds. Android caps at 180; we default to that. */
  timeLimit?: number;
  /**
   * When true (default), capture tap events via `adb shell getevent -l`
   * and post-process the .mp4 with ffmpeg to overlay red rings at each
   * tap. Falls back to writing only the sidecar JSON if ffmpeg is
   * missing — the raw recording is still produced.
   */
  overlays?: boolean;
  /**
   * When true, the spawned command sees the full process.env. Default
   * false: only a minimal allowlist is forwarded to keep secrets out of
   * the recorded artifact.
   */
  inheritEnv?: boolean;
}

const MINIMAL_ENV_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'SHELL',
  'TZ',
  'TMPDIR',
  'PWD',
];

function pickMinimalEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of MINIMAL_ENV_KEYS) {
    const v = process.env[key];
    if (typeof v === 'string') out[key] = v;
  }
  return out;
}

/**
 * Poll `adb shell stat -c %s <remotePath>` until the size is stable across
 * two consecutive checks (or until we run out of attempts). Replaces a
 * blind 500ms sleep — on slow physical devices, fuse-backed /sdcard, or
 * USB-1 connections, the H.264 trailer can take several seconds to flush.
 */
async function waitForStableSize(device: string, remotePath: string): Promise<void> {
  let last = -1;
  for (let i = 0; i < 20; i++) {
    try {
      const out = await new Promise<string>((resolve, reject) => {
        execFile(
          'adb',
          ['-s', device, 'shell', 'stat', '-c', '%s', remotePath],
          { encoding: 'utf-8' },
          (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout);
          }
        );
      });
      const size = parseInt(out.trim(), 10);
      if (Number.isFinite(size) && size > 0 && size === last) return;
      last = size;
    } catch {
      // stat occasionally races screenrecord's create; keep polling.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

export interface AndroidRecordResult {
  output: string;
  device: string;
  exitCode: number;
  durationSec: number;
  recordingClosed: boolean;
  /** Number of taps captured during the run. */
  tapCount?: number;
  /** Path to the .taps.json sidecar describing each captured tap. */
  tapsJsonPath?: string;
  /** True when ffmpeg was used to render tap rings into the .mp4. */
  overlaysApplied?: boolean;
}

function adb(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('adb', args, { encoding: 'utf-8' }, (err, stdout, stderr) => {
      if (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === 'ENOENT') {
          reject(new Error('adb is not on PATH. Install Android Platform Tools.'));
        } else {
          reject(new Error(`adb ${args.join(' ')} failed: ${stderr || err.message}`));
        }
        return;
      }
      resolve(stdout);
    });
  });
}

/** Returns the first online emulator/device serial, optionally filtered by a preference. */
export async function findAndroidDevice(preference?: string): Promise<string | null> {
  const out = await adb(['devices']);
  // Lines: "<serial>\tdevice"  (skip header)
  const devices = out
    .split('\n')
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l.endsWith('\tdevice'))
    .map((l) => l.split('\t')[0]!)
    .filter(Boolean);

  if (preference && devices.includes(preference)) return preference;
  return devices[0] ?? null;
}

export async function recordAndroidEmulator(
  options: AndroidRecordOptions
): Promise<AndroidRecordResult> {
  const device = await findAndroidDevice(options.device);
  if (!device) {
    throw new Error(
      'No online Android device. Boot an emulator (`emulator -avd ...`) or connect a device.'
    );
  }

  const timeLimit = Math.min(options.timeLimit ?? 180, 180);
  await fs.mkdir(path.dirname(options.output), { recursive: true });

  // Pick a unique remote path so concurrent recordings don't collide.
  const remotePath = `/sdcard/sl-record-${Date.now()}.mp4`;

  // Start screen recording on the device. screenrecord exits on its own
  // at the time-limit OR on SIGINT.
  const recProc: ChildProcess = spawn(
    'adb',
    ['-s', device, 'shell', 'screenrecord', '--time-limit', String(timeLimit), remotePath],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let recStderr = '';
  recProc.stderr?.on('data', (d: Buffer) => {
    recStderr += d.toString();
  });

  // Give screenrecord a moment to start and create the file.
  await new Promise((r) => setTimeout(r, 800));
  if (recProc.exitCode !== null) {
    throw new Error(
      `screenrecord failed to start on ${device}: ${recStderr.trim() || 'unknown error'}`
    );
  }

  // Optionally start tap-event capture. Best-effort — if the touchscreen
  // probe fails (e.g. unusual input device layout), we still produce the
  // raw recording, just without overlays.
  const wantOverlays = options.overlays !== false;
  let tapCapture: {
    proc: ChildProcess;
    taps: Array<{ x: number; y: number; t: number }>;
    done: Promise<void>;
  } | null = null;
  if (wantOverlays) {
    try {
      const { findTouchDevice, captureTapsLive } = await import('./androidTaps.js');
      const info = await findTouchDevice(device);
      // Note: startMs is captured *now* so tap timestamps line up with the
      // recording's t=0. screenrecord starts ~800ms before this point but
      // its earliest frame is the moment recording engaged on the device.
      tapCapture = captureTapsLive(device, info, Date.now());
    } catch (err) {
      console.error(
        `[Sweetlink] Could not start tap capture: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  const startedAt = Date.now();
  const cmdResult = await new Promise<{ exitCode: number }>((resolve) => {
    const child = spawn(options.shell ?? '/bin/sh', ['-c', options.command], {
      cwd: options.cwd,
      stdio: 'inherit',
      env: options.inheritEnv
        ? (process.env as NodeJS.ProcessEnv)
        : (pickMinimalEnv() as NodeJS.ProcessEnv),
    });
    // Without an `error` handler, a missing shell or bad cwd would crash
    // the parent process and orphan recProc + tapCapture.proc on the device.
    child.on('error', (err) => {
      console.error(`[Sweetlink] Failed to spawn user command: ${err.message}`);
      resolve({ exitCode: 127 });
    });
    child.on('close', (code) => resolve({ exitCode: code ?? 0 }));
  });
  const durationSec = (Date.now() - startedAt) / 1000;

  // Stop and flush.
  const closed = await new Promise<boolean>((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          recProc.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        resolve(false);
      }
    }, 5_000);
    recProc.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(true);
      }
    });
    try {
      recProc.kill('SIGINT');
    } catch {
      /* ignore */
    }
  });

  // Pull the file off the device. Poll for stat-size stability — a fixed
  // sleep is unreliable on slow devices, USB-1, or fuse-backed /sdcard.
  // Without this, `adb pull` happily copies a partial file and silently
  // hands the user a truncated .mp4.
  await waitForStableSize(device, remotePath);
  await adb(['-s', device, 'pull', remotePath, options.output]);
  // Best-effort cleanup on the device.
  try {
    await adb(['-s', device, 'shell', 'rm', '-f', remotePath]);
  } catch {
    /* ignore */
  }

  // Stop tap capture and write sidecar JSON + (optionally) ffmpeg overlay.
  let tapCount: number | undefined;
  let tapsJsonPath: string | undefined;
  let overlaysApplied = false;
  if (tapCapture) {
    try {
      tapCapture.proc.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    // Wait for the listener to actually exit + flush its trailing buffer
    // (taps that landed in the last few hundred ms before SIGTERM). If it
    // doesn't close in 2s, force-kill so we don't hang the CLI on a
    // wedged adb shell.
    await Promise.race([
      tapCapture.done,
      new Promise<void>((resolve) =>
        setTimeout(() => {
          try {
            tapCapture?.proc.kill('SIGKILL');
          } catch {
            /* ignore */
          }
          resolve();
        }, 2_000)
      ),
    ]);
    const taps = tapCapture.taps;
    tapCount = taps.length;

    // Sidecar JSON (always written when capture was attempted).
    tapsJsonPath = `${options.output.replace(/\.mp4$/i, '')}.taps.json`;
    await fs.writeFile(tapsJsonPath, JSON.stringify({ taps }, null, 2));

    // Apply overlays via ffmpeg when available.
    if (taps.length > 0) {
      const { hasFfmpeg, applyTapOverlays } = await import('./overlay.js');
      if (await hasFfmpeg()) {
        try {
          const overlayedPath = `${options.output.replace(/\.mp4$/i, '')}.overlayed.mp4`;
          await applyTapOverlays({ inputPath: options.output, outputPath: overlayedPath, taps });
          // Replace the original with the overlayed version.
          await fs.unlink(options.output);
          await fs.rename(overlayedPath, options.output);
          overlaysApplied = true;
        } catch (err) {
          console.error(
            `[Sweetlink] Tap overlay rendering failed: ${err instanceof Error ? err.message : err}` +
              ` (raw recording is preserved at ${options.output})`
          );
        }
      } else {
        console.error(
          `[Sweetlink] Captured ${taps.length} taps but ffmpeg is not on PATH — overlay skipped. ` +
            `Sidecar JSON written to ${tapsJsonPath}.`
        );
      }
    }
  }

  return {
    output: options.output,
    device,
    exitCode: cmdResult.exitCode,
    durationSec,
    tapCount,
    tapsJsonPath,
    overlaysApplied,
    recordingClosed: closed,
  };
}
