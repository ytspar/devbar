/**
 * H3: Common rendering utilities tests
 *
 * Tests for renderGuard, setRenderGuard, captureDotPosition,
 * createConnectionIndicator, and clearChildren.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureDotPosition,
  clearChildren,
  createConnectionIndicator,
  renderGuard,
  setRenderGuard,
} from './common.js';
import type { DevBarState } from '../types.js';

function createMockState(overrides: Partial<DevBarState> = {}): DevBarState {
  return {
    options: {
      showTooltips: true,
      saveLocation: 'auto',
      showScreenshot: true,
      showConsoleBadges: true,
      position: 'bottom-left',
      wsPort: 9223,
      accentColor: '#10b981',
      showMetrics: { breakpoint: true, fcp: true, lcp: true, cls: true, inp: true, pageSize: true },
    },
    debug: { state: vi.fn(), perf: vi.fn(), ws: vi.fn(), render: vi.fn(), event: vi.fn() },
    activeTooltips: new Set(),
    settingsManager: { get: vi.fn(), getSettings: vi.fn() } as any,
    render: vi.fn(),
    sweetlinkConnected: false,
    lastDotPosition: null,
    ...overrides,
  } as any;
}

afterEach(() => {
  document.body.textContent = '';
  // Reset render guard between tests
  setRenderGuard(false);
});

describe('renderGuard and setRenderGuard', () => {
  it('starts as false', () => {
    expect(renderGuard).toBe(false);
  });

  it('can be set to true', () => {
    setRenderGuard(true);
    // Re-import the live binding
    // Since renderGuard is a let export, we read it after setting
    expect(renderGuard).toBe(true);
  });

  it('can be toggled back to false', () => {
    setRenderGuard(true);
    expect(renderGuard).toBe(true);

    setRenderGuard(false);
    expect(renderGuard).toBe(false);
  });
});

describe('captureDotPosition', () => {
  it('stores center coordinates from bounding rect', () => {
    const state = createMockState();
    const element = document.createElement('div');

    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({
        left: 100,
        top: 200,
        width: 40,
        height: 20,
        right: 140,
        bottom: 220,
      }),
    });

    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    captureDotPosition(state, element);

    expect(state.lastDotPosition).not.toBeNull();
    // center x = 100 + 40/2 = 120
    expect(state.lastDotPosition!.left).toBe(120);
    // center y = 200 + 20/2 = 210
    expect(state.lastDotPosition!.top).toBe(210);
    // bottom = innerHeight - centerY = 800 - 210 = 590
    expect(state.lastDotPosition!.bottom).toBe(590);
  });

  it('overwrites previous dot position', () => {
    const state = createMockState({
      lastDotPosition: { left: 0, top: 0, bottom: 0 },
    });
    const element = document.createElement('div');

    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({
        left: 50,
        top: 100,
        width: 10,
        height: 10,
        right: 60,
        bottom: 110,
      }),
    });

    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });

    captureDotPosition(state, element);

    expect(state.lastDotPosition!.left).toBe(55);
    expect(state.lastDotPosition!.top).toBe(105);
    expect(state.lastDotPosition!.bottom).toBe(495);
  });
});

describe('createConnectionIndicator', () => {
  it('creates a span element with devbar-clickable class', () => {
    const state = createMockState();
    const indicator = createConnectionIndicator(state);

    expect(indicator.tagName).toBe('SPAN');
    expect(indicator.className).toBe('devbar-clickable');
  });

  it('has circular styling', () => {
    const state = createMockState();
    const indicator = createConnectionIndicator(state);

    expect(indicator.style.width).toBe('12px');
    expect(indicator.style.height).toBe('12px');
    expect(indicator.style.borderRadius).toBe('50%');
    expect(indicator.style.cursor).toBe('pointer');
  });

  it('contains an inner dot child', () => {
    const state = createMockState();
    const indicator = createConnectionIndicator(state);

    expect(indicator.children.length).toBe(1);
    const dot = indicator.children[0] as HTMLElement;
    expect(dot.className).toBe('devbar-conn-dot');
    expect(dot.style.width).toBe('6px');
    expect(dot.style.height).toBe('6px');
    expect(dot.style.borderRadius).toBe('50%');
  });

  it('uses muted color when not connected', () => {
    const state = createMockState({ sweetlinkConnected: false });
    const indicator = createConnectionIndicator(state);

    const dot = indicator.children[0] as HTMLElement;
    // Should not have the primary (green) glow
    expect(dot.style.boxShadow).toBe('none');
  });

  it('uses primary color with glow when connected', () => {
    const state = createMockState({ sweetlinkConnected: true });
    const indicator = createConnectionIndicator(state);

    const dot = indicator.children[0] as HTMLElement;
    // Should have a glow box-shadow when connected
    expect(dot.style.boxShadow).not.toBe('none');
    expect(dot.style.boxShadow).toContain('0 0 6px');
  });
});

describe('clearChildren', () => {
  it('removes all child nodes from an element', () => {
    const parent = document.createElement('div');
    parent.appendChild(document.createElement('span'));
    parent.appendChild(document.createElement('p'));
    parent.appendChild(document.createTextNode('text'));

    expect(parent.childNodes.length).toBe(3);

    clearChildren(parent);

    expect(parent.childNodes.length).toBe(0);
  });

  it('does nothing on an already empty element', () => {
    const parent = document.createElement('div');

    clearChildren(parent);

    expect(parent.childNodes.length).toBe(0);
  });

  it('removes deeply nested structures', () => {
    const parent = document.createElement('div');
    const child = document.createElement('div');
    child.appendChild(document.createElement('span'));
    child.appendChild(document.createElement('span'));
    parent.appendChild(child);
    parent.appendChild(document.createElement('p'));

    clearChildren(parent);

    expect(parent.childNodes.length).toBe(0);
  });
});
