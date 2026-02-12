/**
 * Compact state rendering for the DevBar.
 */

import { BUTTON_COLORS, FONT_MONO, withAlpha } from '../../constants.js';
import { attachTextTooltip } from '../tooltips.js';
import type { DevBarState, PositionStyle } from '../types.js';
import { createConsoleBadge, createScreenshotButton, createSettingsButton } from './buttons.js';
import { captureDotPosition, createConnectionIndicator } from './common.js';

export function renderCompact(state: DevBarState): void {
  if (!state.container) return;

  const { position, accentColor } = state.options;
  const { errorCount, warningCount, infoCount } = state.getLogCounts();

  // Simple position styles - same anchor points as expanded mode
  const positionStyles: Record<string, PositionStyle> = {
    'bottom-left': { bottom: '20px', left: '80px' },
    'bottom-right': { bottom: '20px', right: '16px' },
    'top-left': { top: '20px', left: '80px' },
    'top-right': { top: '20px', right: '16px' },
    'bottom-center': { bottom: '12px', left: '50%', transform: 'translateX(-50%)' },
  };
  const posStyle = positionStyles[position] ?? positionStyles['bottom-left'];

  const wrapper = state.container;

  state.resetPositionStyles(wrapper);

  Object.assign(wrapper.style, {
    position: 'fixed',
    ...posStyle,
    zIndex: '9999',
    backgroundColor: 'var(--devbar-color-bg-card)',
    border: `1px solid ${accentColor}`,
    borderRadius: '20px',
    color: accentColor,
    boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px ${withAlpha(accentColor, 10)}`,
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    padding: '6px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: FONT_MONO,
    fontSize: '0.6875rem',
  });

  // Connection indicator
  const connIndicator = createConnectionIndicator(state);
  const connDot = connIndicator.querySelector('.devbar-conn-dot') as HTMLSpanElement;
  attachTextTooltip(state, connIndicator, () =>
    state.sweetlinkConnected ? 'Sweetlink connected' : 'Sweetlink disconnected'
  );
  connIndicator.onclick = (e) => {
    e.stopPropagation();
    captureDotPosition(state, connDot);
    state.collapsed = true;
    state.debug.state('Collapsed DevBar from compact mode');
    state.render();
  };
  wrapper.appendChild(connIndicator);

  // Error badge
  if (errorCount > 0) {
    wrapper.appendChild(createConsoleBadge(state, 'error', errorCount, BUTTON_COLORS.error));
  }

  // Warning badge
  if (warningCount > 0) {
    wrapper.appendChild(createConsoleBadge(state, 'warn', warningCount, BUTTON_COLORS.warning));
  }

  // Info badge
  if (infoCount > 0) {
    wrapper.appendChild(createConsoleBadge(state, 'info', infoCount, BUTTON_COLORS.info));
  }

  // Screenshot button (if enabled)
  if (state.options.showScreenshot) {
    wrapper.appendChild(createScreenshotButton(state, accentColor));
  }

  // Settings gear button
  wrapper.appendChild(createSettingsButton(state));

  // Expand button (double-arrow)
  const expandBtn = document.createElement('button');
  expandBtn.type = 'button';
  Object.assign(expandBtn.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    border: `1px solid ${withAlpha(accentColor, 38)}`,
    backgroundColor: 'transparent',
    color: withAlpha(accentColor, 60),
    cursor: 'pointer',
    fontSize: '0.5rem',
    transition: 'all 150ms',
  });
  expandBtn.textContent = '\u27EB';
  attachTextTooltip(state, expandBtn, () => 'Expand DevBar', {
    onEnter: () => {
      expandBtn.style.backgroundColor = withAlpha(accentColor, 13);
      expandBtn.style.borderColor = accentColor;
      expandBtn.style.color = accentColor;
    },
    onLeave: () => {
      expandBtn.style.backgroundColor = 'transparent';
      expandBtn.style.borderColor = withAlpha(accentColor, 38);
      expandBtn.style.color = withAlpha(accentColor, 60);
    },
  });
  expandBtn.onclick = () => {
    state.toggleCompactMode();
  };
  wrapper.appendChild(expandBtn);
}
