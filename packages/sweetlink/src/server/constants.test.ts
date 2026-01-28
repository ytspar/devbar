import { describe, it, expect } from 'vitest';
import { PACKAGE_INFO, SCREENSHOT_REQUEST_TIMEOUT_MS } from './constants.js';

describe('PACKAGE_INFO', () => {
  it('has required fields', () => {
    expect(PACKAGE_INFO.name).toBeDefined();
    expect(PACKAGE_INFO.version).toBeDefined();
    expect(PACKAGE_INFO.description).toBeDefined();
  });

  it('has correct package name', () => {
    expect(PACKAGE_INFO.name).toBe('@ytspar/sweetlink');
  });

  it('has version string', () => {
    expect(PACKAGE_INFO.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('has protocol type', () => {
    expect(PACKAGE_INFO.protocol).toBe('WebSocket');
  });
});

describe('SCREENSHOT_REQUEST_TIMEOUT_MS', () => {
  it('has reasonable timeout value', () => {
    expect(SCREENSHOT_REQUEST_TIMEOUT_MS).toBeGreaterThan(1000);
    expect(SCREENSHOT_REQUEST_TIMEOUT_MS).toBeLessThan(60000);
  });
});
