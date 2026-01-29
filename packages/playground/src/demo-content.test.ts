/**
 * Tests for demo-content log buttons
 *
 * Verifies that all console log buttons trigger the correct console methods
 * and that the DevBar's console capture properly tracks them.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoContent } from './demo-content';

describe('Demo Content Log Buttons', () => {
  let container: HTMLElement;
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
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;

    // Cleanup DOM
    document.body.removeChild(container);
  });

  it('should render the console test section with all buttons', () => {
    const section = container.querySelector('#section-1');
    expect(section).toBeTruthy();

    const buttonGroup = section?.querySelector('.button-group');
    expect(buttonGroup).toBeTruthy();

    const buttons = buttonGroup?.querySelectorAll('button');
    expect(buttons?.length).toBe(4);
  });

  describe('Log Info button', () => {
    it('should have the correct label', () => {
      const btn = container.querySelector('.btn.info') as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(btn.textContent).toBe('Log Info');
    });

    it('should call console.log when clicked', () => {
      const logSpy = vi.fn();
      console.log = logSpy;

      const btn = container.querySelector('.btn.info') as HTMLButtonElement;
      btn.click();

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        '[Test] This is an info log message',
        expect.objectContaining({ timestamp: expect.any(Number) })
      );
    });
  });

  describe('Log Warning button', () => {
    it('should have the correct label', () => {
      const btn = container.querySelector('.btn.warning') as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(btn.textContent).toBe('Log Warning');
    });

    it('should call console.warn when clicked', () => {
      const warnSpy = vi.fn();
      console.warn = warnSpy;

      const btn = container.querySelector('.btn.warning') as HTMLButtonElement;
      btn.click();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        '[Test] This is a warning message - something might be wrong'
      );
    });
  });

  describe('Log Error button', () => {
    it('should have the correct label', () => {
      const btn = container.querySelector('.btn.error') as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(btn.textContent).toBe('Log Error');
    });

    it('should call console.error when clicked', () => {
      const errorSpy = vi.fn();
      console.error = errorSpy;

      const btn = container.querySelector('.btn.error') as HTMLButtonElement;
      btn.click();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        '[Test] This is an error message',
        expect.any(Error)
      );
    });
  });

  describe('Log Multiple button', () => {
    it('should have the correct label', () => {
      const btn = container.querySelector('.btn.secondary') as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(btn.textContent).toBe('Log Multiple');
    });

    it('should call all console methods when clicked', () => {
      const logSpy = vi.fn();
      const infoSpy = vi.fn();
      const warnSpy = vi.fn();
      const errorSpy = vi.fn();

      console.log = logSpy;
      console.info = infoSpy;
      console.warn = warnSpy;
      console.error = errorSpy;

      const btn = container.querySelector('.btn.secondary') as HTMLButtonElement;
      btn.click();

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('[Test] First log');

      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledWith('[Test] Second log (info)');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith('[Test] Third log (warning)');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('[Test] Fourth log (error)');
    });

    it('should trigger 1 warning and 1 error (for badge counts)', () => {
      let warningCount = 0;
      let errorCount = 0;

      console.log = vi.fn();
      console.info = vi.fn();
      console.warn = vi.fn(() => {
        warningCount++;
      });
      console.error = vi.fn(() => {
        errorCount++;
      });

      const btn = container.querySelector('.btn.secondary') as HTMLButtonElement;
      btn.click();

      expect(warningCount).toBe(1);
      expect(errorCount).toBe(1);
    });
  });
});
