/**
 * Icons UI tests
 *
 * Tests for SVG icon creation utilities and the devbar logo.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  createSvgIcon,
  createDevBarLogo,
  getDevBarLogoSvg,
  DEVBAR_LOGO_VIEWBOX,
  DEVBAR_LOGO_COLORS,
  DEVBAR_LOGO_PATHS,
  DEVBAR_LOGO_SHAPES,
} from './icons.js';

describe('createSvgIcon', () => {
  it('creates an SVG element', () => {
    const svg = createSvgIcon('M0 0L10 10', { fill: true });

    expect(svg.tagName).toBe('svg');
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });

  it('sets default width and height of 12', () => {
    const svg = createSvgIcon('M0 0', { fill: true });

    expect(svg.getAttribute('width')).toBe('12');
    expect(svg.getAttribute('height')).toBe('12');
  });

  it('uses default viewBox of 0 0 24 24', () => {
    const svg = createSvgIcon('M0 0', { fill: true });

    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
  });

  it('uses custom viewBox when provided', () => {
    const svg = createSvgIcon('M0 0', { viewBox: '0 0 16 16', fill: true });

    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
  });

  it('sets fill to currentColor when fill option is true', () => {
    const svg = createSvgIcon('M0 0', { fill: true });

    expect(svg.style.fill).toBe('currentColor');
  });

  it('does not set fill when fill option is false/undefined', () => {
    const svg = createSvgIcon('M0 0', { stroke: true });

    // When stroke is true, fill should be 'none'
    expect(svg.style.fill).toBe('none');
  });

  it('sets stroke to currentColor and fill to none when stroke option is true', () => {
    const svg = createSvgIcon('M0 0', { stroke: true });

    expect(svg.style.stroke).toBe('currentColor');
    expect(svg.style.fill).toBe('none');
  });

  it('contains a path element with the given path data', () => {
    const pathData = 'M12 2L2 22h20L12 2z';
    const svg = createSvgIcon(pathData, { fill: true });

    const path = svg.querySelector('path');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('d')).toBe(pathData);
  });

  it('path is in the SVG namespace', () => {
    const svg = createSvgIcon('M0 0', { fill: true });
    const path = svg.querySelector('path');

    expect(path!.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });
});

describe('DEVBAR_LOGO constants', () => {
  it('has the correct viewBox string', () => {
    expect(DEVBAR_LOGO_VIEWBOX).toBe('0 0 580.43 167.62');
  });

  it('has dark and light color variants', () => {
    expect(DEVBAR_LOGO_COLORS.dark).toBe('#10b981');
    expect(DEVBAR_LOGO_COLORS.light).toBe('#047857');
  });

  it('has all letter path data', () => {
    expect(DEVBAR_LOGO_PATHS.d).toBeTruthy();
    expect(DEVBAR_LOGO_PATHS.e).toBeTruthy();
    expect(DEVBAR_LOGO_PATHS.v).toBeTruthy();
    expect(DEVBAR_LOGO_PATHS.b).toBeTruthy();
    expect(DEVBAR_LOGO_PATHS.a).toBeTruthy();
    expect(DEVBAR_LOGO_PATHS.r).toBeTruthy();
    expect(DEVBAR_LOGO_PATHS.dLeftEdge).toBeTruthy();
  });

  it('has all shape data', () => {
    expect(DEVBAR_LOGO_SHAPES.topBar).toBeTruthy();
    expect(DEVBAR_LOGO_SHAPES.dStep1).toBeTruthy();
    expect(DEVBAR_LOGO_SHAPES.dStep2).toBeTruthy();
    expect(DEVBAR_LOGO_SHAPES.dStep3).toBeTruthy();
    expect(DEVBAR_LOGO_SHAPES.dCounter).toBeTruthy();
    expect(DEVBAR_LOGO_SHAPES.eCounter).toBeTruthy();
  });
});

describe('createDevBarLogo', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('creates an SVG element', () => {
    const logo = createDevBarLogo();

    expect(logo.tagName).toBe('svg');
    expect(logo.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });

  it('uses default width and height of 32', () => {
    const logo = createDevBarLogo();

    expect(logo.getAttribute('width')).toBe('32');
    expect(logo.getAttribute('height')).toBe('32');
  });

  it('uses custom width and height', () => {
    const logo = createDevBarLogo({ width: 64, height: 48 });

    expect(logo.getAttribute('width')).toBe('64');
    expect(logo.getAttribute('height')).toBe('48');
  });

  it('sets the logo viewBox', () => {
    const logo = createDevBarLogo();

    expect(logo.getAttribute('viewBox')).toBe(DEVBAR_LOGO_VIEWBOX);
  });

  it('has aria-label for accessibility', () => {
    const logo = createDevBarLogo();

    expect(logo.getAttribute('aria-label')).toBe('devbar logo');
  });

  it('sets fill to none on the root SVG', () => {
    const logo = createDevBarLogo();

    expect(logo.getAttribute('fill')).toBe('none');
  });

  it('includes a style element for themed colors by default', () => {
    const logo = createDevBarLogo();

    const style = logo.querySelector('style');
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain('devbar-logo-fill');
    expect(style!.textContent).toContain(DEVBAR_LOGO_COLORS.dark);
    expect(style!.textContent).toContain(DEVBAR_LOGO_COLORS.light);
  });

  it('uses devbar-logo-fill class on the group element when themed', () => {
    const logo = createDevBarLogo();

    const g = logo.querySelector('g');
    expect(g).not.toBeNull();
    expect(g!.getAttribute('class')).toBe('devbar-logo-fill');
  });

  it('uses custom fill color instead of theme when fill is specified', () => {
    const logo = createDevBarLogo({ fill: '#ff0000' });

    const style = logo.querySelector('style');
    expect(style).toBeNull();

    const g = logo.querySelector('g');
    expect(g!.getAttribute('fill')).toBe('#ff0000');
  });

  it('supports currentColor fill', () => {
    const logo = createDevBarLogo({ fill: 'currentColor' });

    const g = logo.querySelector('g');
    expect(g!.getAttribute('fill')).toBe('currentColor');
  });

  it('does not include style element when themed is false', () => {
    const logo = createDevBarLogo({ themed: false });

    const style = logo.querySelector('style');
    expect(style).toBeNull();

    // Should use default dark color directly
    const g = logo.querySelector('g');
    expect(g!.getAttribute('fill')).toBe(DEVBAR_LOGO_COLORS.dark);
  });

  it('sets className when provided', () => {
    const logo = createDevBarLogo({ className: 'my-logo' });

    expect(logo.getAttribute('class')).toBe('my-logo');
  });

  it('contains path elements for each letter', () => {
    const logo = createDevBarLogo();
    const g = logo.querySelector('g')!;
    const paths = g.querySelectorAll('path');

    // Should have all letter paths (d, e, v, b, a, r, dLeftEdge = 7)
    expect(paths.length).toBe(Object.keys(DEVBAR_LOGO_PATHS).length);
  });

  it('contains polyline for top bar', () => {
    const logo = createDevBarLogo();
    const polyline = logo.querySelector('polyline');

    expect(polyline).not.toBeNull();
    expect(polyline!.getAttribute('points')).toBe(DEVBAR_LOGO_SHAPES.topBar);
  });

  it('contains polygon elements for steps and counters', () => {
    const logo = createDevBarLogo();
    const polygons = logo.querySelectorAll('polygon');

    // 3 steps + 2 counters = 5 polygons
    expect(polygons.length).toBe(5);
  });

  it('counter polygons have fill=none (transparent holes)', () => {
    const logo = createDevBarLogo();
    const polygons = logo.querySelectorAll('polygon');

    // Last two polygons are counters with fill=none
    const counterPolygons = Array.from(polygons).filter(
      (p) => p.getAttribute('fill') === 'none'
    );
    expect(counterPolygons.length).toBe(2);
  });
});

describe('getDevBarLogoSvg', () => {
  it('returns an SVG string', () => {
    const svg = getDevBarLogoSvg();

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('includes default dimensions', () => {
    const svg = getDevBarLogoSvg();

    expect(svg).toContain('width="32"');
    expect(svg).toContain('height="32"');
  });

  it('uses custom dimensions', () => {
    const svg = getDevBarLogoSvg({ width: 100, height: 50 });

    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="50"');
  });

  it('includes viewBox', () => {
    const svg = getDevBarLogoSvg();

    expect(svg).toContain(`viewBox="${DEVBAR_LOGO_VIEWBOX}"`);
  });

  it('includes aria-label', () => {
    const svg = getDevBarLogoSvg();

    expect(svg).toContain('aria-label="devbar logo"');
  });

  it('includes theme style block by default', () => {
    const svg = getDevBarLogoSvg();

    expect(svg).toContain('<style>');
    expect(svg).toContain('devbar-logo-fill');
    expect(svg).toContain(DEVBAR_LOGO_COLORS.dark);
    expect(svg).toContain(DEVBAR_LOGO_COLORS.light);
  });

  it('uses class attribute on g when themed', () => {
    const svg = getDevBarLogoSvg();

    expect(svg).toContain('class="devbar-logo-fill"');
  });

  it('uses fill attribute when custom fill specified', () => {
    const svg = getDevBarLogoSvg({ fill: '#ff0000' });

    expect(svg).toContain('fill="#ff0000"');
    expect(svg).not.toContain('<style>');
  });

  it('uses default dark color when not themed and no fill', () => {
    const svg = getDevBarLogoSvg({ themed: false });

    expect(svg).toContain(`fill="${DEVBAR_LOGO_COLORS.dark}"`);
    expect(svg).not.toContain('<style>');
  });

  it('includes all letter paths', () => {
    const svg = getDevBarLogoSvg();

    for (const pathData of Object.values(DEVBAR_LOGO_PATHS)) {
      expect(svg).toContain(pathData);
    }
  });

  it('includes shape data', () => {
    const svg = getDevBarLogoSvg();

    expect(svg).toContain(DEVBAR_LOGO_SHAPES.topBar);
    expect(svg).toContain(DEVBAR_LOGO_SHAPES.dStep1);
    expect(svg).toContain(DEVBAR_LOGO_SHAPES.dCounter);
    expect(svg).toContain(DEVBAR_LOGO_SHAPES.eCounter);
  });
});
