import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EARLY_CONSOLE_CAPTURE_SCRIPT } from './earlyConsoleCapture.js';

describe('EARLY_CONSOLE_CAPTURE_SCRIPT', () => {
  it('is a non-empty string', () => {
    expect(typeof EARLY_CONSOLE_CAPTURE_SCRIPT).toBe('string');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT.length).toBeGreaterThan(0);
  });

  it('contains the __sweetlinkEarlyLogs initialization', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('__sweetlinkEarlyLogs');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('window.__sweetlinkEarlyLogs = []');
  });

  it('patches all four console methods', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('console.log');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('console.error');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('console.warn');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('console.info');
  });

  it('stores original console methods for passthrough', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('log: console.log');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('error: console.error');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('warn: console.warn');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('info: console.info');
  });

  it('captures the log level in each entry', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain("level: level");
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain("capture('log'");
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain("capture('error'");
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain("capture('warn'");
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain("capture('info'");
  });

  it('records ISO timestamp strings', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('new Date().toISOString()');
  });

  it('includes formatArg function for serialization', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('function formatArg');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('JSON.stringify');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('instanceof Error');
  });

  it('handles Error objects in formatArg', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('a.name');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('a.message');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('a.stack');
  });

  it('listens for uncaught error events', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain("addEventListener('error'");
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('Uncaught');
  });

  it('listens for unhandled promise rejections', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain("addEventListener('unhandledrejection'");
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('Unhandled Promise Rejection');
  });

  it('guards against double initialization', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('if (window.__sweetlinkEarlyLogs) return');
  });

  it('is wrapped in an IIFE', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('(function()');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('})()');
  });

  it('calls original console methods via apply for passthrough', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('orig.log.apply');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('orig.error.apply');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('orig.warn.apply');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('orig.info.apply');
  });
});

describe('EARLY_CONSOLE_CAPTURE_SCRIPT - execution behavior', () => {
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let originalWarn: typeof console.warn;
  let originalInfo: typeof console.info;

  /**
   * Helper to run the early capture script in the current window context.
   * This uses indirect eval, which is the same mechanism a browser uses
   * when it encounters an inline <script> tag containing this code.
   */
  function runEarlyCaptureScript(): void {
    // indirect eval to execute in global scope, matching how browsers
    // run inline <script> tags
    const indirectEval = eval; // eslint-disable-line no-eval
    indirectEval(EARLY_CONSOLE_CAPTURE_SCRIPT);
  }

  beforeEach(() => {
    originalLog = console.log;
    originalError = console.error;
    originalWarn = console.warn;
    originalInfo = console.info;
    // Clear any previous early logs
    delete (window as Record<string, unknown>).__sweetlinkEarlyLogs;
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
    delete (window as Record<string, unknown>).__sweetlinkEarlyLogs;
  });

  it('creates window.__sweetlinkEarlyLogs when executed', () => {
    runEarlyCaptureScript();

    expect(window.__sweetlinkEarlyLogs).toBeDefined();
    expect(Array.isArray(window.__sweetlinkEarlyLogs)).toBe(true);
  });

  it('captures console.log calls after execution', () => {
    runEarlyCaptureScript();

    console.log('test message');

    expect(window.__sweetlinkEarlyLogs!.length).toBe(1);
    expect(window.__sweetlinkEarlyLogs![0].level).toBe('log');
    expect(window.__sweetlinkEarlyLogs![0].message).toBe('test message');
    expect(typeof window.__sweetlinkEarlyLogs![0].timestamp).toBe('string');
  });

  it('captures console.error calls', () => {
    runEarlyCaptureScript();

    console.error('an error occurred');

    expect(window.__sweetlinkEarlyLogs!.length).toBe(1);
    expect(window.__sweetlinkEarlyLogs![0].level).toBe('error');
    expect(window.__sweetlinkEarlyLogs![0].message).toBe('an error occurred');
  });

  it('captures console.warn calls', () => {
    runEarlyCaptureScript();

    console.warn('a warning');

    expect(window.__sweetlinkEarlyLogs!.length).toBe(1);
    expect(window.__sweetlinkEarlyLogs![0].level).toBe('warn');
    expect(window.__sweetlinkEarlyLogs![0].message).toBe('a warning');
  });

  it('captures console.info calls', () => {
    runEarlyCaptureScript();

    console.info('some info');

    expect(window.__sweetlinkEarlyLogs!.length).toBe(1);
    expect(window.__sweetlinkEarlyLogs![0].level).toBe('info');
    expect(window.__sweetlinkEarlyLogs![0].message).toBe('some info');
  });

  it('captures multiple arguments joined by spaces', () => {
    runEarlyCaptureScript();

    console.log('hello', 'world', 42);

    expect(window.__sweetlinkEarlyLogs![0].message).toBe('hello world 42');
  });

  it('formats object arguments as JSON', () => {
    runEarlyCaptureScript();

    console.log('data:', { key: 'value' });

    expect(window.__sweetlinkEarlyLogs![0].message).toContain('data:');
    expect(window.__sweetlinkEarlyLogs![0].message).toContain('"key":"value"');
  });

  it('formats Error objects with name and message', () => {
    runEarlyCaptureScript();

    const err = new Error('test error');
    console.error(err);

    const msg = window.__sweetlinkEarlyLogs![0].message;
    expect(msg).toContain('Error');
    expect(msg).toContain('test error');
  });

  it('stores ISO timestamp strings', () => {
    runEarlyCaptureScript();

    console.log('timestamp test');

    const ts = window.__sweetlinkEarlyLogs![0].timestamp;
    // Should be a valid ISO string parseable by Date
    expect(new Date(ts).getTime()).not.toBeNaN();
  });

  it('does not double-initialize when executed twice', () => {
    runEarlyCaptureScript();
    console.log('first');

    // Execute again
    runEarlyCaptureScript();
    console.log('second');

    // If it double-initialized, we would see duplicated or missing logs.
    // The guard clause ensures we keep the same array.
    expect(window.__sweetlinkEarlyLogs!.length).toBe(2);
  });

  it('captures multiple log levels in order', () => {
    runEarlyCaptureScript();

    console.log('log msg');
    console.error('error msg');
    console.warn('warn msg');
    console.info('info msg');

    expect(window.__sweetlinkEarlyLogs!.length).toBe(4);
    expect(window.__sweetlinkEarlyLogs![0].level).toBe('log');
    expect(window.__sweetlinkEarlyLogs![1].level).toBe('error');
    expect(window.__sweetlinkEarlyLogs![2].level).toBe('warn');
    expect(window.__sweetlinkEarlyLogs![3].level).toBe('info');
  });
});
