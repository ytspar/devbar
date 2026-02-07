/**
 * devbar Buttons
 *
 * Button creation and styling utilities for the devbar UI.
 */

import { ACTION_BUTTON_BASE_STYLES } from '../constants.js';

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
    borderColor: isActive ? color : `${color}80`,
    backgroundColor: isActive ? `${color}33` : 'transparent',
    color: isActive ? color : `${color}99`,
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
    btn.style.backgroundColor = `${color}20`;
  };
  btn.onmouseleave = () => {
    btn.style.backgroundColor = isActive ? `${color}33` : 'transparent';
  };
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
    border: `1px solid ${color}60`,
    borderRadius,
    color,
    fontSize,
    cursor: 'pointer',
    transition: 'all 150ms',
  });
  btn.textContent = text;
  applyButtonHoverEffects(btn, color);
  return btn;
}
