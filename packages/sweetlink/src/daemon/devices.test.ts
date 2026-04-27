// @vitest-environment node

/**
 * Device Emulation Tests
 *
 * Tests parseDevice parsing and DEVICE_PRESETS constants.
 */

import { describe, expect, it } from 'vitest';
import { DEVICE_PRESETS, parseDevice } from './devices.js';

describe('DEVICE_PRESETS', () => {
  it('contains expected device keys', () => {
    const keys = Object.keys(DEVICE_PRESETS);
    expect(keys).toContain('iphone-14');
    expect(keys).toContain('iphone-se');
    expect(keys).toContain('pixel-7');
    expect(keys).toContain('ipad-pro-11');
    expect(keys).toContain('ipad-mini');
    expect(keys).toContain('desktop');
    expect(keys).toContain('desktop-hd');
  });

  it('all presets have required viewport dimensions', () => {
    for (const [key, device] of Object.entries(DEVICE_PRESETS)) {
      expect(device.viewport.width, `${key} width`).toBeGreaterThan(0);
      expect(device.viewport.height, `${key} height`).toBeGreaterThan(0);
      expect(device.name, `${key} name`).toBeTruthy();
    }
  });

  it('mobile devices have isMobile=true and hasTouch=true', () => {
    const mobileDevices = ['iphone-14', 'iphone-se', 'pixel-7', 'ipad-pro-11', 'ipad-mini'];
    for (const key of mobileDevices) {
      const device = DEVICE_PRESETS[key]!;
      expect(device.isMobile, `${key} isMobile`).toBe(true);
      expect(device.hasTouch, `${key} hasTouch`).toBe(true);
    }
  });

  it('desktop devices have isMobile=false', () => {
    expect(DEVICE_PRESETS.desktop!.isMobile).toBe(false);
    expect(DEVICE_PRESETS['desktop-hd']!.isMobile).toBe(false);
  });

  it('iphone-14 has correct viewport', () => {
    expect(DEVICE_PRESETS['iphone-14']!.viewport).toEqual({ width: 390, height: 844 });
  });

  it('desktop-hd has 1920x1080 viewport', () => {
    expect(DEVICE_PRESETS['desktop-hd']!.viewport).toEqual({ width: 1920, height: 1080 });
  });
});

describe('parseDevice', () => {
  describe('named presets', () => {
    it('resolves known preset by exact name', () => {
      const device = parseDevice('iphone-14');
      expect(device).not.toBeNull();
      expect(device!.name).toBe('iPhone 14');
      expect(device!.viewport).toEqual({ width: 390, height: 844 });
    });

    it('resolves preset case-insensitively', () => {
      const device = parseDevice('iPhone-14');
      expect(device).not.toBeNull();
      expect(device!.name).toBe('iPhone 14');
    });

    it('normalizes spaces to hyphens', () => {
      const device = parseDevice('iPad Pro 11');
      expect(device).not.toBeNull();
      expect(device!.name).toBe('iPad Pro 11');
    });

    it('resolves desktop preset', () => {
      const device = parseDevice('desktop');
      expect(device).not.toBeNull();
      expect(device!.viewport).toEqual({ width: 1440, height: 900 });
    });

    it('resolves desktop-hd preset', () => {
      const device = parseDevice('Desktop HD');
      expect(device).not.toBeNull();
      expect(device!.viewport).toEqual({ width: 1920, height: 1080 });
    });
  });

  describe('WxH format', () => {
    it('parses WIDTHxHEIGHT format', () => {
      const device = parseDevice('800x600');
      expect(device).not.toBeNull();
      expect(device!.name).toBe('Custom 800x600');
      expect(device!.viewport).toEqual({ width: 800, height: 600 });
    });

    it('parses large dimensions', () => {
      const device = parseDevice('2560x1440');
      expect(device).not.toBeNull();
      expect(device!.viewport).toEqual({ width: 2560, height: 1440 });
    });

    it('does not set mobile properties for custom viewports', () => {
      const device = parseDevice('375x812');
      expect(device).not.toBeNull();
      expect(device!.isMobile).toBeUndefined();
      expect(device!.hasTouch).toBeUndefined();
    });
  });

  describe('unknown names', () => {
    it('returns null for unknown device name', () => {
      expect(parseDevice('galaxy-s99')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseDevice('')).toBeNull();
    });

    it('returns null for malformed dimensions', () => {
      expect(parseDevice('800x')).toBeNull();
      expect(parseDevice('x600')).toBeNull();
      expect(parseDevice('800')).toBeNull();
    });

    it('returns null for non-numeric dimensions', () => {
      expect(parseDevice('abcxdef')).toBeNull();
    });
  });
});
