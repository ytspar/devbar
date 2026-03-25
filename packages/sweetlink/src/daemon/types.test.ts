// @vitest-environment node

/**
 * Daemon Types & Constants Tests
 *
 * Verifies that exported constants have expected values.
 */

import { describe, expect, it } from 'vitest';
import {
  DAEMON_PORT_MIN,
  DAEMON_PORT_MAX,
  DAEMON_IDLE_TIMEOUT_MS,
  DAEMON_SPAWN_TIMEOUT_MS,
  DAEMON_POLL_INTERVAL_MS,
  DAEMON_STATE_DIR,
  DAEMON_STATE_FILE,
  DAEMON_LOCK_FILE,
  DEFAULT_RESPONSIVE_VIEWPORTS,
} from './types.js';

describe('daemon constants', () => {
  it('DAEMON_PORT_MIN is 10000', () => {
    expect(DAEMON_PORT_MIN).toBe(10000);
  });

  it('DAEMON_PORT_MAX is 60000', () => {
    expect(DAEMON_PORT_MAX).toBe(60000);
  });

  it('port range is valid (min < max)', () => {
    expect(DAEMON_PORT_MIN).toBeLessThan(DAEMON_PORT_MAX);
  });

  it('DAEMON_IDLE_TIMEOUT_MS is 30 minutes', () => {
    expect(DAEMON_IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });

  it('DAEMON_SPAWN_TIMEOUT_MS is 15 seconds', () => {
    expect(DAEMON_SPAWN_TIMEOUT_MS).toBe(15_000);
  });

  it('DAEMON_POLL_INTERVAL_MS is 200ms', () => {
    expect(DAEMON_POLL_INTERVAL_MS).toBe(200);
  });

  it('DAEMON_STATE_DIR is .sweetlink', () => {
    expect(DAEMON_STATE_DIR).toBe('.sweetlink');
  });

  it('DAEMON_STATE_FILE is daemon.json', () => {
    expect(DAEMON_STATE_FILE).toBe('daemon.json');
  });

  it('DAEMON_LOCK_FILE is daemon.lock', () => {
    expect(DAEMON_LOCK_FILE).toBe('daemon.lock');
  });

  it('DEFAULT_RESPONSIVE_VIEWPORTS has 3 widths', () => {
    expect(DEFAULT_RESPONSIVE_VIEWPORTS).toEqual([375, 768, 1280]);
  });

  it('DEFAULT_RESPONSIVE_VIEWPORTS are sorted ascending', () => {
    for (let i = 1; i < DEFAULT_RESPONSIVE_VIEWPORTS.length; i++) {
      expect(DEFAULT_RESPONSIVE_VIEWPORTS[i]!).toBeGreaterThan(
        DEFAULT_RESPONSIVE_VIEWPORTS[i - 1]!
      );
    }
  });
});
