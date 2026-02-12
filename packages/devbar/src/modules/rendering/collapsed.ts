/**
 * Collapsed state rendering for the DevBar.
 */

import { CSS_COLORS, withAlpha } from '../../constants.js';
import { attachTextTooltip } from '../tooltips.js';
import type { DevBarState, PositionStyle } from '../types.js';

export function renderCollapsed(state: DevBarState): void {
  if (!state.container) return;

  const { position, accentColor } = state.options;
  const { errorCount, warningCount } = state.getLogCounts();

  // Use captured dot position if available, otherwise fall back to preset positions
  // The 13px offset accounts for half the collapsed circle diameter (26px / 2)
  let posStyle: PositionStyle;

  if (state.lastDotPosition) {
    // Position based on where the dot actually was
    const isTop = position.startsWith('top');
    posStyle = isTop
      ? { top: `${state.lastDotPosition.top - 13}px`, left: `${state.lastDotPosition.left - 13}px` }
      : {
          bottom: `${state.lastDotPosition.bottom - 13}px`,
          left: `${state.lastDotPosition.left - 13}px`,
        };
    // Clear after use so expand doesn't re-use stale values
    state.lastDotPosition = null;
  } else {
    // Fallback preset positions for when no dot position was captured
    const collapsedPositions: Record<string, PositionStyle> = {
      'bottom-left': { bottom: '27px', left: '86px' },
      'bottom-right': { bottom: '27px', right: '29px' },
      'top-left': { top: '27px', left: '86px' },
      'top-right': { top: '27px', right: '29px' },
      'bottom-center': { bottom: '19px', left: '50%', transform: 'translateX(-50%)' },
    };
    posStyle = collapsedPositions[position] ?? collapsedPositions['bottom-left'];
  }

  const wrapper = state.container;
  wrapper.className = 'devbar-collapse';

  state.resetPositionStyles(wrapper);

  // Set CSS variable for accent color (used by pulse animation)
  wrapper.style.setProperty('--devbar-color-accent', accentColor);

  Object.assign(wrapper.style, {
    position: 'fixed',
    ...posStyle,
    zIndex: '9999',
    backgroundColor: 'var(--devbar-color-bg-card)',
    border: `1px solid ${accentColor}`,
    borderRadius: '50%',
    color: accentColor,
    boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px ${withAlpha(accentColor, 10)}`,
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    boxSizing: 'border-box',
    animation: 'devbar-collapse 150ms ease-out, devbar-collapsed-pulse 2s ease-in-out 0.2s 3',
  });

  wrapper.onclick = () => {
    state.collapsed = false;
    state.debug.state('Expanded DevBar');
    state.render();
  };

  // Create inner container for dot + chevron
  const innerContainer = document.createElement('span');
  Object.assign(innerContainer.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  });

  // Connection indicator dot (same size as in expanded state)
  const dot = document.createElement('span');
  Object.assign(dot.style, {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: state.sweetlinkConnected ? CSS_COLORS.primary : CSS_COLORS.textMuted,
    boxShadow: state.sweetlinkConnected ? `0 0 6px ${CSS_COLORS.primary}` : 'none',
    transition: 'transform 150ms ease-out, opacity 150ms ease-out',
  });
  innerContainer.appendChild(dot);

  // Expand chevron indicator (appears on hover)
  const chevron = document.createElement('span');
  Object.assign(chevron.style, {
    position: 'absolute',
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: '0',
    transition: 'opacity 150ms ease-out',
    fontSize: '10px',
    color: accentColor,
  });
  chevron.textContent = '\u2197';
  innerContainer.appendChild(chevron);

  attachTextTooltip(
    state,
    wrapper,
    () =>
      `Click to expand DevBar${state.sweetlinkConnected ? ' (Sweetlink connected)' : ' (Sweetlink not connected)'}${errorCount > 0 ? `\n${errorCount} console error${errorCount === 1 ? '' : 's'}` : ''}`,
    {
      onEnter: () => {
        dot.style.opacity = '0';
        dot.style.transform = 'scale(0)';
        chevron.style.opacity = '1';
      },
      onLeave: () => {
        dot.style.opacity = '1';
        dot.style.transform = 'scale(1)';
        chevron.style.opacity = '0';
      },
    }
  );

  wrapper.appendChild(innerContainer);

  // Error badge (absolute, top-right of circle, shifted left if warning badge exists)
  if (errorCount > 0) {
    wrapper.appendChild(
      state.createCollapsedBadge(
        errorCount,
        'rgba(239, 68, 68, 0.95)',
        warningCount > 0 ? '12px' : '-6px'
      )
    );
  }

  // Warning badge (absolute, top-right)
  if (warningCount > 0) {
    wrapper.appendChild(
      state.createCollapsedBadge(warningCount, 'rgba(245, 158, 11, 0.95)', '-6px')
    );
  }
}
