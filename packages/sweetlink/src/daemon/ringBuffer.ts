/**
 * Ring Buffer
 *
 * Fixed-capacity circular buffer with O(1) push.
 * Used for always-on console/network/dialog event capture.
 */

export class RingBuffer<T> {
  private buffer: (T | undefined)[];
  private head = 0;
  private count = 0;
  private totalPushed = 0;

  constructor(private readonly capacity: number = 50_000) {
    this.buffer = new Array(capacity);
  }

  /** Add an item. Overwrites oldest if at capacity. */
  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    this.totalPushed++;
    if (this.count < this.capacity) this.count++;
  }

  /** Get all items in insertion order (oldest first). */
  toArray(): T[] {
    if (this.count === 0) return [];
    const result: T[] = [];
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      result.push(this.buffer[(start + i) % this.capacity]!);
    }
    return result;
  }

  /** Get items matching a predicate. */
  filter(predicate: (item: T) => boolean): T[] {
    return this.toArray().filter(predicate);
  }

  /** Get the last N items. */
  last(n: number): T[] {
    const all = this.toArray();
    return all.slice(Math.max(0, all.length - n));
  }

  /**
   * Get items added after an absolute cursor from `cursor`.
   * If the cursor predates retained entries, returns all currently retained items.
   */
  since(cursor: number): T[] {
    const all = this.toArray();
    const earliestCursor = this.totalPushed - all.length;
    const start = Math.min(all.length, Math.max(0, cursor - earliestCursor));
    return all.slice(start);
  }

  /** Clear all items. */
  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.count = 0;
    this.totalPushed = 0;
  }

  /** Current number of items. */
  get size(): number {
    return this.count;
  }

  /** Absolute insertion cursor for session-scoped reads. */
  get cursor(): number {
    return this.totalPushed;
  }
}
