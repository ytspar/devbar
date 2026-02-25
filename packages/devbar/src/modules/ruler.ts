/**
 * Ruler Module — Interactive element measurement overlay
 *
 * When ruler mode is active, hovering over elements shows their dimensions,
 * position, and spacing. Clicking pins a measurement to the page.
 * Press Escape or click the ruler button again to exit.
 */

import { BUTTON_COLORS, CSS_COLORS, FONT_MONO, withAlpha } from '../constants.js';
import type { DevBarState } from './types.js';

const RULER_Z_INDEX = '10001';
const OVERLAY_COLOR = BUTTON_COLORS.ruler;

/**
 * Create a measurement label showing dimensions and position.
 */
function createMeasurementLabel(rect: DOMRect, pinned: boolean): HTMLDivElement {
  const label = document.createElement('div');
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  const x = Math.round(rect.left);
  const y = Math.round(rect.top);

  Object.assign(label.style, {
    position: 'fixed',
    zIndex: RULER_Z_INDEX,
    pointerEvents: 'none',
    fontFamily: FONT_MONO,
    fontSize: '10px',
    lineHeight: '1.2',
    padding: '2px 5px',
    borderRadius: '3px',
    backgroundColor: pinned ? OVERLAY_COLOR : withAlpha(OVERLAY_COLOR, 90),
    color: '#000',
    fontWeight: '600',
    whiteSpace: 'nowrap',
    // Position label just above the element, or below if near top of viewport
    left: `${rect.left}px`,
    top: rect.top > 24 ? `${rect.top - 20}px` : `${rect.bottom + 4}px`,
  });

  label.textContent = `${w} \u00d7 ${h}  @(${x}, ${y})`;
  label.setAttribute('data-devbar-ruler', 'label');

  return label;
}

/**
 * Create the outline box (border overlay) around an element.
 */
function createOutlineBox(rect: DOMRect, pinned: boolean): HTMLDivElement {
  const box = document.createElement('div');

  Object.assign(box.style, {
    position: 'fixed',
    zIndex: RULER_Z_INDEX,
    pointerEvents: 'none',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    border: `1.5px ${pinned ? 'solid' : 'dashed'} ${OVERLAY_COLOR}`,
    backgroundColor: withAlpha(OVERLAY_COLOR, 8),
    boxSizing: 'border-box',
  });

  box.setAttribute('data-devbar-ruler', 'box');

  return box;
}

/**
 * Remove all child nodes from a container element.
 */
function clearChildren(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

/**
 * Activate ruler mode — attaches hover/click listeners to the document.
 * Returns a cleanup function that removes all overlays and listeners.
 */
export function activateRulerMode(state: DevBarState): () => void {
  // Create a container for the hover overlay (non-pinned)
  const hoverContainer = document.createElement('div');
  hoverContainer.setAttribute('data-devbar-ruler', 'hover-container');
  Object.assign(hoverContainer.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    pointerEvents: 'none',
    zIndex: RULER_Z_INDEX,
  });
  document.body.appendChild(hoverContainer);

  // Create a container for pinned measurements
  const pinnedContainer = document.createElement('div');
  pinnedContainer.setAttribute('data-devbar-ruler', 'pinned-container');
  Object.assign(pinnedContainer.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    pointerEvents: 'none',
    zIndex: RULER_Z_INDEX,
  });
  document.body.appendChild(pinnedContainer);

  // Add cursor style
  const cursorStyle = document.createElement('style');
  cursorStyle.setAttribute('data-devbar-ruler', 'cursor-style');
  cursorStyle.textContent = [
    'body[data-devbar-ruler-active] * {',
    '  cursor: crosshair !important;',
    '}',
  ].join('\n');
  document.head.appendChild(cursorStyle);
  document.body.setAttribute('data-devbar-ruler-active', '');

  // Mode indicator
  const modeIndicator = document.createElement('div');
  Object.assign(modeIndicator.style, {
    position: 'fixed',
    top: '8px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: RULER_Z_INDEX,
    fontFamily: FONT_MONO,
    fontSize: '11px',
    padding: '4px 12px',
    borderRadius: '6px',
    backgroundColor: withAlpha(OVERLAY_COLOR, 20),
    border: `1px solid ${OVERLAY_COLOR}`,
    color: CSS_COLORS.text,
    pointerEvents: 'none',
  });
  modeIndicator.textContent = 'RULER MODE \u2014 click to pin, Esc to exit';
  document.body.appendChild(modeIndicator);

  let lastTarget: Element | null = null;

  function isDevbarElement(el: Element): boolean {
    return !!el.closest('[data-devbar], [data-devbar-ruler], [data-devbar-overlay], [data-devbar-tooltip]');
  }

  function handleMouseMove(e: MouseEvent) {
    const target = e.target as Element;

    // Skip devbar's own elements
    if (isDevbarElement(target)) {
      clearChildren(hoverContainer);
      lastTarget = null;
      return;
    }

    if (target === lastTarget) return;
    lastTarget = target;

    // Clear previous hover overlay
    clearChildren(hoverContainer);

    const rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    hoverContainer.appendChild(createOutlineBox(rect, false));
    hoverContainer.appendChild(createMeasurementLabel(rect, false));
  }

  function handleClick(e: MouseEvent) {
    const target = e.target as Element;

    // Skip devbar's own elements
    if (isDevbarElement(target)) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    // Pin measurement
    pinnedContainer.appendChild(createOutlineBox(rect, true));
    pinnedContainer.appendChild(createMeasurementLabel(rect, true));
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      // Deactivate ruler mode
      state.rulerMode = false;
      if (state.rulerCleanup) {
        state.rulerCleanup();
        state.rulerCleanup = null;
      }
      state.render();
    }
  }

  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);

  // Cleanup function
  return () => {
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeyDown, true);
    hoverContainer.remove();
    pinnedContainer.remove();
    cursorStyle.remove();
    modeIndicator.remove();
    document.body.removeAttribute('data-devbar-ruler-active');
  };
}
