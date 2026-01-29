import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, getInitiatorColor, NetworkMonitor } from './network.js';

describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes under 1KB', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10240)).toBe('10.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
  });
});

describe('formatDuration', () => {
  it('formats milliseconds under 1 second', () => {
    expect(formatDuration(50)).toBe('50ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(1000)).toBe('1.00s');
    expect(formatDuration(1500)).toBe('1.50s');
    expect(formatDuration(2345)).toBe('2.35s');
  });
});

describe('getInitiatorColor', () => {
  it('returns amber for script', () => {
    expect(getInitiatorColor('script')).toBe('#f59e0b');
  });

  it('returns blue for link', () => {
    expect(getInitiatorColor('link')).toBe('#3b82f6');
  });

  it('returns purple for css', () => {
    expect(getInitiatorColor('css')).toBe('#a855f7');
  });

  it('returns emerald for fetch', () => {
    expect(getInitiatorColor('fetch')).toBe('#10b981');
  });

  it('returns emerald for xmlhttprequest', () => {
    expect(getInitiatorColor('xmlhttprequest')).toBe('#10b981');
  });

  it('returns pink for img', () => {
    expect(getInitiatorColor('img')).toBe('#ec4899');
  });

  it('returns cyan for iframe', () => {
    expect(getInitiatorColor('iframe')).toBe('#06b6d4');
  });

  it('returns gray for unknown types', () => {
    expect(getInitiatorColor('unknown')).toBe('#6b7280');
    expect(getInitiatorColor('other')).toBe('#6b7280');
  });
});

describe('NetworkMonitor', () => {
  it('initializes with empty state', () => {
    const monitor = new NetworkMonitor();
    const state = monitor.getState();

    expect(state.entries).toEqual([]);
    expect(state.totalRequests).toBe(0);
    expect(state.totalSize).toBe(0);
    expect(state.pendingCount).toBe(0);
  });

  it('can be started and stopped without error', () => {
    const monitor = new NetworkMonitor();
    expect(() => {
      monitor.start();
      monitor.stop();
    }).not.toThrow();
  });

  it('clear resets entries', () => {
    const monitor = new NetworkMonitor();
    monitor.start();
    monitor.clear();
    const state = monitor.getState();
    expect(state.entries).toEqual([]);
  });

  it('search returns empty array when no entries', () => {
    const monitor = new NetworkMonitor();
    const results = monitor.search('test');
    expect(results).toEqual([]);
  });

  it('getEntriesByType returns empty array when no entries', () => {
    const monitor = new NetworkMonitor();
    const results = monitor.getEntriesByType('script');
    expect(results).toEqual([]);
  });

  it('subscribe returns unsubscribe function', () => {
    const monitor = new NetworkMonitor();
    const listener = () => {};
    const unsubscribe = monitor.subscribe(listener);

    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });

  it('notifies listeners on clear', () => {
    const monitor = new NetworkMonitor();
    let callCount = 0;
    monitor.subscribe(() => {
      callCount++;
    });

    monitor.clear();
    expect(callCount).toBe(1);
  });
});
