// @vitest-environment node

/**
 * Departure Mono Font Data Test
 *
 * The export is a base64-encoded woff2 binary. We verify:
 *  1. It's valid base64 (decodes without throwing).
 *  2. The decoded bytes start with the woff2 magic signature `wOF2`
 *     (0x77 0x4F 0x46 0x32). A future regression that ships a corrupted
 *     blob would either fail to decode or land here.
 *  3. The blob is at least somewhat reasonable in size (a real woff2 of
 *     this font is ~30 KB; <2 KB or >2 MB is wrong).
 *
 * We don't test the rendered glyphs themselves — that's a visual concern
 * outside of unit testing.
 */

import { describe, expect, it } from 'vitest';
import { DEPARTURE_MONO_WOFF2_BASE64 } from './font-data.js';

describe('font-data', () => {
  it('decodes from base64 without throwing', () => {
    const buf = Buffer.from(DEPARTURE_MONO_WOFF2_BASE64, 'base64');
    expect(buf.length).toBeGreaterThan(0);
  });

  it('starts with the woff2 magic bytes (wOF2)', () => {
    const buf = Buffer.from(DEPARTURE_MONO_WOFF2_BASE64, 'base64');
    // woff2 spec: signature 0x774F4632 — "wOF2"
    expect(buf[0]).toBe(0x77);
    expect(buf[1]).toBe(0x4f);
    expect(buf[2]).toBe(0x46);
    expect(buf[3]).toBe(0x32);
  });

  it('has a plausible byte length for a font binary', () => {
    const buf = Buffer.from(DEPARTURE_MONO_WOFF2_BASE64, 'base64');
    // Departure Mono is about 30KB. Anything outside [10KB, 200KB] is
    // almost certainly wrong (truncated / corrupted / replaced).
    expect(buf.length).toBeGreaterThan(10_000);
    expect(buf.length).toBeLessThan(200_000);
  });

  it('contains no whitespace or padding artifacts', () => {
    // Inline base64 strings often pick up stray newlines or `=` mismatches
    // when manually edited. Verify the encoded form is a single contiguous
    // alphabet+digits+/+= run.
    expect(DEPARTURE_MONO_WOFF2_BASE64).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
