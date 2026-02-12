/**
 * devbar Buttons
 *
 * Button creation and styling utilities for the devbar UI.
 */

import { ACTION_BUTTON_BASE_STYLES, CSS_COLORS, FONT_MONO, withAlpha } from '../constants.js';

/**
 * Get button styling based on active state and color
 */
export function getButtonStyles(
  color: string,
  isActive: boolean,
  isDisabled: boolean
): Record<string, string> {
  return {
    ...ACTION_BUTTON_BASE_STYLES,
    borderColor: isActive ? color : withAlpha(color, 50),
    backgroundColor: isActive ? withAlpha(color, 20) : 'transparent',
    color: isActive ? color : withAlpha(color, 60),
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: '1',
  };
}

/**
 * Apply hover effects to a button element (internal helper)
 */
function applyButtonHoverEffects(
  btn: HTMLButtonElement,
  color: string,
  isActive: boolean = false
): void {
  btn.onmouseenter = () => {
    btn.style.backgroundColor = withAlpha(color, 13);
  };
  btn.onmouseleave = () => {
    btn.style.backgroundColor = isActive ? withAlpha(color, 20) : 'transparent';
  };
}

/**
 * Create a close/dismiss button (×) with subtle border-on-hover style.
 * Used for modal close buttons and cancel actions.
 */
export function createCloseButton(onClick: () => void, text = '\u00D7'): HTMLButtonElement {
  const color = CSS_COLORS.textMuted;
  const btn = document.createElement('button');
  Object.assign(btn.style, {
    padding: '2px 6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    borderRadius: '6px',
    color,
    fontFamily: FONT_MONO,
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'all 150ms',
  });
  btn.textContent = text;
  btn.onmouseenter = () => {
    btn.style.borderColor = withAlpha(color, 38);
  };
  btn.onmouseleave = () => {
    btn.style.borderColor = 'transparent';
  };
  btn.onclick = onClick;
  return btn;
}

/**
 * Create a styled button with common properties
 */
export function createStyledButton(options: {
  color: string;
  text: string;
  padding?: string;
  borderRadius?: string;
  fontSize?: string;
  width?: string;
  height?: string;
}): HTMLButtonElement {
  const {
    color,
    text,
    padding = '6px 12px',
    borderRadius = '6px',
    fontSize = '0.75rem',
    width,
    height,
  } = options;

  const btn = document.createElement('button');
  Object.assign(btn.style, {
    padding: width ? undefined : padding,
    width,
    height,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: `1px solid ${withAlpha(color, 38)}`,
    borderRadius,
    color,
    fontFamily: FONT_MONO,
    fontSize,
    cursor: 'pointer',
    transition: 'all 150ms',
  });
  btn.textContent = text;
  applyButtonHoverEffects(btn, color);
  return btn;
}
