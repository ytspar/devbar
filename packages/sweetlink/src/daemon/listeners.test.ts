// @vitest-environment node

/**
 * Page Event Listener Tests
 *
 * Verifies that installListeners wires up Playwright page events to the
 * shared ring buffers correctly. Uses a hand-rolled Page mock that records
 * the listeners it was given so we can fire them with synthetic events.
 *
 * The tests here cover real behavior the daemon depends on:
 * - Network duration is measured against the request's startTime, not Date.now
 *   when the response handler fires
 * - Re-installing on the same page is a no-op (idempotent installListeners)
 * - Console/network/dialog events all populate their respective buffers
 * - requestfailed produces a synthetic status=0 entry with original method
 * - Body capture toggles via setCaptureBodies and is bounded to 4KB
 * - Console-error / console-warning counters reflect buffer contents
 * - Output formatters handle empty buffers and truncate long URLs
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consoleBuffer,
  dialogBuffer,
  formatConsoleEntries,
  formatNetworkEntries,
  getErrorCount,
  getWarningCount,
  installListeners,
  isCapturingBodies,
  networkBuffer,
  setCaptureBodies,
} from './listeners.js';

type EventHandler = (...args: unknown[]) => unknown;

interface MockPage {
  on(event: string, handler: EventHandler): void;
  fire(event: string, ...args: unknown[]): Promise<unknown>;
}

function createMockPage(): MockPage {
  const handlers = new Map<string, EventHandler>();
  return {
    on(event, handler) {
      // Real Playwright supports multiple listeners; the daemon only registers
      // one per event so we track only the latest.
      handlers.set(event, handler);
    },
    async fire(event, ...args) {
      const h = handlers.get(event);
      if (!h) throw new Error(`No handler registered for ${event}`);
      return h(...args);
    },
  };
}

interface MockRequest {
  url(): string;
  method(): string;
  postData(): string | null;
}

interface MockResponse {
  url(): string;
  status(): number;
  request(): MockRequest;
  headers(): Record<string, string>;
  body(): Promise<Buffer>;
}

function makeRequest(opts: {
  url: string;
  method?: string;
  postData?: string | null;
}): MockRequest {
  return {
    url: () => opts.url,
    method: () => opts.method ?? 'GET',
    postData: () => opts.postData ?? null,
  };
}

function makeResponse(opts: {
  request: MockRequest;
  status?: number;
  contentType?: string;
  body?: string;
}): MockResponse {
  return {
    url: () => opts.request.url(),
    status: () => opts.status ?? 200,
    request: () => opts.request,
    headers: () =>
      opts.contentType ? ({ 'content-type': opts.contentType } as Record<string, string>) : {},
    body: async () => Buffer.from(opts.body ?? ''),
  };
}

beforeEach(() => {
  // The buffers are module-level singletons — clear between tests so one
  // test's writes don't show up in the next.
  consoleBuffer.clear();
  networkBuffer.clear();
  dialogBuffer.clear();
  setCaptureBodies(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('setCaptureBodies / isCapturingBodies', () => {
  it('toggles the body-capture flag', () => {
    expect(isCapturingBodies()).toBe(false);
    setCaptureBodies(true);
    expect(isCapturingBodies()).toBe(true);
    setCaptureBodies(false);
    expect(isCapturingBodies()).toBe(false);
  });
});

describe('installListeners', () => {
  it('is idempotent on the same page object', () => {
    const page = createMockPage();
    const onSpy = vi.spyOn(page, 'on');
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);
    const firstCallCount = onSpy.mock.calls.length;
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);
    // Re-install must not register more listeners — otherwise events would
    // be captured twice and buffers would inflate.
    expect(onSpy.mock.calls.length).toBe(firstCallCount);
  });

  it('registers handlers for console / request / response / requestfailed / dialog', () => {
    const page = createMockPage();
    const onSpy = vi.spyOn(page, 'on');
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);
    const eventNames = onSpy.mock.calls.map((c) => c[0]);
    expect(eventNames).toEqual(
      expect.arrayContaining(['console', 'request', 'response', 'requestfailed', 'dialog'])
    );
  });

  it('captures separate pages into the same shared buffer', async () => {
    const a = createMockPage();
    const b = createMockPage();
    installListeners(a as unknown as Parameters<typeof installListeners>[0]);
    installListeners(b as unknown as Parameters<typeof installListeners>[0]);

    await a.fire('console', {
      type: () => 'log',
      text: () => 'from page A',
      location: () => null,
    });
    await b.fire('console', {
      type: () => 'log',
      text: () => 'from page B',
      location: () => null,
    });

    const all = consoleBuffer.toArray();
    expect(all.map((e) => e.message)).toEqual(['from page A', 'from page B']);
  });
});

describe('console event capture', () => {
  it('records level + message + timestamp for console events', async () => {
    const page = createMockPage();
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);

    const before = Date.now();
    await page.fire('console', {
      type: () => 'error',
      text: () => 'something broke',
      location: () => null,
    });
    const after = Date.now();

    const entries = consoleBuffer.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.level).toBe('error');
    expect(entries[0]!.message).toBe('something broke');
    expect(entries[0]!.timestamp).toBeGreaterThanOrEqual(before);
    expect(entries[0]!.timestamp).toBeLessThanOrEqual(after);
    expect(entries[0]!.location).toBeUndefined();
  });

  it('serializes location as url:lineNumber when provided', async () => {
    const page = createMockPage();
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);

    await page.fire('console', {
      type: () => 'warning',
      text: () => 'deprecated API',
      location: () => ({ url: 'https://example.com/app.js', lineNumber: 42 }),
    });

    expect(consoleBuffer.toArray()[0]!.location).toBe('https://example.com/app.js:42');
  });
});

describe('network event capture', () => {
  it('measures duration as response-time minus request-time, not 0 when missed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const page = createMockPage();
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);
    const request = makeRequest({ url: '/api/foo', method: 'POST' });

    await page.fire('request', request);
    vi.advanceTimersByTime(123);
    await page.fire('response', makeResponse({ request, status: 200, contentType: 'application/json' }));

    const [entry] = networkBuffer.toArray();
    expect(entry).toBeDefined();
    expect(entry!.duration).toBe(123);
    expect(entry!.method).toBe('POST');
    expect(entry!.url).toBe('/api/foo');
    expect(entry!.status).toBe(200);
    expect(entry!.contentType).toBe('application/json');
  });

  it('does not lose duration when two requests share a URL (parallel fetches)', async () => {
    // Regression: the previous Map<url,_> implementation would overwrite
    // the first request's startTime, causing the first response to clamp
    // its duration against the second request's startTime.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const page = createMockPage();
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);
    const r1 = makeRequest({ url: '/api/same' });
    const r2 = makeRequest({ url: '/api/same' });

    await page.fire('request', r1);
    vi.advanceTimersByTime(50);
    await page.fire('request', r2);
    vi.advanceTimersByTime(100);
    // Respond to r1 first — its duration should be 150ms total.
    await page.fire('response', makeResponse({ request: r1, status: 200 }));
    vi.advanceTimersByTime(20);
    // Then r2 — its duration should be only 120ms (50+100-50, then +20).
    await page.fire('response', makeResponse({ request: r2, status: 200 }));

    const entries = networkBuffer.toArray();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.duration).toBe(150);
    expect(entries[1]!.duration).toBe(120);
  });

  it('records requestfailed as status=0 with the original method', async () => {
    const page = createMockPage();
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);
    const request = makeRequest({ url: '/api/dead', method: 'DELETE' });

    await page.fire('request', request);
    await page.fire('requestfailed', request);

    const [entry] = networkBuffer.toArray();
    expect(entry!.status).toBe(0);
    expect(entry!.method).toBe('DELETE');
    expect(entry!.url).toBe('/api/dead');
  });

  it('falls back to status=0 method=GET when request was never seen', async () => {
    // Edge case: request fires before listeners attached (e.g. preflight at
    // page load). The response handler must not crash, just record a stub.
    const page = createMockPage();
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);
    const request = makeRequest({ url: '/api/orphan', method: 'PATCH' });

    await page.fire('response', makeResponse({ request, status: 404 }));

    const [entry] = networkBuffer.toArray();
    expect(entry!.url).toBe('/api/orphan');
    expect(entry!.status).toBe(404);
    // No pending entry → method falls back to 'GET'.
    expect(entry!.method).toBe('GET');
  });
});

describe('body capture', () => {
  it('does not capture bodies when disabled', async () => {
    const page = createMockPage();
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);
    const request = makeRequest({ url: '/api/foo', method: 'POST', postData: '{"x":1}' });

    await page.fire('request', request);
    await page.fire(
      'response',
      makeResponse({ request, status: 200, body: '{"y":2}' })
    );

    const [entry] = networkBuffer.toArray();
    expect(entry!.requestBody).toBeUndefined();
    expect(entry!.responseBody).toBeUndefined();
  });

  it('captures request and response bodies when enabled', async () => {
    setCaptureBodies(true);
    const page = createMockPage();
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);
    const request = makeRequest({ url: '/api/foo', method: 'POST', postData: '{"x":1}' });

    await page.fire('request', request);
    await page.fire(
      'response',
      makeResponse({ request, status: 200, body: '{"y":2}' })
    );

    const [entry] = networkBuffer.toArray();
    expect(entry!.requestBody).toBe('{"x":1}');
    expect(entry!.responseBody).toBe('{"y":2}');
  });

  it('truncates request body at 4KB', async () => {
    setCaptureBodies(true);
    const page = createMockPage();
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);
    const huge = 'a'.repeat(4 * 1024 + 100);
    const request = makeRequest({ url: '/api/foo', method: 'POST', postData: huge });

    await page.fire('request', request);
    await page.fire('response', makeResponse({ request, status: 200, body: 'ok' }));

    const [entry] = networkBuffer.toArray();
    expect(entry!.requestBody).toHaveLength(4 * 1024);
  });

  it('truncates response body at 4KB', async () => {
    setCaptureBodies(true);
    const page = createMockPage();
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);
    const request = makeRequest({ url: '/api/foo' });
    const huge = 'b'.repeat(4 * 1024 + 100);

    await page.fire('request', request);
    await page.fire('response', makeResponse({ request, status: 200, body: huge }));

    const [entry] = networkBuffer.toArray();
    expect(entry!.responseBody).toHaveLength(4 * 1024);
  });

  it('survives postData() throwing', async () => {
    setCaptureBodies(true);
    const page = createMockPage();
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);
    const request: MockRequest = {
      url: () => '/api/foo',
      method: () => 'POST',
      postData: () => {
        throw new Error('postData unavailable');
      },
    };

    // Must not throw, must still record the request.
    await page.fire('request', request);
    await page.fire('response', makeResponse({ request, status: 200, body: '' }));

    const entries = networkBuffer.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.requestBody).toBeUndefined();
  });
});

describe('dialog event capture', () => {
  it('records dialog and auto-dismisses', async () => {
    const page = createMockPage();
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);

    const dismiss = vi.fn(() => Promise.resolve());
    await page.fire('dialog', {
      type: () => 'confirm',
      message: () => 'Are you sure?',
      defaultValue: () => '',
      dismiss,
    });

    const [entry] = dialogBuffer.toArray();
    expect(entry!.type).toBe('confirm');
    expect(entry!.message).toBe('Are you sure?');
    expect(entry!.defaultValue).toBeUndefined();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('preserves defaultValue for prompt dialogs', async () => {
    const page = createMockPage();
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);
    await page.fire('dialog', {
      type: () => 'prompt',
      message: () => 'Name?',
      defaultValue: () => 'Bob',
      dismiss: () => Promise.resolve(),
    });

    expect(dialogBuffer.toArray()[0]!.defaultValue).toBe('Bob');
  });

  it('does not crash if dialog.dismiss rejects', async () => {
    const page = createMockPage();
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);

    await page.fire('dialog', {
      type: () => 'alert',
      message: () => 'oops',
      defaultValue: () => '',
      dismiss: () => Promise.reject(new Error('dismiss failed')),
    });

    expect(dialogBuffer.size).toBe(1);
  });
});

describe('getErrorCount / getWarningCount', () => {
  it('counts only matching levels in the console buffer', async () => {
    const page = createMockPage();
    installListeners(page as unknown as Parameters<typeof installListeners>[0]);

    for (const level of ['error', 'error', 'warning', 'log', 'info', 'warning', 'error']) {
      await page.fire('console', {
        type: () => level,
        text: () => `${level} msg`,
        location: () => null,
      });
    }

    expect(getErrorCount()).toBe(3);
    expect(getWarningCount()).toBe(2);
  });
});

describe('formatConsoleEntries', () => {
  it('returns placeholder when empty', () => {
    expect(formatConsoleEntries([])).toBe('(no console messages)');
  });

  it('formats with timestamp/level/message/location', () => {
    const out = formatConsoleEntries([
      {
        timestamp: new Date('2026-04-30T14:30:45.000Z').getTime(),
        level: 'error',
        message: 'boom',
        location: 'https://example.com/app.js:1',
      },
    ]);
    expect(out).toMatch(/^\[14:30:45\] ERROR\s+boom \(https:\/\/example\.com\/app\.js:1\)$/);
  });
});

describe('formatNetworkEntries', () => {
  it('returns placeholder when empty', () => {
    expect(formatNetworkEntries([])).toBe('(no network requests)');
  });

  it('renders FAIL for status=0', () => {
    const out = formatNetworkEntries([
      {
        timestamp: new Date('2026-04-30T14:30:45.000Z').getTime(),
        method: 'GET',
        url: 'https://example.com/x',
        status: 0,
        duration: 1200,
      },
    ]);
    expect(out).toContain('FAIL');
    expect(out).toContain('1200ms');
  });

  it('truncates URLs longer than 80 chars', () => {
    const longUrl = `https://example.com/${'a'.repeat(120)}`;
    const out = formatNetworkEntries([
      {
        timestamp: 0,
        method: 'GET',
        url: longUrl,
        status: 200,
        duration: 5,
      },
    ]);
    // 80 chars total: 77 prefix + '...'
    expect(out).toContain('...');
    expect(out).not.toContain(longUrl);
  });
});
