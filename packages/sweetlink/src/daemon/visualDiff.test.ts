// @vitest-environment node

/**
 * Visual Diff Tests
 *
 * Tests the byte-level visual comparison of screenshot buffers.
 */

import { describe, expect, it } from 'vitest';
import { visualDiff } from './visualDiff.js';

describe('visualDiff', () => {
  describe('identical buffers', () => {
    it('returns 0% mismatch for identical buffers', async () => {
      const buf = Buffer.from([1, 2, 3, 4, 5]);
      const result = await visualDiff(buf, buf);
      expect(result.mismatchPercentage).toBe(0);
      expect(result.mismatchCount).toBe(0);
      expect(result.pass).toBe(true);
    });

    it('returns 0% for identical non-trivial buffers', async () => {
      const buf = Buffer.from('hello world screenshot data');
      const result = await visualDiff(buf, Buffer.from(buf));
      expect(result.mismatchPercentage).toBe(0);
      expect(result.pass).toBe(true);
    });

    it('returns totalPixels equal to buffer length', async () => {
      const buf = Buffer.from([10, 20, 30]);
      const result = await visualDiff(buf, buf);
      expect(result.totalPixels).toBe(3);
    });
  });

  describe('different buffers', () => {
    it('returns >0% mismatch for different buffers', async () => {
      const a = Buffer.from([1, 2, 3, 4, 5]);
      const b = Buffer.from([1, 2, 99, 4, 5]);
      const result = await visualDiff(a, b);
      expect(result.mismatchPercentage).toBeGreaterThan(0);
      expect(result.mismatchCount).toBe(1);
    });

    it('returns 100% mismatch for completely different buffers of same length', async () => {
      const a = Buffer.from([0, 0, 0]);
      const b = Buffer.from([1, 1, 1]);
      const result = await visualDiff(a, b);
      expect(result.mismatchPercentage).toBe(100);
      expect(result.mismatchCount).toBe(3);
    });

    it('calculates correct percentage for partial mismatch', async () => {
      const a = Buffer.from([1, 2, 3, 4]);
      const b = Buffer.from([1, 2, 99, 99]);
      const result = await visualDiff(a, b);
      // 2 out of 4 bytes differ = 50%
      expect(result.mismatchPercentage).toBe(50);
      expect(result.mismatchCount).toBe(2);
    });
  });

  describe('threshold controls pass/fail', () => {
    it('default threshold (0) means identical buffers pass', async () => {
      const buf = Buffer.from([1, 2, 3]);
      const result = await visualDiff(buf, buf);
      expect(result.pass).toBe(true);
    });

    it('default threshold (0) means any diff fails', async () => {
      const a = Buffer.from([1, 2, 3]);
      const b = Buffer.from([1, 2, 4]);
      const result = await visualDiff(a, b);
      expect(result.pass).toBe(false);
    });

    it('threshold 1.0 is fully permissive (always passes)', async () => {
      const a = Buffer.from([0, 0, 0]);
      const b = Buffer.from([1, 1, 1]);
      const result = await visualDiff(a, b, { threshold: 1.0 });
      expect(result.pass).toBe(true);
    });

    it('threshold 0.5 passes when mismatch is at 50%', async () => {
      const a = Buffer.from([1, 2, 3, 4]);
      const b = Buffer.from([1, 2, 99, 99]);
      // 50% mismatch, threshold 0.5 = 50% allowed
      const result = await visualDiff(a, b, { threshold: 0.5 });
      expect(result.pass).toBe(true);
    });

    it('threshold 0.25 fails when mismatch exceeds 25%', async () => {
      const a = Buffer.from([1, 2, 3, 4]);
      const b = Buffer.from([1, 2, 99, 99]);
      // 50% mismatch, threshold 0.25 = 25% allowed
      const result = await visualDiff(a, b, { threshold: 0.25 });
      expect(result.pass).toBe(false);
    });
  });

  describe('different-length buffers', () => {
    it('counts extra bytes as mismatches', async () => {
      const a = Buffer.from([1, 2, 3]);
      const b = Buffer.from([1, 2, 3, 4, 5]);
      const result = await visualDiff(a, b);
      // 2 extra bytes out of 5 total
      expect(result.mismatchCount).toBe(2);
      expect(result.totalPixels).toBe(5);
      expect(result.mismatchPercentage).toBe(40);
    });

    it('handles baseline longer than current', async () => {
      const a = Buffer.from([1, 2, 3, 4, 5]);
      const b = Buffer.from([1, 2, 3]);
      const result = await visualDiff(a, b);
      expect(result.mismatchCount).toBe(2);
      expect(result.totalPixels).toBe(5);
    });

    it('handles empty baseline', async () => {
      const a = Buffer.from([]);
      const b = Buffer.from([1, 2, 3]);
      const result = await visualDiff(a, b);
      expect(result.mismatchCount).toBe(3);
      expect(result.totalPixels).toBe(3);
      expect(result.mismatchPercentage).toBe(100);
    });

    it('handles both empty buffers', async () => {
      const a = Buffer.from([]);
      const b = Buffer.from([]);
      const result = await visualDiff(a, b);
      expect(result.mismatchPercentage).toBe(0);
      expect(result.mismatchCount).toBe(0);
      expect(result.pass).toBe(true);
    });
  });

  describe('result shape', () => {
    it('returns all expected fields', async () => {
      const buf = Buffer.from([1, 2, 3]);
      const result = await visualDiff(buf, buf);
      expect(result).toHaveProperty('mismatchPercentage');
      expect(result).toHaveProperty('mismatchCount');
      expect(result).toHaveProperty('totalPixels');
      expect(result).toHaveProperty('pass');
    });

    it('does not include diffImagePath when no outputPath specified', async () => {
      const a = Buffer.from([1]);
      const b = Buffer.from([2]);
      const result = await visualDiff(a, b);
      expect(result.diffImagePath).toBeUndefined();
    });

    it('rounds mismatch percentage to 2 decimal places', async () => {
      // 1 diff out of 3 bytes = 33.333...%
      const a = Buffer.from([1, 2, 3]);
      const b = Buffer.from([1, 2, 99]);
      const result = await visualDiff(a, b);
      expect(result.mismatchPercentage).toBe(33.33);
    });
  });
});
