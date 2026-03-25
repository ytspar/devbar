// @vitest-environment node

/**
 * RingBuffer Tests
 *
 * Tests the fixed-capacity circular buffer used for event capture.
 */

import { describe, expect, it } from 'vitest';
import { RingBuffer } from './ringBuffer.js';

describe('RingBuffer', () => {
  describe('constructor', () => {
    it('creates a buffer with default capacity', () => {
      const buf = new RingBuffer();
      expect(buf.size).toBe(0);
    });

    it('creates a buffer with custom capacity', () => {
      const buf = new RingBuffer<number>(10);
      expect(buf.size).toBe(0);
    });
  });

  describe('push', () => {
    it('increments size on push', () => {
      const buf = new RingBuffer<number>(5);
      buf.push(1);
      expect(buf.size).toBe(1);
      buf.push(2);
      expect(buf.size).toBe(2);
    });

    it('does not exceed capacity', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4);
      expect(buf.size).toBe(3);
    });
  });

  describe('toArray', () => {
    it('returns empty array when buffer is empty', () => {
      const buf = new RingBuffer<number>(5);
      expect(buf.toArray()).toEqual([]);
    });

    it('returns items in insertion order', () => {
      const buf = new RingBuffer<number>(5);
      buf.push(10);
      buf.push(20);
      buf.push(30);
      expect(buf.toArray()).toEqual([10, 20, 30]);
    });

    it('returns items in correct order after overflow', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4); // overwrites 1
      buf.push(5); // overwrites 2
      expect(buf.toArray()).toEqual([3, 4, 5]);
    });

    it('handles wrapping around multiple times', () => {
      const buf = new RingBuffer<number>(2);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4);
      buf.push(5);
      buf.push(6);
      expect(buf.toArray()).toEqual([5, 6]);
    });
  });

  describe('filter', () => {
    it('returns empty array when buffer is empty', () => {
      const buf = new RingBuffer<number>(5);
      expect(buf.filter((x) => x > 0)).toEqual([]);
    });

    it('filters items by predicate', () => {
      const buf = new RingBuffer<number>(10);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4);
      buf.push(5);
      expect(buf.filter((x) => x % 2 === 0)).toEqual([2, 4]);
    });

    it('works after overflow', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4);
      expect(buf.filter((x) => x > 2)).toEqual([3, 4]);
    });
  });

  describe('last', () => {
    it('returns empty array from empty buffer', () => {
      const buf = new RingBuffer<number>(5);
      expect(buf.last(3)).toEqual([]);
    });

    it('returns last N items', () => {
      const buf = new RingBuffer<number>(10);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4);
      buf.push(5);
      expect(buf.last(3)).toEqual([3, 4, 5]);
    });

    it('returns all items when N exceeds size', () => {
      const buf = new RingBuffer<number>(5);
      buf.push(10);
      buf.push(20);
      expect(buf.last(5)).toEqual([10, 20]);
    });

    it('returns last N after overflow', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4);
      buf.push(5);
      expect(buf.last(2)).toEqual([4, 5]);
    });

    it('returns empty array when N is 0', () => {
      const buf = new RingBuffer<number>(5);
      buf.push(1);
      // last(0) => slice(Math.max(0, 1-0)) = slice(1) = []
      expect(buf.last(0)).toEqual([]);
    });
  });

  describe('clear', () => {
    it('resets buffer to empty', () => {
      const buf = new RingBuffer<number>(5);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.clear();
      expect(buf.size).toBe(0);
      expect(buf.toArray()).toEqual([]);
    });

    it('allows pushing after clear', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.clear();
      buf.push(10);
      expect(buf.toArray()).toEqual([10]);
      expect(buf.size).toBe(1);
    });
  });

  describe('size', () => {
    it('is 0 for new buffer', () => {
      expect(new RingBuffer<string>(10).size).toBe(0);
    });

    it('tracks count up to capacity', () => {
      const buf = new RingBuffer<number>(3);
      expect(buf.size).toBe(0);
      buf.push(1);
      expect(buf.size).toBe(1);
      buf.push(2);
      expect(buf.size).toBe(2);
      buf.push(3);
      expect(buf.size).toBe(3);
      buf.push(4);
      expect(buf.size).toBe(3); // capped at capacity
    });
  });

  describe('overflow behavior', () => {
    it('overwrites oldest items when capacity is 1', () => {
      const buf = new RingBuffer<string>(1);
      buf.push('a');
      buf.push('b');
      buf.push('c');
      expect(buf.size).toBe(1);
      expect(buf.toArray()).toEqual(['c']);
    });

    it('preserves order with exact capacity fill', () => {
      const buf = new RingBuffer<number>(4);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4);
      expect(buf.toArray()).toEqual([1, 2, 3, 4]);
      expect(buf.size).toBe(4);
    });

    it('handles string items', () => {
      const buf = new RingBuffer<string>(2);
      buf.push('hello');
      buf.push('world');
      buf.push('foo');
      expect(buf.toArray()).toEqual(['world', 'foo']);
    });

    it('handles object items', () => {
      const buf = new RingBuffer<{ id: number }>(2);
      buf.push({ id: 1 });
      buf.push({ id: 2 });
      buf.push({ id: 3 });
      expect(buf.toArray()).toEqual([{ id: 2 }, { id: 3 }]);
    });
  });
});
