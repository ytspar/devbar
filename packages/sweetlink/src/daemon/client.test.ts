// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DaemonRequestError, daemonRequest } from './client.js';
import type { DaemonState } from './types.js';

const state: DaemonState = {
  pid: 123,
  port: 4567,
  token: 'test-token',
  startedAt: '2026-04-27T00:00:00.000Z',
  url: 'http://127.0.0.1:5173',
  lastActivity: '2026-04-27T00:00:00.000Z',
};

describe('daemonRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves daemon failure data on thrown errors', async () => {
    const response = {
      ok: false,
      error: 'Ref @e1 is stale',
      data: {
        staleRef: true,
        currentUrl: 'http://127.0.0.1:5173/checkout',
        failureScreenshot: '.sweetlink/failures/stale-ref-e1.png',
        remediation: 'Run `sweetlink inspect` to refresh refs before retrying.',
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(response), { status: 409 }))
    );

    let error: unknown;
    try {
      await daemonRequest(state, 'click-ref', { ref: '@e1' });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(DaemonRequestError);
    expect((error as DaemonRequestError).status).toBe(409);
    expect((error as DaemonRequestError).response).toEqual(response);
    expect((error as DaemonRequestError).data).toEqual(response.data);
  });
});
