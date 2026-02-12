/**
 * Common helpers shared across rendering sub-modules.
 */

import { CSS_COLORS } from '../../constants.js';
import type { DevBarState } from '../types.js';

/**
 * Capture the center of an element's bounding rect as a dot position.
 * Used to animate the collapsed circle to the same spot as the connection dot.
 */
export function captureDotPosition(state: DevBarState, element: Element): void {
  const rect = element.getBoundingClientRect();
  state.lastDotPosition = {
    left: rect.left + rect.width / 2,
    top: rect.top + rect.height / 2,
    bottom: window.innerHeight - (rect.top + rect.height / 2),
  };
}

/**
 * Create the connection indicator (outer wrapper + inner colored dot).
 * The caller is responsible for attaching tooltip and click handlers, since
 * those differ between compact and expanded modes.
 */
export function createConnectionIndicator(state: DevBarState): HTMLSpanElement {
  const connIndicator = document.createElement('span');
  connIndicator.className = 'devbar-clickable';
  Object.assign(connIndicator.style, {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: '0',
  });

  const connDot = document.createElement('span');
  connDot.className = 'devbar-conn-dot';
  Object.assign(connDot.style, {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: state.sweetlinkConnected ? CSS_COLORS.primary : CSS_COLORS.textMuted,
    boxShadow: state.sweetlinkConnected ? `0 0 6px ${CSS_COLORS.primary}` : 'none',
    transition: 'all 300ms',
  });
  connIndicator.appendChild(connDot);

  return connIndicator;
}

/** Prevents re-entrant render calls during rapid clicks */
export let renderGuard = false;

export function setRenderGuard(value: boolean): void {
  renderGuard = value;
}

/** Remove all child nodes from an element. */
export function clearChildren(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}
