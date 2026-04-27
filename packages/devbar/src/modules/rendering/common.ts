/**
 * Common helpers shared across rendering sub-modules.
 */

import { BUTTON_COLORS, CSS_COLORS, withAlpha } from '../../constants.js';
import type { DevBarControl } from '../../types.js';
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

/**
 * Resolve the color for a custom control based on its variant.
 */
export function getControlColor(variant: string | undefined, accentColor: string): string {
  if (variant === 'warning') return BUTTON_COLORS.warning;
  if (variant === 'info') return BUTTON_COLORS.info;
  return accentColor;
}

/**
 * Create a single custom control element (button or non-interactive badge).
 */
export function createControlElement(control: DevBarControl, accentColor: string): HTMLElement {
  const color = getControlColor(control.variant, accentColor);
  const isActive = control.active ?? false;
  const isDisabled = control.disabled ?? false;
  const isInteractive = !!control.onClick;

  const el = document.createElement(isInteractive ? 'button' : 'span');
  el.className = isInteractive
    ? 'devbar-custom-control'
    : 'devbar-custom-control devbar-custom-badge';
  if (isInteractive) (el as HTMLButtonElement).type = 'button';

  Object.assign(el.style, {
    padding: '4px 10px',
    boxSizing: 'border-box',
    minWidth: '0',
    maxWidth: 'min(16rem, 100%)',
    backgroundColor: isActive ? withAlpha(color, 20) : 'transparent',
    border: `1px solid ${isActive ? color : withAlpha(color, 38)}`,
    borderRadius: '6px',
    color: isActive ? color : withAlpha(color, 60),
    fontSize: '0.625rem',
    lineHeight: '1.2',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    cursor: isInteractive ? (isDisabled ? 'not-allowed' : 'pointer') : 'default',
    opacity: isDisabled ? '0.5' : '1',
    transition: isInteractive ? 'all 150ms' : 'none',
  });

  el.textContent = control.label;

  if (isInteractive) {
    (el as HTMLButtonElement).disabled = isDisabled;
    if (!isDisabled) {
      el.onmouseenter = () => {
        el.style.backgroundColor = withAlpha(color, 13);
        el.style.borderColor = color;
        el.style.color = color;
      };
      el.onmouseleave = () => {
        el.style.backgroundColor = isActive ? withAlpha(color, 20) : 'transparent';
        el.style.borderColor = isActive ? color : withAlpha(color, 38);
        el.style.color = isActive ? color : withAlpha(color, 60);
      };
      el.onclick = () => control.onClick!();
    }
  }

  return el;
}
