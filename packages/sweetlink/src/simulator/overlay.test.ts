/**
 * Tests for the ffmpeg overlay filter builder. Pure-string output is
 * trivial to verify; an end-to-end ffmpeg run is exercised in the e2e
 * spec when ffmpeg is on PATH.
 */

import { describe, expect, it } from 'vitest';
import { buildOverlayFilter } from './overlay.js';

describe('buildOverlayFilter', () => {
  it('returns empty string for no taps', () => {
    expect(buildOverlayFilter([])).toBe('');
  });

  it('emits a hollow ring + inner dot per tap', () => {
    const filter = buildOverlayFilter([{ x: 100, y: 200, t: 1.5 }], 0.6, 40);
    // Ring: x=60, y=160, w=80, h=80, stroke 4px
    expect(filter).toContain('drawbox=x=60:y=160:w=80:h=80');
    expect(filter).toContain('color=red@0.85');
    expect(filter).toContain("enable='between(t,1.500,2.100)'");
    // Inner dot at the centre, ~10x10 (radius/4 = 10).
    expect(filter).toContain('color=red@0.95');
    expect(filter).toContain('t=fill');
  });

  it('chains multiple taps with commas', () => {
    const filter = buildOverlayFilter([
      { x: 50, y: 50, t: 0 },
      { x: 200, y: 300, t: 2.5 },
    ]);
    // Each tap → 2 drawbox segments (ring + dot) → 4 total, joined by ','
    expect(filter.split('drawbox=').length - 1).toBe(4);
    // First tap window
    expect(filter).toContain('between(t,0.000,0.600)');
    // Second tap window
    expect(filter).toContain('between(t,2.500,3.100)');
  });

  it('handles fractional coordinates by rounding', () => {
    const filter = buildOverlayFilter([{ x: 100.7, y: 200.4, t: 1.5 }]);
    // x − radius = 100.7 − 40 = 60.7 → rounded to 61
    expect(filter).toContain('x=61:y=160');
  });
});
