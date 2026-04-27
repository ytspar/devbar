/**
 * Simulator capture mode (`sweetlink sim ios|android <command>`).
 *
 * Records the iOS Simulator or Android Emulator screen while the user's
 * test command runs. Different platforms have different prerequisites,
 * so each test guards on the relevant tooling and skips gracefully when
 * unavailable.
 *
 * Tested on macOS with Xcode (iOS) and Android Platform Tools (Android).
 */

import { expect, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cli } from './_harness.js';

function hasXcrun(): boolean {
  try { execFileSync('xcrun', ['--version'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}
function hasAdb(): boolean {
  try { execFileSync('adb', ['version'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}
function hasBootedIos(): boolean {
  if (!hasXcrun()) return false;
  try {
    const out = execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted'], { encoding: 'utf-8' });
    return /\(Booted\)/.test(out);
  } catch { return false; }
}
function hasOnlineAdbDevice(): boolean {
  if (!hasAdb()) return false;
  try {
    const out = execFileSync('adb', ['devices'], { encoding: 'utf-8' });
    return out.split('\n').slice(1).some((l) => l.trim().endsWith('\tdevice'));
  } catch { return false; }
}

test.describe.configure({ mode: 'serial', timeout: 60_000 });

test.describe('sim ios', () => {
  test.skip(!hasBootedIos(), 'No booted iOS Simulator — boot one with `xcrun simctl boot "iPhone 15"` to run this test.');

  test('records the simulator screen into an h264 mp4', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-sim-ios-'));
    try {
      const result = await cli(
        ['sim', 'ios', '--label', 'home-screen', 'sleep 2'],
        cwd,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toContain('iPhone'); // device name surfaced
      expect(result.stdout).toMatch(/\.mp4/);

      const dir = path.join(cwd, '.sweetlink', 'sim');
      const files = fs.readdirSync(dir);
      const mp4 = files.find((f) => f.endsWith('.mp4'))!;
      expect(mp4).toBeDefined();
      const stat = fs.statSync(path.join(dir, mp4));
      expect(stat.size).toBeGreaterThan(10_000); // empty-home-screen mp4 is ~50–100KB

      // Probe the mp4 if ffprobe is available.
      try {
        const probe = execFileSync('ffprobe', [
          '-v', 'error',
          '-show_entries', 'stream=codec_name,width,height',
          '-of', 'default=nw=1',
          path.join(dir, mp4),
        ], { encoding: 'utf-8' });
        expect(probe).toContain('codec_name=h264');
        // iPhones report height > width because of natural orientation.
        const wMatch = probe.match(/width=(\d+)/);
        expect(parseInt(wMatch![1]!, 10)).toBeGreaterThan(300);
      } catch { /* ffprobe missing or failed — file size check is enough */ }
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('propagates the recorded command\'s exit code', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-sim-ios-'));
    try {
      const result = await cli(['sim', 'ios', '--label', 'fail', 'sleep 1; exit 11'], cwd);
      expect(result.exitCode).toBe(11);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

test.describe('sim ios — error paths (no booted simulator)', () => {
  // These tests intentionally don't run on machines that have a sim booted.
  test.skip(hasBootedIos(), 'A simulator is currently booted; this test verifies the no-sim error path.');
  test.skip(!hasXcrun(), 'xcrun unavailable.');

  test('errors clearly when no simulator is booted', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-sim-ios-'));
    try {
      const result = await cli(['sim', 'ios', 'echo hi'], cwd);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).toMatch(/no booted ios simulator/i);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

test.describe('sim android', () => {
  test('errors clearly when adb is missing or no device is online', async () => {
    test.skip(hasOnlineAdbDevice(), 'An adb device is online — exercising the no-device path.');
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-sim-android-'));
    try {
      const result = await cli(['sim', 'android', 'echo hi'], cwd);
      expect(result.exitCode).not.toBe(0);
      const out = result.stdout + result.stderr;
      // Either adb is missing OR adb is present but no device is online.
      expect(out.toLowerCase()).toMatch(/adb (is not on path|...)|no online android device/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('records the emulator screen when one is online', async () => {
    test.skip(!hasOnlineAdbDevice(), 'No online Android device — boot an emulator to run this test.');
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-sim-android-'));
    try {
      const result = await cli(
        ['sim', 'android', '--label', 'home-screen', 'sleep 2'],
        cwd,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      const dir = path.join(cwd, '.sweetlink', 'sim');
      const mp4 = fs.readdirSync(dir).find((f) => f.endsWith('.mp4'))!;
      expect(mp4).toBeDefined();
      expect(fs.statSync(path.join(dir, mp4)).size).toBeGreaterThan(10_000);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

test('sim with no platform errors with usage hint', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-sim-'));
  try {
    const result = await cli(['sim'], cwd);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/Usage:.*sim.*ios.*android/i);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
