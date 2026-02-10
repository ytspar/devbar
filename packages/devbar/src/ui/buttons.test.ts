/**
 * Buttons UI tests
 *
 * Tests for button creation and styling utilities.
 */

import { describe, expect, it, vi } from 'vitest';
import { createCloseButton, createStyledButton, getButtonStyles } from './buttons.js';

describe('getButtonStyles', () => {
  it('returns base button styles including display and sizing', () => {
    const styles = getButtonStyles('#10b981', false, false);

    expect(styles.display).toBe('flex');
    expect(styles.alignItems).toBe('center');
    expect(styles.justifyContent).toBe('center');
    expect(styles.width).toBe('22px');
    expect(styles.height).toBe('22px');
    expect(styles.borderRadius).toBe('50%');
  });

  it('applies inactive styles when isActive is false', () => {
    const styles = getButtonStyles('#10b981', false, false);

    expect(styles.borderColor).toBe('#10b98180');
    expect(styles.backgroundColor).toBe('transparent');
    expect(styles.color).toBe('#10b98199');
    expect(styles.cursor).toBe('pointer');
  });

  it('applies active styles when isActive is true', () => {
    const styles = getButtonStyles('#10b981', true, false);

    expect(styles.borderColor).toBe('#10b981');
    expect(styles.backgroundColor).toBe('#10b98133');
    expect(styles.color).toBe('#10b981');
    expect(styles.cursor).toBe('pointer');
  });

  it('applies not-allowed cursor when disabled', () => {
    const styles = getButtonStyles('#10b981', false, true);

    expect(styles.cursor).toBe('not-allowed');
  });

  it('applies not-allowed cursor when active and disabled', () => {
    const styles = getButtonStyles('#10b981', true, true);

    expect(styles.cursor).toBe('not-allowed');
    // Active styles still apply for color even when disabled
    expect(styles.borderColor).toBe('#10b981');
    expect(styles.backgroundColor).toBe('#10b98133');
  });

  it('uses the provided color for styling', () => {
    const styles = getButtonStyles('#ef4444', false, false);

    expect(styles.borderColor).toBe('#ef444480');
    expect(styles.color).toBe('#ef444499');
  });

  it('always has opacity of 1', () => {
    const inactive = getButtonStyles('#10b981', false, false);
    const active = getButtonStyles('#10b981', true, false);

    expect(inactive.opacity).toBe('1');
    expect(active.opacity).toBe('1');
  });
});

describe('createCloseButton', () => {
  it('creates a button element', () => {
    const btn = createCloseButton(() => {});

    expect(btn.tagName).toBe('BUTTON');
  });

  it('uses multiplication sign as default text', () => {
    const btn = createCloseButton(() => {});

    expect(btn.textContent).toBe('\u00D7');
  });

  it('allows custom text', () => {
    const btn = createCloseButton(() => {}, 'Close');

    expect(btn.textContent).toBe('Close');
  });

  it('calls onClick handler when clicked', () => {
    const onClick = vi.fn();
    const btn = createCloseButton(onClick);

    btn.click();

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has transparent background initially', () => {
    const btn = createCloseButton(() => {});

    expect(btn.style.backgroundColor).toBe('transparent');
  });

  it('has transparent border initially', () => {
    const btn = createCloseButton(() => {});

    expect(btn.style.border).toBe('1px solid transparent');
  });

  it('has correct styling properties', () => {
    const btn = createCloseButton(() => {});

    expect(btn.style.display).toBe('flex');
    expect(btn.style.alignItems).toBe('center');
    expect(btn.style.justifyContent).toBe('center');
    expect(btn.style.borderRadius).toBe('6px');
    expect(btn.style.cursor).toBe('pointer');
    expect(btn.style.fontSize).toBe('0.875rem');
  });

  it('has hover effects that show border', () => {
    const btn = createCloseButton(() => {});

    // Simulate mouse enter
    btn.onmouseenter!(new MouseEvent('mouseenter'));
    expect(btn.style.borderColor).toContain('60');

    // Simulate mouse leave
    btn.onmouseleave!(new MouseEvent('mouseleave'));
    expect(btn.style.borderColor).toBe('transparent');
  });
});

describe('createStyledButton', () => {
  it('creates a button element', () => {
    const btn = createStyledButton({ color: '#10b981', text: 'Test' });

    expect(btn.tagName).toBe('BUTTON');
  });

  it('sets the button text', () => {
    const btn = createStyledButton({ color: '#10b981', text: 'Click Me' });

    expect(btn.textContent).toBe('Click Me');
  });

  it('uses the provided color for border', () => {
    const btn = createStyledButton({ color: '#ef4444', text: 'Red' });

    expect(btn.style.border).toBe('1px solid #ef444460');
    expect(btn.style.color).toBe('#ef4444');
  });

  it('applies default padding', () => {
    const btn = createStyledButton({ color: '#10b981', text: 'Test' });

    expect(btn.style.padding).toBe('6px 12px');
  });

  it('applies custom padding', () => {
    const btn = createStyledButton({ color: '#10b981', text: 'Test', padding: '10px 20px' });

    expect(btn.style.padding).toBe('10px 20px');
  });

  it('applies default border radius', () => {
    const btn = createStyledButton({ color: '#10b981', text: 'Test' });

    expect(btn.style.borderRadius).toBe('6px');
  });

  it('applies custom border radius', () => {
    const btn = createStyledButton({ color: '#10b981', text: 'Test', borderRadius: '12px' });

    expect(btn.style.borderRadius).toBe('12px');
  });

  it('applies default font size', () => {
    const btn = createStyledButton({ color: '#10b981', text: 'Test' });

    expect(btn.style.fontSize).toBe('0.75rem');
  });

  it('applies custom font size', () => {
    const btn = createStyledButton({ color: '#10b981', text: 'Test', fontSize: '1rem' });

    expect(btn.style.fontSize).toBe('1rem');
  });

  it('applies custom width and height', () => {
    const btn = createStyledButton({ color: '#10b981', text: 'Test', width: '100px', height: '40px' });

    expect(btn.style.width).toBe('100px');
    expect(btn.style.height).toBe('40px');
  });

  it('has transparent background initially', () => {
    const btn = createStyledButton({ color: '#10b981', text: 'Test' });

    expect(btn.style.backgroundColor).toBe('transparent');
  });

  it('has flex display', () => {
    const btn = createStyledButton({ color: '#10b981', text: 'Test' });

    expect(btn.style.display).toBe('flex');
    expect(btn.style.alignItems).toBe('center');
    expect(btn.style.justifyContent).toBe('center');
  });

  it('has hover effects', () => {
    const btn = createStyledButton({ color: '#10b981', text: 'Test' });

    // Simulate mouse enter
    btn.onmouseenter!(new MouseEvent('mouseenter'));
    expect(btn.style.backgroundColor).toBe('#10b98120');

    // Simulate mouse leave
    btn.onmouseleave!(new MouseEvent('mouseleave'));
    expect(btn.style.backgroundColor).toBe('transparent');
  });

  it('has pointer cursor', () => {
    const btn = createStyledButton({ color: '#10b981', text: 'Test' });

    expect(btn.style.cursor).toBe('pointer');
  });
});
