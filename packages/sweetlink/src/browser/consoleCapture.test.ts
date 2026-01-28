import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatArg,
  formatArgs,
  ConsoleCapture,
  createErrorHandler,
  createRejectionHandler,
  MAX_CONSOLE_LOGS,
} from './consoleCapture.js';
import type { ConsoleLog } from '../types.js';

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
    expect(onLog).toHaveBeenCalledWith(expect.objectContaining({
      level: 'log',
      message: 'test',
    }));

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
    const existingLogs: ConsoleLog[] = [
      { level: 'log', message: 'old log', timestamp: 1000 },
    ];

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
