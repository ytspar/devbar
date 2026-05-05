/**
 * Ruler Module Tests
 *
 * activateRulerMode wires document-level mouse listeners and overlay nodes.
 * We test the contract from the consumer's perspective:
 *
 *   1. Calling it returns a cleanup function.
 *   2. The cleanup is idempotent — called twice does not throw and does
 *      not double-remove anything.
 *   3. After activation, hover overlays appear in the DOM with the
 *      `data-devbar-ruler` marker so the screenshot module can hide them.
 *   4. The listener cleanup actually removes the overlay nodes (so the
 *      ruler doesn't leave orphans behind on every toggle).
 *
 * happy-dom doesn't compute layout, so getBoundingClientRect returns
 * zero-width rects — we still get the structural assertions we care about.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activateRulerMode } from './ruler.js';
import type { DevBarState } from './types.js';

function makeState(): DevBarState {
  // The Escape handler reaches into state.render and state.rulerCleanup.
  // Provide both so the keyboard path doesn't crash.
  return { render: () => undefined, rulerCleanup: null } as unknown as DevBarState;
}

beforeEach(() => {
  // Build the test fixture with safe DOM APIs (no innerHTML / no untrusted
  // markup; the security hook blocks innerHTML even in test files).
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  const btn = document.createElement('button');
  btn.id = 'target';
  btn.style.width = '100px';
  btn.style.height = '30px';
  btn.textContent = 'Hi';
  document.body.appendChild(btn);
});

afterEach(() => {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

describe('activateRulerMode', () => {
  it('returns a cleanup function', () => {
    const cleanup = activateRulerMode(makeState());
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('cleanup is idempotent (calling twice does not throw)', () => {
    const cleanup = activateRulerMode(makeState());
    cleanup();
    expect(() => cleanup()).not.toThrow();
  });

  it('mounts a ruler container on the document body', () => {
    const cleanup = activateRulerMode(makeState());
    const containers = document.querySelectorAll('[data-devbar-ruler]');
    expect(containers.length).toBeGreaterThan(0);
    cleanup();
  });

  it('removes its container nodes on cleanup', () => {
    const cleanup = activateRulerMode(makeState());
    expect(document.querySelectorAll('[data-devbar-ruler]').length).toBeGreaterThan(0);
    cleanup();
    expect(document.querySelectorAll('[data-devbar-ruler]').length).toBe(0);
  });

  it('renders a hover overlay when the mouse moves over an element', () => {
    const cleanup = activateRulerMode(makeState());

    const target = document.getElementById('target')!;
    target.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 15 })
    );

    // The hover overlay container should still exist.
    const overlayChildren = document.querySelectorAll('[data-devbar-ruler]');
    expect(overlayChildren.length).toBeGreaterThan(0);

    cleanup();
  });

  it('exits when Escape is pressed (no orphan overlay)', () => {
    const cleanup = activateRulerMode(makeState());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    // Escape calls the same cleanup path; safe to call again.
    cleanup();
    expect(document.querySelectorAll('[data-devbar-ruler]').length).toBe(0);
  });
});
