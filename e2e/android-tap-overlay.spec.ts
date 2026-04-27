/**
 * Android tap-overlay rendering — exercises the ffmpeg overlay path end-
 * to-end without needing a running emulator. We synthesise a small black
 * mp4 with `ffmpeg -f lavfi -i color=...`, hand-craft a few tap events,
 * call `applyTapOverlays`, and visually inspect the resulting frames to
 * confirm the red rings appear at the right times.
 *
 * Skipped when ffmpeg isn't on PATH (CI machines may lack it).
 */

import { expect, test } from '@playwright/test';
import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function hasFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const ARTIFACT_DIR = '/tmp/sweetlink-e2e-artifacts/android-tap-overlay';

test.describe.configure({ mode: 'serial', timeout: 60_000 });

test.skip(
  !hasFfmpeg(),
  'ffmpeg not on PATH — overlay rendering can be exercised by installing ffmpeg.'
);

test('applyTapOverlays composites red rings onto a synthetic mp4', async () => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-overlay-'));

  try {
    // 1. Generate a 3s black 480×640 mp4 via ffmpeg's lavfi color source.
    const inputMp4 = path.join(tmp, 'input.mp4');
    const inputResult = spawnSync(
      'ffmpeg',
      [
        '-f',
        'lavfi',
        '-i',
        'color=color=black:size=480x640:duration=3',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-y',
        inputMp4,
      ],
      { stdio: 'ignore' }
    );
    expect(inputResult.status, 'ffmpeg synth failed').toBe(0);

    // 2. Apply two taps at t=0.5 and t=2.0.
    const outputMp4 = path.join(tmp, 'output.mp4');
    const { applyTapOverlays } = await import('../packages/sweetlink/src/simulator/overlay.js');
    await applyTapOverlays({
      inputPath: inputMp4,
      outputPath: outputMp4,
      taps: [
        { x: 120, y: 200, t: 0.5 },
        { x: 360, y: 480, t: 2.0 },
      ],
    });
    expect(fs.existsSync(outputMp4)).toBe(true);
    expect(fs.statSync(outputMp4).size).toBeGreaterThan(1000);

    // 3. Extract three frames: pre-tap (t=0.1), during-tap-1 (t=0.7),
    //    during-tap-2 (t=2.2). The "during" frames must contain red
    //    pixels; the "pre" frame must not.
    const extract = (tSec: number, name: string): string => {
      const out = path.join(ARTIFACT_DIR, name);
      const r = spawnSync(
        'ffmpeg',
        ['-ss', String(tSec), '-i', outputMp4, '-frames:v', '1', '-y', out],
        { stdio: 'ignore' }
      );
      expect(r.status, `extract @${tSec}s failed`).toBe(0);
      return out;
    };
    const preFrame = extract(0.1, 'pre.png');
    const tap1Frame = extract(0.7, 'during-tap-1.png');
    const tap2Frame = extract(2.2, 'during-tap-2.png');

    // 4. Quick red-pixel test by sampling the PNG. Look for any pixel
    //    where red >> green AND red >> blue. We use ffprobe to read raw
    //    pixel data via `showinfo` filter — but a simpler shortcut: file
    //    size differs noticeably between black-only and black+red.
    //    The "pre" frame is solid black ≈ 700-1500 bytes; the "during"
    //    frames have red rings → larger.
    const preSize = fs.statSync(preFrame).size;
    const tap1Size = fs.statSync(tap1Frame).size;
    const tap2Size = fs.statSync(tap2Frame).size;
    expect(tap1Size).toBeGreaterThan(preSize);
    expect(tap2Size).toBeGreaterThan(preSize);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('applyTapOverlays with empty tap list copies the input unchanged', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-overlay-'));
  try {
    const inputMp4 = path.join(tmp, 'input.mp4');
    spawnSync(
      'ffmpeg',
      [
        '-f',
        'lavfi',
        '-i',
        'color=color=black:size=320x240:duration=1',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-y',
        inputMp4,
      ],
      { stdio: 'ignore' }
    );

    const outputMp4 = path.join(tmp, 'output.mp4');
    const { applyTapOverlays } = await import('../packages/sweetlink/src/simulator/overlay.js');
    await applyTapOverlays({ inputPath: inputMp4, outputPath: outputMp4, taps: [] });

    // No re-encode → same bytes.
    expect(fs.statSync(outputMp4).size).toBe(fs.statSync(inputMp4).size);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
