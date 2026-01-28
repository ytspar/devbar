import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { WebSocket } from 'ws';
import {
  logSubscriptions,
  channelSubscriptions,
  pendingScreenshotRequests,
  cleanupClientSubscriptions,
  type InternalLogSubscription,
  type InternalChannelSubscription,
  type PendingScreenshotRequest,
} from './subscriptions.js';

// Create mock WebSocket
function createMockWs(): WebSocket {
  return {
    readyState: 1,
    send: vi.fn(),
  } as unknown as WebSocket;
}

describe('cleanupClientSubscriptions', () => {
  beforeEach(() => {
    // Clear all maps before each test
    logSubscriptions.clear();
    channelSubscriptions.clear();
    pendingScreenshotRequests.clear();
  });

  it('removes client from channel subscriptions', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    const channelSubs: InternalChannelSubscription[] = [
      { clientWs: ws1, channel: 'test' },
      { clientWs: ws2, channel: 'test' },
    ];
    channelSubscriptions.set('test', channelSubs);

    cleanupClientSubscriptions(ws1);

    const remaining = channelSubscriptions.get('test');
    expect(remaining?.length).toBe(1);
    expect(remaining?.[0].clientWs).toBe(ws2);
  });

  it('removes log subscriptions for client', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    logSubscriptions.set('log1', {
      clientWs: ws1,
      subscriptionId: 'log1',
      filter: '',
    } as InternalLogSubscription);
    logSubscriptions.set('log2', {
      clientWs: ws2,
      subscriptionId: 'log2',
      filter: '',
    } as InternalLogSubscription);

    cleanupClientSubscriptions(ws1);

    expect(logSubscriptions.has('log1')).toBe(false);
    expect(logSubscriptions.has('log2')).toBe(true);
  });

  it('clears pending screenshot requests for client', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    const timeout1 = setTimeout(() => {}, 10000);
    const timeout2 = setTimeout(() => {}, 10000);

    pendingScreenshotRequests.set('req1', {
      clientWs: ws1,
      requestId: 'req1',
      timeout: timeout1,
    } as PendingScreenshotRequest);
    pendingScreenshotRequests.set('req2', {
      clientWs: ws2,
      requestId: 'req2',
      timeout: timeout2,
    } as PendingScreenshotRequest);

    vi.spyOn(global, 'clearTimeout');

    cleanupClientSubscriptions(ws1);

    expect(pendingScreenshotRequests.has('req1')).toBe(false);
    expect(pendingScreenshotRequests.has('req2')).toBe(true);
    expect(clearTimeout).toHaveBeenCalled();

    clearTimeout(timeout2);
  });

  it('handles empty subscriptions gracefully', () => {
    const ws = createMockWs();

    // Should not throw
    expect(() => cleanupClientSubscriptions(ws)).not.toThrow();
  });

  it('removes client from multiple channels', () => {
    const ws = createMockWs();

    channelSubscriptions.set('channel1', [{
      clientWs: ws,
      channel: 'channel1',
    }]);
    channelSubscriptions.set('channel2', [{
      clientWs: ws,
      channel: 'channel2',
    }]);

    cleanupClientSubscriptions(ws);

    expect(channelSubscriptions.get('channel1')?.length).toBe(0);
    expect(channelSubscriptions.get('channel2')?.length).toBe(0);
  });
});

describe('subscription maps', () => {
  it('logSubscriptions is a Map', () => {
    expect(logSubscriptions instanceof Map).toBe(true);
  });

  it('channelSubscriptions is a Map', () => {
    expect(channelSubscriptions instanceof Map).toBe(true);
  });

  it('pendingScreenshotRequests is a Map', () => {
    expect(pendingScreenshotRequests instanceof Map).toBe(true);
  });
});
