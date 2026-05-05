/**
 * Demo Mode Helper Tests
 *
 * The playground site sets `window.__devbarSweetlinkDemo = true` to enable
 * a fake Sweetlink bridge so the docs/demo can show realistic output without
 * a real daemon. These helpers gate behavior on that flag.
 *
 * The bug class we guard against here: a regression where
 * `isSweetlinkDemoMode()` always returns true (because someone replaced
 * `=== true` with `!=` or similar) would silently make every devbar
 * consumer think they're in demo mode and suppress real artifacts.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  getDemoArtifactWarning,
  getSweetlinkConnectionTooltip,
  isDemoArtifactPath,
  isSweetlinkDemoMode,
} from './demoMode.js';

type DemoWindow = Window & { __devbarSweetlinkDemo?: boolean };

afterEach(() => {
  delete (window as DemoWindow).__devbarSweetlinkDemo;
});

describe('isSweetlinkDemoMode', () => {
  it('returns false when the flag is not set', () => {
    expect(isSweetlinkDemoMode()).toBe(false);
  });

  it('returns false when the flag is set to a non-true value', () => {
    (window as DemoWindow).__devbarSweetlinkDemo = false;
    expect(isSweetlinkDemoMode()).toBe(false);
  });

  it('returns true only when the flag is exactly true (not truthy)', () => {
    // Strict equality guard means a string or 1 should NOT enable demo mode —
    // otherwise an accidental `.demo = "true"` from a test fixture would
    // poison real consumers.
    (window as DemoWindow).__devbarSweetlinkDemo = 'true' as unknown as boolean;
    expect(isSweetlinkDemoMode()).toBe(false);

    (window as DemoWindow).__devbarSweetlinkDemo = 1 as unknown as boolean;
    expect(isSweetlinkDemoMode()).toBe(false);

    (window as DemoWindow).__devbarSweetlinkDemo = true;
    expect(isSweetlinkDemoMode()).toBe(true);
  });
});

describe('isDemoArtifactPath', () => {
  it('treats paths under .sweetlink/demo/ as demo artifacts', () => {
    expect(isDemoArtifactPath('.sweetlink/demo/screenshot.png')).toBe(true);
    expect(isDemoArtifactPath('/Users/foo/.sweetlink/demo/x.md')).toBe(true);
  });

  it('treats normal paths as non-demo when not in demo mode', () => {
    expect(isDemoArtifactPath('.sweetlink/screenshots/x.png')).toBe(false);
    expect(isDemoArtifactPath('/tmp/x.txt')).toBe(false);
  });

  it('flags everything as demo when the global flag is on', () => {
    (window as DemoWindow).__devbarSweetlinkDemo = true;
    expect(isDemoArtifactPath('/tmp/anywhere.txt')).toBe(true);
    expect(isDemoArtifactPath('.sweetlink/screenshots/x.png')).toBe(true);
  });
});

describe('getDemoArtifactWarning', () => {
  it('returns a stable warning string', () => {
    expect(getDemoArtifactWarning()).toBe('Demo only: no local file was written.');
  });
});

describe('getSweetlinkConnectionTooltip', () => {
  it('shows demo-mode tooltip only when both connected and in demo mode', () => {
    (window as DemoWindow).__devbarSweetlinkDemo = true;
    expect(getSweetlinkConnectionTooltip(true)).toContain('demo mode');
    expect(getSweetlinkConnectionTooltip(false)).toContain('disconnected');
  });

  it('omits demo-mode wording in real (non-demo) mode', () => {
    expect(getSweetlinkConnectionTooltip(true)).toBe('Sweetlink connected');
    expect(getSweetlinkConnectionTooltip(false)).toBe('Sweetlink disconnected');
  });

  it('appends the action text in parentheses when provided', () => {
    expect(getSweetlinkConnectionTooltip(true, 'screenshot')).toBe(
      'Sweetlink connected (screenshot)'
    );
    expect(getSweetlinkConnectionTooltip(false, 'screenshot')).toBe(
      'Sweetlink disconnected (screenshot)'
    );
  });
});
