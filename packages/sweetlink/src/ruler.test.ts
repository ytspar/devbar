import { describe, expect, it } from 'vitest';
import { getCardHeaderPreset, getNavigationPreset, measureElementsScript } from './ruler.js';

describe('getCardHeaderPreset', () => {
  const preset = getCardHeaderPreset();

  it('returns selectors for card headers', () => {
    expect(preset.selectors).toEqual(['article h2', 'article header > div:first-child']);
  });

  it('enables center lines and dimensions', () => {
    expect(preset.showCenterLines).toBe(true);
    expect(preset.showDimensions).toBe(true);
  });

  it('enables alignment checking', () => {
    expect(preset.showAlignment).toBe(true);
  });

  it('limits to 3 elements', () => {
    expect(preset.limit).toBe(3);
  });
});

describe('getNavigationPreset', () => {
  const preset = getNavigationPreset();

  it('returns selectors for nav links and buttons', () => {
    expect(preset.selectors).toEqual(['nav a', 'nav button']);
  });

  it('enables center lines and dimensions', () => {
    expect(preset.showCenterLines).toBe(true);
    expect(preset.showDimensions).toBe(true);
  });

  it('enables alignment checking', () => {
    expect(preset.showAlignment).toBe(true);
  });

  it('limits to 10 elements', () => {
    expect(preset.limit).toBe(10);
  });
});

describe('measureElementsScript', () => {
  it('is a non-empty string', () => {
    expect(typeof measureElementsScript).toBe('string');
    expect(measureElementsScript.length).toBeGreaterThan(0);
  });

  it('is an IIFE function body', () => {
    expect(measureElementsScript.trim()).toMatch(/^\(function\(options\)/);
  });

  it('references expected DOM APIs', () => {
    expect(measureElementsScript).toContain('document.querySelectorAll');
    expect(measureElementsScript).toContain('getBoundingClientRect');
    expect(measureElementsScript).toContain('createElementNS');
  });
});
