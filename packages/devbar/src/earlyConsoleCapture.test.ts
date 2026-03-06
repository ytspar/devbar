/**
 * Early Console Capture re-export tests
 *
 * The devbar earlyConsoleCapture.ts is a thin re-export of the sweetlink
 * EARLY_CONSOLE_CAPTURE_SCRIPT constant. These tests verify the re-export
 * works and the script string has the expected shape.
 */

import { describe, expect, it } from 'vitest';
import { EARLY_CONSOLE_CAPTURE_SCRIPT } from './earlyConsoleCapture.js';

describe('EARLY_CONSOLE_CAPTURE_SCRIPT re-export', () => {
  it('exports a non-empty string', () => {
    expect(typeof EARLY_CONSOLE_CAPTURE_SCRIPT).toBe('string');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT.length).toBeGreaterThan(0);
  });

  it('is an IIFE that can be used as an inline script', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('(function()');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('})()');
  });

  it('sets up window.__sweetlinkEarlyLogs', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('window.__sweetlinkEarlyLogs');
  });

  it('guards against double-initialization', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('if (window.__sweetlinkEarlyLogs) return');
  });

  it('patches console.log, error, warn, and info', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('console.log');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('console.error');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('console.warn');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('console.info');
  });

  it('captures uncaught errors via window error listener', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain("addEventListener('error'");
  });

  it('captures unhandled promise rejections', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain("addEventListener('unhandledrejection'");
  });

  it('includes a formatArg helper for serialization', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('function formatArg');
  });

  it('stores logs with level, message, and timestamp', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('level:');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('message:');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('timestamp:');
  });

  it('preserves original console methods (orig)', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('orig.log.apply');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('orig.error.apply');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('orig.warn.apply');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('orig.info.apply');
  });

  it('handles Error instances in formatArg', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('instanceof Error');
  });

  it('handles circular references with try/catch in JSON.stringify', () => {
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('JSON.stringify');
    expect(EARLY_CONSOLE_CAPTURE_SCRIPT).toContain('catch');
  });
});
