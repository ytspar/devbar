import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEWPORT, VIEWPORT_PRESETS, parseViewport } from './viewportUtils.js';

describe('VIEWPORT_PRESETS', () => {
  it('defines a default preset', () => {
    expect(VIEWPORT_PRESETS.default).toEqual({ width: 1512, height: 3000 });
  });

  it('defines a mobile preset', () => {
    expect(VIEWPORT_PRESETS.mobile).toEqual({ width: 375, height: 667 });
  });

  it('defines a tablet preset', () => {
    expect(VIEWPORT_PRESETS.tablet).toEqual({ width: 768, height: 1024 });
  });

  it('defines a desktop preset', () => {
    expect(VIEWPORT_PRESETS.desktop).toEqual({ width: 1440, height: 900 });
  });
});

describe('DEFAULT_VIEWPORT', () => {
  it('has expected dimensions', () => {
    expect(DEFAULT_VIEWPORT).toEqual({ width: 1512, height: 982 });
  });
});

describe('parseViewport', () => {
  describe('named presets', () => {
    it('returns mobile preset with isMobile=true', () => {
      const result = parseViewport('mobile');
      expect(result).toEqual({
        width: 375,
        height: 667,
        isMobile: true,
      });
    });

    it('returns tablet preset with isMobile=true', () => {
      const result = parseViewport('tablet');
      expect(result).toEqual({
        width: 768,
        height: 1024,
        isMobile: true,
      });
    });

    it('returns desktop preset with isMobile=false', () => {
      const result = parseViewport('desktop');
      expect(result).toEqual({
        width: 1440,
        height: 900,
        isMobile: false,
      });
    });

    it('handles case-insensitive preset names', () => {
      expect(parseViewport('MOBILE')).toEqual(parseViewport('mobile'));
      expect(parseViewport('Tablet')).toEqual(parseViewport('tablet'));
      expect(parseViewport('DESKTOP')).toEqual(parseViewport('desktop'));
    });
  });

  describe('custom dimensions', () => {
    it('parses widthxheight format', () => {
      const result = parseViewport('800x600');
      expect(result).toEqual({
        width: 800,
        height: 600,
        isMobile: false,
      });
    });

    it('parses large dimensions', () => {
      const result = parseViewport('1920x1080');
      expect(result).toEqual({
        width: 1920,
        height: 1080,
        isMobile: false,
      });
    });

    it('parses small dimensions', () => {
      const result = parseViewport('320x480');
      expect(result).toEqual({
        width: 320,
        height: 480,
        isMobile: false,
      });
    });
  });

  describe('default viewport', () => {
    it('returns default when no argument is provided', () => {
      const result = parseViewport();
      expect(result).toEqual({
        width: VIEWPORT_PRESETS.default.width,
        height: VIEWPORT_PRESETS.default.height,
        isMobile: false,
      });
    });

    it('returns default when undefined is provided', () => {
      const result = parseViewport(undefined);
      expect(result).toEqual({
        width: VIEWPORT_PRESETS.default.width,
        height: VIEWPORT_PRESETS.default.height,
        isMobile: false,
      });
    });

    it('returns default when empty string is provided', () => {
      const result = parseViewport('');
      expect(result).toEqual({
        width: VIEWPORT_PRESETS.default.width,
        height: VIEWPORT_PRESETS.default.height,
        isMobile: false,
      });
    });

    it('accepts a custom default viewport', () => {
      const customDefault = { width: 1000, height: 800 };
      const result = parseViewport(undefined, customDefault);
      expect(result).toEqual({
        width: 1000,
        height: 800,
        isMobile: false,
      });
    });

    it('uses custom default when empty string is provided', () => {
      const customDefault = { width: 500, height: 400 };
      const result = parseViewport('', customDefault);
      expect(result).toEqual({
        width: 500,
        height: 400,
        isMobile: false,
      });
    });
  });

  describe('invalid input handling', () => {
    it('falls back to default for unrecognized preset name', () => {
      const result = parseViewport('ultrawide');
      expect(result).toEqual({
        width: VIEWPORT_PRESETS.default.width,
        height: VIEWPORT_PRESETS.default.height,
        isMobile: false,
      });
    });

    it('falls back to default for malformed dimensions (no x separator)', () => {
      const result = parseViewport('800-600');
      expect(result).toEqual({
        width: VIEWPORT_PRESETS.default.width,
        height: VIEWPORT_PRESETS.default.height,
        isMobile: false,
      });
    });

    it('falls back to default for non-numeric dimensions', () => {
      const result = parseViewport('abcxdef');
      expect(result).toEqual({
        width: VIEWPORT_PRESETS.default.width,
        height: VIEWPORT_PRESETS.default.height,
        isMobile: false,
      });
    });

    it('falls back to default for partial dimensions', () => {
      const result = parseViewport('800x');
      expect(result).toEqual({
        width: VIEWPORT_PRESETS.default.width,
        height: VIEWPORT_PRESETS.default.height,
        isMobile: false,
      });
    });

    it('falls back to default for extra x separators', () => {
      const result = parseViewport('800x600x400');
      expect(result).toEqual({
        width: VIEWPORT_PRESETS.default.width,
        height: VIEWPORT_PRESETS.default.height,
        isMobile: false,
      });
    });

    it('falls back to custom default for unrecognized name', () => {
      const customDefault = { width: 999, height: 777 };
      const result = parseViewport('unknown', customDefault);
      expect(result).toEqual({
        width: 999,
        height: 777,
        isMobile: false,
      });
    });
  });
});
