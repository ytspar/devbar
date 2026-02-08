import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsoleLog } from '../types.js';
import {
  ConsoleCapture,
  createErrorHandler,
  createRejectionHandler,
  formatArg,
  formatArgs,
  MAX_CONSOLE_LOGS,
} from './consoleCapture.js';

describe('formatArg', () => {
  it('formats strings as-is', () => {
    expect(formatArg('hello')).toBe('hello');
    expect(formatArg('')).toBe('');
  });

  it('formats numbers', () => {
    expect(formatArg(42)).toBe('42');
    expect(formatArg(3.14)).toBe('3.14');
    expect(formatArg(-1)).toBe('-1');
  });

  it('formats booleans', () => {
    expect(formatArg(true)).toBe('true');
    expect(formatArg(false)).toBe('false');
  });

  it('formats null and undefined', () => {
    expect(formatArg(null)).toBe('null');
    expect(formatArg(undefined)).toBe('undefined');
  });

  it('formats Error objects with name, message, and stack', () => {
    const error = new Error('test error');
    const result = formatArg(error);
    expect(result).toContain('Error: test error');
    expect(result).toContain('\n'); // Stack trace
  });

  it('formats plain objects as JSON', () => {
    expect(formatArg({ a: 1 })).toBe('{"a":1}');
  });

  it('formats arrays as JSON', () => {
    expect(formatArg([1, 2, 3])).toBe('[1,2,3]');
  });

  it('handles errors inside objects', () => {
    const obj = { error: new Error('inner') };
    const result = formatArg(obj);
    expect(result).toBe('{"error":"Error: inner"}');
  });

  it('returns [object] for circular references', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(formatArg(obj)).toBe('[object]');
  });
});

describe('formatArgs', () => {
  it('joins multiple arguments with spaces', () => {
    expect(formatArgs(['hello', 'world'])).toBe('hello world');
  });

  it('handles empty array', () => {
    expect(formatArgs([])).toBe('');
  });

  it('formats mixed types', () => {
    expect(formatArgs(['count:', 42])).toBe('count: 42');
  });
});

describe('ConsoleCapture', () => {
  let capture: ConsoleCapture;
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let originalWarn: typeof console.warn;
  let originalInfo: typeof console.info;

  beforeEach(() => {
    originalLog = console.log;
    originalError = console.error;
    originalWarn = console.warn;
    originalInfo = console.info;
    capture = new ConsoleCapture();
  });

  afterEach(() => {
    capture.stop();
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
  });

  it('starts capturing console output', () => {
    capture.start();
    console.log('test message');

    const logs = capture.getLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].message).toBe('test message');
    expect(logs[0].level).toBe('log');
  });

  it('captures all log levels', () => {
    capture.start();
    console.log('log');
    console.error('error');
    console.warn('warning');
    console.info('info');

    const logs = capture.getLogs();
    expect(logs.length).toBe(4);
    expect(logs[0].level).toBe('log');
    expect(logs[1].level).toBe('error');
    expect(logs[2].level).toBe('warn');
    expect(logs[3].level).toBe('info');
  });

  it('tracks error and warning counts', () => {
    capture.start();
    console.error('error 1');
    console.error('error 2');
    console.warn('warning 1');
    console.log('log');

    expect(capture.getErrorCount()).toBe(2);
    expect(capture.getWarningCount()).toBe(1);
  });

  it('limits logs to maxLogs', () => {
    const smallCapture = new ConsoleCapture({ maxLogs: 3 });
    smallCapture.start();

    console.log('1');
    console.log('2');
    console.log('3');
    console.log('4');
    console.log('5');

    const logs = smallCapture.getLogs();
    expect(logs.length).toBe(3);
    expect(logs[0].message).toBe('3');
    expect(logs[2].message).toBe('5');

    smallCapture.stop();
  });

  it('calls onLog callback when configured', () => {
    const onLog = vi.fn();
    const callbackCapture = new ConsoleCapture({ onLog });
    callbackCapture.start();

    console.log('test');

    expect(onLog).toHaveBeenCalledTimes(1);
    expect(onLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'log',
        message: 'test',
      })
    );

    callbackCapture.stop();
  });

  it('restores original console methods on stop', () => {
    capture.start();
    const patchedLog = console.log;
    capture.stop();

    expect(console.log).not.toBe(patchedLog);
  });

  it('filters logs by level', () => {
    capture.start();
    console.log('a log');
    console.error('an error');
    console.log('another log');

    const filtered = capture.getFilteredLogs('error');
    expect(filtered.length).toBe(1);
    expect(filtered[0].level).toBe('error');
  });

  it('filters logs by message content', () => {
    capture.start();
    console.log('hello world');
    console.log('goodbye');
    console.log('hello again');

    const filtered = capture.getFilteredLogs('hello');
    expect(filtered.length).toBe(2);
  });

  it('returns state object', () => {
    capture.start();
    console.error('error');

    const state = capture.getState();
    expect(state.logs.length).toBe(1);
    expect(state.errorCount).toBe(1);
    expect(state.warningCount).toBe(0);
    expect(state.isPatched).toBe(true);
  });

  it('imports logs from another source', () => {
    const existingLogs: ConsoleLog[] = [{ level: 'log', message: 'old log', timestamp: 1000 }];

    capture.importLogs(existingLogs);
    capture.start();
    console.log('new log');

    const logs = capture.getLogs();
    expect(logs.length).toBe(2);
    expect(logs[0].message).toBe('old log');
    expect(logs[1].message).toBe('new log');
  });

  it('clears logs and resets counts', () => {
    capture.start();
    console.error('error');
    console.warn('warning');

    capture.clear();

    expect(capture.getLogs().length).toBe(0);
    expect(capture.getErrorCount()).toBe(0);
    expect(capture.getWarningCount()).toBe(0);
  });

  it('does not start twice', () => {
    capture.start();
    const firstLog = console.log;
    capture.start();

    expect(console.log).toBe(firstLog);
  });
});

describe('createErrorHandler', () => {
  it('captures error events to logs', () => {
    const logsRef: { logs: ConsoleLog[] } = { logs: [] };
    const handler = createErrorHandler(logsRef);

    const errorEvent = {
      message: 'Test error',
      filename: 'test.js',
      error: new Error('Test'),
    } as ErrorEvent;

    handler(errorEvent);

    expect(logsRef.logs.length).toBe(1);
    expect(logsRef.logs[0].level).toBe('error');
    expect(logsRef.logs[0].message).toContain('Uncaught: Test error');
    expect(logsRef.logs[0].source).toBe('test.js');
  });

  it('respects max logs limit', () => {
    const logsRef: { logs: ConsoleLog[] } = { logs: [] };
    const handler = createErrorHandler(logsRef, 2);

    for (let i = 0; i < 5; i++) {
      handler({ message: `Error ${i}` } as ErrorEvent);
    }

    expect(logsRef.logs.length).toBe(2);
    expect(logsRef.logs[0].message).toContain('Error 3');
  });
});

describe('createRejectionHandler', () => {
  it('captures Error rejections', () => {
    const logsRef: { logs: ConsoleLog[] } = { logs: [] };
    const handler = createRejectionHandler(logsRef);

    const error = new Error('Promise failed');
    const event = { reason: error } as PromiseRejectionEvent;

    handler(event);

    expect(logsRef.logs.length).toBe(1);
    expect(logsRef.logs[0].level).toBe('error');
    expect(logsRef.logs[0].message).toContain('Unhandled rejection: Error: Promise failed');
  });

  it('captures non-Error rejections', () => {
    const logsRef: { logs: ConsoleLog[] } = { logs: [] };
    const handler = createRejectionHandler(logsRef);

    const event = { reason: 'string rejection' } as PromiseRejectionEvent;

    handler(event);

    expect(logsRef.logs[0].message).toBe('Unhandled rejection: string rejection');
  });

  it('respects max logs limit', () => {
    const logsRef: { logs: ConsoleLog[] } = { logs: [] };
    const handler = createRejectionHandler(logsRef, 2);

    for (let i = 0; i < 5; i++) {
      handler({ reason: `Rejection ${i}` } as PromiseRejectionEvent);
    }

    expect(logsRef.logs.length).toBe(2);
  });
});

describe('MAX_CONSOLE_LOGS', () => {
  it('has a reasonable default value', () => {
    expect(MAX_CONSOLE_LOGS).toBeGreaterThan(0);
    expect(MAX_CONSOLE_LOGS).toBeLessThanOrEqual(1000);
  });
});

describe('ConsoleCapture - addListener / removeListener', () => {
  let capture: ConsoleCapture;
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let originalWarn: typeof console.warn;
  let originalInfo: typeof console.info;

  beforeEach(() => {
    originalLog = console.log;
    originalError = console.error;
    originalWarn = console.warn;
    originalInfo = console.info;
    capture = new ConsoleCapture();
  });

  afterEach(() => {
    capture.stop();
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
  });

  it('notifies listener on each captured log', () => {
    const listener = vi.fn();
    capture.addListener(listener);
    capture.start();

    console.log('msg');
    expect(listener).toHaveBeenCalledTimes(1);

    console.error('err');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('passes current error, warning, and info counts to listener', () => {
    const listener = vi.fn();
    capture.addListener(listener);
    capture.start();

    console.error('e1');
    expect(listener).toHaveBeenLastCalledWith(1, 0, 0);

    console.warn('w1');
    expect(listener).toHaveBeenLastCalledWith(1, 1, 0);

    console.info('i1');
    expect(listener).toHaveBeenLastCalledWith(1, 1, 1);
  });

  it('supports multiple listeners', () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    capture.addListener(listenerA);
    capture.addListener(listenerB);
    capture.start();

    console.log('test');

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);
  });

  it('stops notifying after removeListener', () => {
    const listener = vi.fn();
    capture.addListener(listener);
    capture.start();

    console.log('before');
    expect(listener).toHaveBeenCalledTimes(1);

    capture.removeListener(listener);

    console.log('after');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('removeListener does nothing if listener was not added', () => {
    const listener = vi.fn();
    // Should not throw
    capture.removeListener(listener);
  });

  it('ignores errors thrown by listeners', () => {
    const badListener = vi.fn(() => {
      throw new Error('listener error');
    });
    const goodListener = vi.fn();

    capture.addListener(badListener);
    capture.addListener(goodListener);
    capture.start();

    console.log('test');

    expect(badListener).toHaveBeenCalledTimes(1);
    expect(goodListener).toHaveBeenCalledTimes(1);
  });
});

describe('ConsoleCapture - getInfoCount', () => {
  let capture: ConsoleCapture;
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let originalWarn: typeof console.warn;
  let originalInfo: typeof console.info;

  beforeEach(() => {
    originalLog = console.log;
    originalError = console.error;
    originalWarn = console.warn;
    originalInfo = console.info;
    capture = new ConsoleCapture();
  });

  afterEach(() => {
    capture.stop();
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
  });

  it('starts at zero', () => {
    expect(capture.getInfoCount()).toBe(0);
  });

  it('increments on console.info calls', () => {
    capture.start();
    console.info('info 1');
    console.info('info 2');
    console.info('info 3');

    expect(capture.getInfoCount()).toBe(3);
  });

  it('does not increment on other log levels', () => {
    capture.start();
    console.log('log');
    console.error('error');
    console.warn('warn');

    expect(capture.getInfoCount()).toBe(0);
  });

  it('resets to zero on clear', () => {
    capture.start();
    console.info('info');
    expect(capture.getInfoCount()).toBe(1);

    capture.clear();
    expect(capture.getInfoCount()).toBe(0);
  });

  it('does not track counts when trackCounts is false', () => {
    const noTrackCapture = new ConsoleCapture({ trackCounts: false });
    noTrackCapture.start();

    console.error('e');
    console.warn('w');
    console.info('i');

    expect(noTrackCapture.getErrorCount()).toBe(0);
    expect(noTrackCapture.getWarningCount()).toBe(0);
    expect(noTrackCapture.getInfoCount()).toBe(0);

    noTrackCapture.stop();
  });
});

describe('ConsoleCapture - addLog', () => {
  let capture: ConsoleCapture;

  beforeEach(() => {
    capture = new ConsoleCapture();
  });

  it('inserts a log entry directly', () => {
    const log: ConsoleLog = { level: 'error', message: 'direct error', timestamp: 12345 };
    capture.addLog(log);

    const logs = capture.getLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].message).toBe('direct error');
    expect(logs[0].level).toBe('error');
  });

  it('increments error count for error-level logs', () => {
    capture.addLog({ level: 'error', message: 'err', timestamp: 1 });
    expect(capture.getErrorCount()).toBe(1);
  });

  it('does not increment warning or info counts via addLog', () => {
    capture.addLog({ level: 'warn', message: 'w', timestamp: 1 });
    capture.addLog({ level: 'info', message: 'i', timestamp: 1 });

    // addLog only tracks error counts (see source: only checks level === 'error')
    expect(capture.getWarningCount()).toBe(0);
    expect(capture.getInfoCount()).toBe(0);
  });

  it('respects maxLogs truncation', () => {
    const smallCapture = new ConsoleCapture({ maxLogs: 2 });

    smallCapture.addLog({ level: 'log', message: 'one', timestamp: 1 });
    smallCapture.addLog({ level: 'log', message: 'two', timestamp: 2 });
    smallCapture.addLog({ level: 'log', message: 'three', timestamp: 3 });

    const logs = smallCapture.getLogs();
    expect(logs.length).toBe(2);
    expect(logs[0].message).toBe('two');
    expect(logs[1].message).toBe('three');
  });

  it('notifies listeners when adding a log', () => {
    const listener = vi.fn();
    capture.addListener(listener);

    capture.addLog({ level: 'error', message: 'test', timestamp: 1 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(1, 0, 0);
  });
});

describe('ConsoleCapture - importEarlyLogs', () => {
  let capture: ConsoleCapture;

  beforeEach(() => {
    capture = new ConsoleCapture();
  });

  afterEach(() => {
    delete (window as Record<string, unknown>).__sweetlinkEarlyLogs;
  });

  it('imports early logs from window.__sweetlinkEarlyLogs', () => {
    window.__sweetlinkEarlyLogs = [
      { level: 'log', message: 'early msg', timestamp: '2024-01-15T10:00:00.000Z' },
      { level: 'error', message: 'early error', timestamp: '2024-01-15T10:00:01.000Z' },
    ];

    capture.importEarlyLogs();

    const logs = capture.getLogs();
    expect(logs.length).toBe(2);
    expect(logs[0].message).toBe('early msg');
    expect(logs[0].level).toBe('log');
    expect(logs[1].message).toBe('early error');
    expect(logs[1].level).toBe('error');
  });

  it('converts ISO timestamp strings to epoch milliseconds', () => {
    const isoString = '2024-01-15T10:30:00.000Z';
    window.__sweetlinkEarlyLogs = [
      { level: 'log', message: 'test', timestamp: isoString },
    ];

    capture.importEarlyLogs();

    const logs = capture.getLogs();
    expect(logs[0].timestamp).toBe(new Date(isoString).getTime());
  });

  it('clears window.__sweetlinkEarlyLogs after import', () => {
    window.__sweetlinkEarlyLogs = [
      { level: 'log', message: 'msg', timestamp: '2024-01-01T00:00:00.000Z' },
    ];

    capture.importEarlyLogs();

    expect(window.__sweetlinkEarlyLogs).toEqual([]);
  });

  it('does nothing when window.__sweetlinkEarlyLogs is undefined', () => {
    delete (window as Record<string, unknown>).__sweetlinkEarlyLogs;

    // Should not throw
    capture.importEarlyLogs();

    expect(capture.getLogs().length).toBe(0);
  });

  it('merges early logs before existing logs', () => {
    capture.addLog({ level: 'log', message: 'existing', timestamp: 5000 });

    window.__sweetlinkEarlyLogs = [
      { level: 'log', message: 'early', timestamp: '2024-01-01T00:00:00.000Z' },
    ];

    capture.importEarlyLogs();

    const logs = capture.getLogs();
    expect(logs.length).toBe(2);
    expect(logs[0].message).toBe('early');
    expect(logs[1].message).toBe('existing');
  });
});

describe('ConsoleCapture - importLogs truncation', () => {
  it('truncates to maxLogs after import', () => {
    const smallCapture = new ConsoleCapture({ maxLogs: 3 });

    // Add 2 existing logs
    smallCapture.addLog({ level: 'log', message: 'existing1', timestamp: 100 });
    smallCapture.addLog({ level: 'log', message: 'existing2', timestamp: 200 });

    // Import 3 more logs (total 5, should truncate to 3)
    const imported: ConsoleLog[] = [
      { level: 'log', message: 'imported1', timestamp: 1 },
      { level: 'log', message: 'imported2', timestamp: 2 },
      { level: 'log', message: 'imported3', timestamp: 3 },
    ];

    smallCapture.importLogs(imported);

    const logs = smallCapture.getLogs();
    expect(logs.length).toBe(3);
    // importLogs prepends imported logs, then slices from the end
    // [imported1, imported2, imported3, existing1, existing2] -> last 3
    expect(logs[0].message).toBe('imported3');
    expect(logs[1].message).toBe('existing1');
    expect(logs[2].message).toBe('existing2');
  });
});

describe('ConsoleCapture - stop without start', () => {
  it('does not throw when stop is called without start', () => {
    const capture = new ConsoleCapture();
    expect(() => capture.stop()).not.toThrow();
  });
});

describe('ConsoleCapture - getFilteredLogs case insensitivity', () => {
  let capture: ConsoleCapture;
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let originalWarn: typeof console.warn;
  let originalInfo: typeof console.info;

  beforeEach(() => {
    originalLog = console.log;
    originalError = console.error;
    originalWarn = console.warn;
    originalInfo = console.info;
    capture = new ConsoleCapture();
  });

  afterEach(() => {
    capture.stop();
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
  });

  it('filters are case-insensitive for message content', () => {
    capture.start();
    console.log('Hello World');
    console.log('goodbye');

    const filtered = capture.getFilteredLogs('HELLO');
    expect(filtered.length).toBe(1);
    expect(filtered[0].message).toBe('Hello World');
  });

  it('filters by level match (case-insensitive)', () => {
    capture.start();
    console.error('err msg');
    console.log('log msg');

    const filtered = capture.getFilteredLogs('ERROR');
    expect(filtered.length).toBe(1);
    expect(filtered[0].level).toBe('error');
  });
});
