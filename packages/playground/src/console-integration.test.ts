/**
 * Integration tests for console capture with DevBar
 *
 * Tests that the ConsoleCapture class properly tracks log messages
 * and counts errors/warnings that would be displayed in DevBar badges.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleCapture } from '@ytspar/sweetlink/browser/consoleCapture';
import { createDemoContent } from './demo-content';

describe('Console Capture Integration', () => {
  let container: HTMLElement;
  let capture: ConsoleCapture;
  let originalLog: typeof console.log;
  let originalInfo: typeof console.info;
  let originalWarn: typeof console.warn;
  let originalError: typeof console.error;

  beforeEach(() => {
    // Store original console methods
    originalLog = console.log;
    originalInfo = console.info;
    originalWarn = console.warn;
    originalError = console.error;

    // Create demo content
    container = createDemoContent();
    document.body.appendChild(container);

    // Initialize console capture
    capture = new ConsoleCapture();
    capture.start();
  });

  afterEach(() => {
    // Stop capture and restore console
    capture.stop();

    // Restore console methods
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;

    // Cleanup DOM
    document.body.removeChild(container);
  });

  describe('Log Info button with capture', () => {
    it('should capture the log message', () => {
      const btn = container.querySelector('.btn.info') as HTMLButtonElement;
      btn.click();

      const logs = capture.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe('log');
      expect(logs[0].message).toContain('[Test] This is an info log message');
    });

    it('should not increment error or warning counts', () => {
      const btn = container.querySelector('.btn.info') as HTMLButtonElement;
      btn.click();

      expect(capture.getErrorCount()).toBe(0);
      expect(capture.getWarningCount()).toBe(0);
    });
  });

  describe('Log Warning button with capture', () => {
    it('should capture the warning message', () => {
      const btn = container.querySelector('.btn.warning') as HTMLButtonElement;
      btn.click();

      const logs = capture.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe('warn');
      expect(logs[0].message).toContain('[Test] This is a warning message');
    });

    it('should increment warning count', () => {
      const btn = container.querySelector('.btn.warning') as HTMLButtonElement;
      btn.click();

      expect(capture.getWarningCount()).toBe(1);
      expect(capture.getErrorCount()).toBe(0);
    });

    it('should increment warning count multiple times', () => {
      const btn = container.querySelector('.btn.warning') as HTMLButtonElement;
      btn.click();
      btn.click();
      btn.click();

      expect(capture.getWarningCount()).toBe(3);
    });
  });

  describe('Log Error button with capture', () => {
    it('should capture the error message', () => {
      const btn = container.querySelector('.btn.error') as HTMLButtonElement;
      btn.click();

      const logs = capture.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe('error');
      expect(logs[0].message).toContain('[Test] This is an error message');
    });

    it('should increment error count', () => {
      const btn = container.querySelector('.btn.error') as HTMLButtonElement;
      btn.click();

      expect(capture.getErrorCount()).toBe(1);
      expect(capture.getWarningCount()).toBe(0);
    });

    it('should increment error count multiple times', () => {
      const btn = container.querySelector('.btn.error') as HTMLButtonElement;
      btn.click();
      btn.click();

      expect(capture.getErrorCount()).toBe(2);
    });
  });

  describe('Log Multiple button with capture', () => {
    it('should capture all 4 messages', () => {
      const btn = container.querySelector('.btn.secondary') as HTMLButtonElement;
      btn.click();

      const logs = capture.getLogs();
      expect(logs.length).toBe(4);
    });

    it('should have correct log levels', () => {
      const btn = container.querySelector('.btn.secondary') as HTMLButtonElement;
      btn.click();

      const logs = capture.getLogs();
      expect(logs[0].level).toBe('log');
      expect(logs[1].level).toBe('info');
      expect(logs[2].level).toBe('warn');
      expect(logs[3].level).toBe('error');
    });

    it('should increment both warning and error counts by 1 each', () => {
      const btn = container.querySelector('.btn.secondary') as HTMLButtonElement;
      btn.click();

      expect(capture.getWarningCount()).toBe(1);
      expect(capture.getErrorCount()).toBe(1);
    });

    it('should have correct messages', () => {
      const btn = container.querySelector('.btn.secondary') as HTMLButtonElement;
      btn.click();

      const logs = capture.getLogs();
      expect(logs[0].message).toBe('[Test] First log');
      expect(logs[1].message).toBe('[Test] Second log (info)');
      expect(logs[2].message).toBe('[Test] Third log (warning)');
      expect(logs[3].message).toBe('[Test] Fourth log (error)');
    });
  });

  describe('Multiple button clicks', () => {
    it('should accumulate logs from different buttons', () => {
      const infoBtn = container.querySelector('.btn.info') as HTMLButtonElement;
      const warnBtn = container.querySelector('.btn.warning') as HTMLButtonElement;
      const errorBtn = container.querySelector('.btn.error') as HTMLButtonElement;

      infoBtn.click();
      warnBtn.click();
      errorBtn.click();

      const logs = capture.getLogs();
      expect(logs.length).toBe(3);
      expect(logs[0].level).toBe('log');
      expect(logs[1].level).toBe('warn');
      expect(logs[2].level).toBe('error');
    });

    it('should correctly sum error and warning counts', () => {
      const infoBtn = container.querySelector('.btn.info') as HTMLButtonElement;
      const warnBtn = container.querySelector('.btn.warning') as HTMLButtonElement;
      const errorBtn = container.querySelector('.btn.error') as HTMLButtonElement;
      const multiBtn = container.querySelector('.btn.secondary') as HTMLButtonElement;

      // Click each button once
      infoBtn.click(); // 0 errors, 0 warnings
      warnBtn.click(); // 0 errors, 1 warning
      errorBtn.click(); // 1 error, 1 warning
      multiBtn.click(); // 2 errors, 2 warnings (multi adds 1 of each)

      expect(capture.getErrorCount()).toBe(2);
      expect(capture.getWarningCount()).toBe(2);
    });
  });

  describe('Console capture state', () => {
    it('should return complete state object', () => {
      const errorBtn = container.querySelector('.btn.error') as HTMLButtonElement;
      const warnBtn = container.querySelector('.btn.warning') as HTMLButtonElement;

      errorBtn.click();
      warnBtn.click();

      const state = capture.getState();
      expect(state.logs.length).toBe(2);
      expect(state.errorCount).toBe(1);
      expect(state.warningCount).toBe(1);
      expect(state.isPatched).toBe(true);
    });

    it('should allow filtering logs by level', () => {
      const multiBtn = container.querySelector('.btn.secondary') as HTMLButtonElement;
      multiBtn.click();

      const errors = capture.getFilteredLogs('error');
      expect(errors.length).toBe(1);
      expect(errors[0].level).toBe('error');

      const warnings = capture.getFilteredLogs('warn');
      expect(warnings.length).toBe(1);
      expect(warnings[0].level).toBe('warn');
    });

    it('should allow clearing logs', () => {
      const multiBtn = container.querySelector('.btn.secondary') as HTMLButtonElement;
      multiBtn.click();

      expect(capture.getLogs().length).toBe(4);
      capture.clear();

      expect(capture.getLogs().length).toBe(0);
      expect(capture.getErrorCount()).toBe(0);
      expect(capture.getWarningCount()).toBe(0);
    });
  });
});
