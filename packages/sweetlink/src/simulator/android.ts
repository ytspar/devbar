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

import { spawn, execFile, type ChildProcess } from 'child_process';
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
}

export interface AndroidRecordResult {
  output: string;
  device: string;
  exitCode: number;
  durationSec: number;
  recordingClosed: boolean;
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

export async function recordAndroidEmulator(options: AndroidRecordOptions): Promise<AndroidRecordResult> {
  const device = await findAndroidDevice(options.device);
  if (!device) {
    throw new Error(
      'No online Android device. Boot an emulator (`emulator -avd ...`) or connect a device.',
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
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let recStderr = '';
  recProc.stderr?.on('data', (d: Buffer) => { recStderr += d.toString(); });

  // Give screenrecord a moment to start and create the file.
  await new Promise((r) => setTimeout(r, 800));
  if (recProc.exitCode !== null) {
    throw new Error(`screenrecord failed to start on ${device}: ${recStderr.trim() || 'unknown error'}`);
  }

  const startedAt = Date.now();
  const cmdResult = await new Promise<{ exitCode: number }>((resolve) => {
    const child = spawn(options.shell ?? '/bin/sh', ['-c', options.command], {
      cwd: options.cwd,
      stdio: 'inherit',
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

  // Pull the file off the device. Wait a bit for screenrecord to fsync.
  await new Promise((r) => setTimeout(r, 500));
  await adb(['-s', device, 'pull', remotePath, options.output]);
  // Best-effort cleanup on the device.
  try { await adb(['-s', device, 'shell', 'rm', '-f', remotePath]); } catch { /* ignore */ }

  return {
    output: options.output,
    device,
    exitCode: cmdResult.exitCode,
    durationSec,
    recordingClosed: closed,
  };
}
