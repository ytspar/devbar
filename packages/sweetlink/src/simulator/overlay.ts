/**
 * Tap overlay renderer.
 *
 * Takes an mp4 + a list of tap events and renders red rings at each tap
 * position via ffmpeg's drawbox filter. drawbox doesn't draw circles, so
 * we use a hollow square (the standard "tap target" idiom in iOS' built-
 * in "show touches" mode is a circle, but a 4-px-thick red square reads
 * just as well at video scale and avoids needing a generated PNG asset).
 */

import { execFile, spawn } from 'child_process';
import { promises as fs } from 'fs';

export interface OverlayOptions {
  inputPath: string;
  outputPath: string;
  taps: Array<{ x: number; y: number; t: number }>;
  /** How long each tap indicator stays on screen in seconds. Default 0.6. */
  durationSec?: number;
  /** Half-side of the indicator square in px. Default 40. */
  radius?: number;
  /** Optional override for the ffmpeg binary; defaults to "ffmpeg" on PATH. */
  ffmpeg?: string;
}

/** Returns true if `ffmpeg` is on PATH. */
export function hasFfmpeg(binary = 'ffmpeg'): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(binary, ['-version'], (err) => resolve(!err));
  });
}

/**
 * Build the ffmpeg `-vf` filter chain for the given tap events.
 * Pure helper exposed for unit testing.
 */
export function buildOverlayFilter(
  taps: Array<{ x: number; y: number; t: number }>,
  durationSec = 0.6,
  radius = 40
): string {
  if (taps.length === 0) return '';
  // Two boxes per tap: an outer ring (high-vis) and a smaller solid pulse.
  const segments: string[] = [];
  for (const tap of taps) {
    const x = Math.round(tap.x - radius);
    const y = Math.round(tap.y - radius);
    const t0 = tap.t.toFixed(3);
    const t1 = (tap.t + durationSec).toFixed(3);
    // Hollow ring (4-px stroke), bright red, fades by enable window.
    segments.push(
      `drawbox=x=${x}:y=${y}:w=${radius * 2}:h=${radius * 2}:color=red@0.85:t=4:enable='between(t,${t0},${t1})'`
    );
    // Inner solid dot (small) so the centre of the tap is unmistakable.
    const innerR = Math.max(4, Math.round(radius / 4));
    segments.push(
      `drawbox=x=${x + radius - innerR}:y=${y + radius - innerR}:w=${innerR * 2}:h=${innerR * 2}:color=red@0.95:t=fill:enable='between(t,${t0},${t1})'`
    );
  }
  return segments.join(',');
}

/**
 * Render `inputPath` → `outputPath` with tap overlays composited at each
 * (x, y, t) coordinate. Throws if ffmpeg fails.
 */
export async function applyTapOverlays(options: OverlayOptions): Promise<void> {
  const ffmpeg = options.ffmpeg ?? 'ffmpeg';
  if (options.taps.length === 0) {
    // No taps to draw — just copy the file unchanged.
    await fs.copyFile(options.inputPath, options.outputPath);
    return;
  }
  const filter = buildOverlayFilter(options.taps, options.durationSec, options.radius);
  return new Promise((resolve, reject) => {
    const proc = spawn(
      ffmpeg,
      [
        '-i',
        options.inputPath,
        '-vf',
        filter,
        '-codec:v',
        'libx264',
        '-preset',
        'fast',
        '-y',
        options.outputPath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}. stderr tail:\n${stderr.slice(-800)}`));
    });
  });
}
