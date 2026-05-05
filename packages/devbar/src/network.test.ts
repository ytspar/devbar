import { describe, expect, it } from 'vitest';
import { NetworkMonitor } from './network.js';

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
