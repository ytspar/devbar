/**
 * iOS Simulator screen recording.
 *
 * Wraps `xcrun simctl io <device> recordVideo` so callers can capture the
 * Simulator screen while running an XCUITest / fastlane scan / any other
 * command. The command runs synchronously; while it runs we keep
 * recordVideo open as a child process and SIGINT it after the command
 * exits, which is the documented way to flush the .mp4.
 */

import { spawn, execFile, type ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface IosRecordOptions {
  /** Shell command to run while recording. */
  command: string;
  /** Output path. Should end in .mp4 — simctl can also write .mov. */
  output: string;
  /** Simulator UDID or device name. Defaults to the first booted simulator. */
  device?: string;
  /** Optional cwd for the command. */
  cwd?: string;
  /** Override shell. */
  shell?: string;
}

export interface IosRecordResult {
  output: string;
  device: string;
  exitCode: number;
  durationSec: number;
  /** True when the recordVideo process exited cleanly (mp4 fully flushed). */
  recordingClosed: boolean;
}

/** Run `xcrun simctl <args>` and return parsed JSON or text output. */
function simctl(args: string[], json: boolean = false): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('xcrun', ['simctl', ...args], { encoding: 'utf-8' }, (err, stdout, stderr) => {
      if (err) {
        const e = err as NodeJS.ErrnoException & { code?: string };
        if (e.code === 'ENOENT') {
          reject(new Error('xcrun is not on PATH. Install Xcode Command Line Tools.'));
        } else {
          reject(new Error(`simctl ${args.join(' ')} failed: ${stderr || err.message}`));
        }
        return;
      }
      resolve(json ? stdout : stdout.trim());
    });
  });
}

/**
 * Discover a usable simulator UDID.
 * Preference order: explicit `device` arg → first booted device → none.
 */
export async function findIosDevice(preference?: string): Promise<{ udid: string; name: string } | null> {
  const raw = await simctl(['list', 'devices', '--json'], true);
  const data = JSON.parse(raw) as {
    devices: Record<string, Array<{ udid: string; name: string; state: string; isAvailable: boolean }>>;
  };
  const all = Object.values(data.devices).flat().filter((d) => d.isAvailable);

  if (preference) {
    const match = all.find((d) =>
      d.udid === preference || d.name.toLowerCase() === preference.toLowerCase(),
    );
    if (match) return { udid: match.udid, name: match.name };
  }
  const booted = all.find((d) => d.state === 'Booted');
  if (booted) return { udid: booted.udid, name: booted.name };
  return null;
}

export async function recordIosSimulator(options: IosRecordOptions): Promise<IosRecordResult> {
  const device = await findIosDevice(options.device);
  if (!device) {
    throw new Error(
      'No booted iOS Simulator. Open Simulator.app or specify --device "iPhone 15".',
    );
  }

  await fs.mkdir(path.dirname(options.output), { recursive: true });

  // Start screen recording as a long-running child. `recordVideo` writes
  // the mp4 incrementally and flushes on SIGINT (cmd-C in interactive use).
  // simctl picks the container from the file extension; codec defaults
  // to hevc but h264 is more universally playable in browsers/HTML5.
  // --force overwrites the file if it already exists.
  const recProc: ChildProcess = spawn(
    'xcrun',
    ['simctl', 'io', device.udid, 'recordVideo', '--codec=h264', '--force', options.output],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  // Capture stderr in case the recording fails to start (e.g. "device not booted").
  let recStderr = '';
  recProc.stderr?.on('data', (d: Buffer) => { recStderr += d.toString(); });

  // Give simctl ~600ms to start the recording (it needs to attach to the
  // simulator's IOSurface). If it died early, surface the error now.
  await new Promise((r) => setTimeout(r, 600));
  if (recProc.exitCode !== null) {
    throw new Error(`recordVideo failed to start on ${device.name}: ${recStderr.trim() || 'unknown error'}`);
  }

  // Run the user's command and capture its exit code.
  const startedAt = Date.now();
  const cmdResult = await new Promise<{ exitCode: number }>((resolve) => {
    const child = spawn(options.shell ?? '/bin/sh', ['-c', options.command], {
      cwd: options.cwd,
      stdio: 'inherit',
    });
    child.on('close', (code) => resolve({ exitCode: code ?? 0 }));
  });
  const durationSec = (Date.now() - startedAt) / 1000;

  // Stop recording: SIGINT triggers simctl's flush-and-exit path. SIGTERM
  // would also work but truncates the trailing buffer.
  const closed = await new Promise<boolean>((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        // Recording didn't shut down within 5s — kill it forcefully.
        try { recProc.kill('SIGKILL'); } catch { /* ignore */ }
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
    try { recProc.kill('SIGINT'); } catch { /* ignore */ }
  });

  return {
    output: options.output,
    device: device.name,
    exitCode: cmdResult.exitCode,
    durationSec,
    recordingClosed: closed,
  };
}
