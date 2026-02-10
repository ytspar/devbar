/**
 * Rendering: renderCollapsed, renderCompact, renderExpanded, renderOverlays,
 * console popups, modals, settings popover, and all DOM-creation UI code.
 *
 * Extracted from GlobalDevBar to reduce file size.
 */

import type { ConsoleCapture } from '@ytspar/sweetlink/browser/consoleCapture';
import {
  BUTTON_COLORS,
  CATEGORY_COLORS,
  CSS_COLORS,
  FONT_MONO,
  TAILWIND_BREAKPOINTS,
} from '../constants.js';
import { extractDocumentOutline, outlineToMarkdown } from '../outline.js';
import { extractPageSchema, schemaToMarkdown } from '../schema.js';
import { ACCENT_COLOR_PRESETS, DEFAULT_SETTINGS, resolveSaveLocation } from '../settings.js';
import type { ConsoleLog, OutlineNode, ThemeMode } from '../types.js';
import {
  createEmptyMessage,
  createInfoBox,
  createModalBox,
  createModalContent,
  createModalHeader,
  createModalOverlay,
  createStyledButton,
  createSvgIcon,
  getButtonStyles,
} from '../ui/index.js';
import { getResponsiveMetricVisibility } from './performance.js';
import {
  calculateCostEstimate,
  closeDesignReviewConfirm,
  copyPathToClipboard,
  handleDocumentOutline,
  handlePageSchema,
  handleSaveConsoleLogs,
  handleSaveOutline,
  handleSaveSchema,
  proceedWithDesignReview,
  showDesignReviewConfirmation,
} from './screenshot.js';
import { setThemeMode } from './theme.js';
import {
  addTooltipTitle,
  attachBreakpointTooltip,
  attachButtonTooltip,
  attachClickToggleTooltip,
  attachInfoTooltip,
  attachMetricTooltip,
  attachTextTooltip,
  clearAllTooltips,
} from './tooltips.js';
import type { DevBarState, PositionStyle } from './types.js';

/**
 * Capture the center of an element's bounding rect as a dot position.
 * Used to animate the collapsed circle to the same spot as the connection dot.
 */
function captureDotPosition(state: DevBarState, element: Element): void {
  const rect = element.getBoundingClientRect();
  state.lastDotPosition = {
    left: rect.left + rect.width / 2,
    top: rect.top + rect.height / 2,
    bottom: window.innerHeight - (rect.top + rect.height / 2),
  };
}

/**
 * Main render dispatch - creates container and delegates to appropriate renderer.
 */
export function render(
  state: DevBarState,
  consoleCaptureSingleton: ConsoleCapture,
  customControls: {
    id: string;
    label: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    variant?: 'default' | 'warning';
  }[]
): void {
  if (state.destroyed) return;
  if (typeof document === 'undefined') return;

  // Clear any orphaned tooltips from previous render
  clearAllTooltips(state);

  // Remove existing overlay if any (modals append to body, need explicit cleanup)
  if (state.overlayElement) {
    state.overlayElement.remove();
    state.overlayElement = null;
  }

  // Remove existing container if any
  if (state.container) {
    state.container.remove();
  }

  // Create new container
  state.container = document.createElement('div');
  state.container.setAttribute('data-devbar', 'true');

  if (state.collapsed) {
    renderCollapsed(state);
  } else if (state.compactMode) {
    renderCompact(state);
  } else {
    renderExpanded(state, customControls);
  }

  document.body.appendChild(state.container);

  // Render overlays/modals
  renderOverlays(state, consoleCaptureSingleton);
}

function renderOverlays(state: DevBarState, consoleCaptureSingleton: ConsoleCapture): void {
  // Remove existing overlay
  if (state.overlayElement) {
    state.overlayElement.remove();
    state.overlayElement = null;
  }

  // Render console popup if filter is active
  if (state.consoleFilter) {
    renderConsolePopup(state, consoleCaptureSingleton);
  }

  // Render outline modal
  if (state.showOutlineModal) {
    renderOutlineModal(state);
  }

  // Render schema modal
  if (state.showSchemaModal) {
    renderSchemaModal(state);
  }

  // Render design review confirmation modal
  if (state.showDesignReviewConfirm) {
    renderDesignReviewConfirmModal(state);
  }

  // Render settings popover
  if (state.showSettingsPopover) {
    renderSettingsPopover(state);
  }
}

// ============================================================================
// Collapsed State
// ============================================================================

function renderCollapsed(state: DevBarState): void {
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
    boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px ${accentColor}1A`,
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

// ============================================================================
// Compact State
// ============================================================================

function renderCompact(state: DevBarState): void {
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
    boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px ${accentColor}1A`,
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
  const connIndicator = document.createElement('span');
  connIndicator.className = 'devbar-clickable';
  Object.assign(connIndicator.style, {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  });
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

  const connDot = document.createElement('span');
  Object.assign(connDot.style, {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: state.sweetlinkConnected ? CSS_COLORS.primary : CSS_COLORS.textMuted,
    boxShadow: state.sweetlinkConnected ? `0 0 6px ${CSS_COLORS.primary}` : 'none',
  });
  connIndicator.appendChild(connDot);
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
    border: `1px solid ${accentColor}60`,
    backgroundColor: 'transparent',
    color: `${accentColor}99`,
    cursor: 'pointer',
    fontSize: '0.5rem',
    transition: 'all 150ms',
  });
  expandBtn.textContent = '\u27EB';
  attachTextTooltip(state, expandBtn, () => 'Expand DevBar', {
    onEnter: () => {
      expandBtn.style.backgroundColor = `${accentColor}20`;
      expandBtn.style.borderColor = accentColor;
      expandBtn.style.color = accentColor;
    },
    onLeave: () => {
      expandBtn.style.backgroundColor = 'transparent';
      expandBtn.style.borderColor = `${accentColor}60`;
      expandBtn.style.color = `${accentColor}99`;
    },
  });
  expandBtn.onclick = () => {
    state.toggleCompactMode();
  };
  wrapper.appendChild(expandBtn);
}

// ============================================================================
// Expanded State
// ============================================================================

function renderExpanded(
  state: DevBarState,
  customControls: {
    id: string;
    label: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    variant?: 'default' | 'warning';
  }[]
): void {
  if (!state.container) return;

  const { position, accentColor, showMetrics, showScreenshot, showConsoleBadges } = state.options;
  const { errorCount, warningCount, infoCount } = state.getLogCounts();

  // Dot offset from container edge in expanded mode:
  // border (1px) + padding (12px) + half indicator (6px) = 19px from left
  // border (1px) + padding (8px) + half indicator (6px) = 15px from top
  const DOT_OFFSET_LEFT = 19;
  const DOT_OFFSET_TOP = 15;

  const isCentered = position === 'bottom-center';

  let posStyle: PositionStyle;

  // Use captured dot position to align the expanded bar's dot with where it was
  // Always use top/left positioning for precise alignment
  if (state.lastDotPosition && !isCentered) {
    const isRight = position.endsWith('right');

    if (isRight) {
      // For right-aligned, fall back to default
      const isTop = position.startsWith('top');
      posStyle = isTop ? { top: '20px', right: '16px' } : { bottom: '20px', right: '16px' };
    } else {
      // Use top positioning for precise dot alignment
      posStyle = {
        top: `${state.lastDotPosition.top - DOT_OFFSET_TOP}px`,
        left: `${state.lastDotPosition.left - DOT_OFFSET_LEFT}px`,
      };
    }
    // Clear the position after using it
    state.lastDotPosition = null;
  } else {
    const positionStyles: Record<string, PositionStyle> = {
      'bottom-left': { bottom: '20px', left: '80px' },
      'bottom-right': { bottom: '20px', right: '16px' },
      'top-left': { top: '20px', left: '80px' },
      'top-right': { top: '20px', right: '16px' },
      'bottom-center': { bottom: '12px', left: '50%', transform: 'translateX(-50%)' },
    };
    posStyle = positionStyles[position] ?? positionStyles['bottom-left'];
  }

  const sizeOverrides = state.options.sizeOverrides;

  const wrapper = state.container;

  state.resetPositionStyles(wrapper);

  // Calculate size values with overrides or defaults
  // Use fit-content so DevBar only takes space it needs, but allow expansion up to max
  // Centered: 16px margin each side. Left/right: 80px for Next.js bar + 16px margin
  const defaultWidth = 'fit-content';
  const defaultMinWidth = 'auto';
  const defaultMaxWidth = isCentered ? 'calc(100vw - 32px)' : 'calc(100vw - 96px)';

  Object.assign(wrapper.style, {
    position: 'fixed',
    ...posStyle,
    zIndex: '9999',
    backgroundColor: 'var(--devbar-color-bg-card)',
    border: `1px solid ${accentColor}`,
    borderRadius: '12px',
    color: accentColor,
    boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px ${accentColor}1A`,
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    boxSizing: 'border-box',
    width: sizeOverrides?.width ?? defaultWidth,
    maxWidth: sizeOverrides?.maxWidth ?? defaultMaxWidth,
    minWidth: sizeOverrides?.minWidth ?? defaultMinWidth,
    cursor: 'default',
  });

  wrapper.ondblclick = () => {
    const dotEl = wrapper.querySelector('.devbar-status span span');
    if (dotEl) {
      captureDotPosition(state, dotEl);
    }
    state.collapsed = true;
    state.debug.state('Collapsed DevBar (double-click)');
    state.render();
  };

  // Main row - wrapping controlled by CSS media query
  const mainRow = document.createElement('div');
  mainRow.className = 'devbar-main';
  Object.assign(mainRow.style, {
    display: 'flex',
    alignItems: 'center',
    alignContent: 'flex-start',
    justifyContent: 'flex-start',
    gap: '0.5rem',
    padding: '0.5rem 0.75rem',
    minWidth: '0',
    boxSizing: 'border-box',
    fontFamily: FONT_MONO,
    fontSize: '0.6875rem',
    lineHeight: '1rem',
  });

  // Connection indicator (click to collapse)
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
  attachTextTooltip(state, connIndicator, () =>
    state.sweetlinkConnected
      ? 'Sweetlink connected (click to minimize)'
      : 'Sweetlink disconnected (click to minimize)'
  );
  connIndicator.onclick = (e) => {
    e.stopPropagation();
    captureDotPosition(state, connIndicator);
    state.collapsed = true;
    state.debug.state('Collapsed DevBar (connection dot click)');
    state.render();
  };

  const connDot = document.createElement('span');
  Object.assign(connDot.style, {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: state.sweetlinkConnected ? CSS_COLORS.primary : CSS_COLORS.textMuted,
    boxShadow: state.sweetlinkConnected ? `0 0 6px ${CSS_COLORS.primary}` : 'none',
    transition: 'all 300ms',
  });
  connIndicator.appendChild(connDot);

  // Status row wrapper - keeps connection dot, info, and badges together
  const statusRow = document.createElement('div');
  statusRow.className = 'devbar-status';
  Object.assign(statusRow.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'nowrap',
    flexShrink: '0',
  });
  statusRow.appendChild(connIndicator);

  // Info section
  const infoSection = document.createElement('div');
  infoSection.className = 'devbar-info';
  Object.assign(infoSection.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    flexShrink: '1',
    minWidth: '0',
    overflow: 'visible',
  });

  // Breakpoint info
  if (showMetrics.breakpoint && state.breakpointInfo) {
    const bp = state.breakpointInfo.tailwindBreakpoint as keyof typeof TAILWIND_BREAKPOINTS;
    const breakpointData = TAILWIND_BREAKPOINTS[bp];

    const bpSpan = document.createElement('span');
    bpSpan.className = 'devbar-item';
    Object.assign(bpSpan.style, { opacity: '0.9', cursor: 'default' });

    // Use HTML tooltip for breakpoint info
    attachBreakpointTooltip(
      state,
      bpSpan,
      bp,
      state.breakpointInfo.dimensions,
      breakpointData?.label || ''
    );

    let bpText: string = bp;
    if (bp !== 'base') {
      bpText =
        bp === 'sm'
          ? `${bp} - ${state.breakpointInfo.dimensions.split('x')[0]}`
          : `${bp} - ${state.breakpointInfo.dimensions}`;
    }
    bpSpan.textContent = bpText;
    infoSection.appendChild(bpSpan);
  }

  // Performance stats with responsive visibility
  if (state.perfStats) {
    const { visible, hidden } = getResponsiveMetricVisibility(state);

    const addSeparator = () => {
      const sep = document.createElement('span');
      sep.style.opacity = '0.4';
      sep.textContent = '|';
      infoSection.appendChild(sep);
    };

    // Metric configurations for reuse
    const metricConfigs: Record<
      'fcp' | 'lcp' | 'cls' | 'inp' | 'pageSize',
      {
        label: string;
        value: string;
        title: string;
        description: string;
        thresholds?: { good: string; needsWork: string; poor: string };
      }
    > = {
      fcp: {
        label: 'FCP',
        value: state.perfStats.fcp,
        title: 'First Contentful Paint (FCP)',
        description: 'Time until the first text or image renders on screen.',
        thresholds: { good: '<1.8s', needsWork: '1.8-3s', poor: '>3s' },
      },
      lcp: {
        label: 'LCP',
        value: state.perfStats.lcp,
        title: 'Largest Contentful Paint (LCP)',
        description: 'Time until the largest visible element renders on screen.',
        thresholds: { good: '<2.5s', needsWork: '2.5-4s', poor: '>4s' },
      },
      cls: {
        label: 'CLS',
        value: state.perfStats.cls,
        title: 'Cumulative Layout Shift (CLS)',
        description: 'Visual stability score. Higher values mean more unexpected layout shifts.',
        thresholds: { good: '<0.1', needsWork: '0.1-0.25', poor: '>0.25' },
      },
      inp: {
        label: 'INP',
        value: state.perfStats.inp,
        title: 'Interaction to Next Paint (INP)',
        description: 'Responsiveness to user input. Measures the longest interaction delay.',
        thresholds: { good: '<200ms', needsWork: '200-500ms', poor: '>500ms' },
      },
      pageSize: {
        label: '',
        value: state.perfStats.totalSize,
        title: 'Total Page Size',
        description:
          'Compressed/transferred size including HTML, CSS, JS, images, and other resources.',
      },
    };

    // Render visible metrics
    for (const metric of visible) {
      if (!showMetrics[metric]) continue;
      const config = metricConfigs[metric];

      addSeparator();
      const span = document.createElement('span');
      span.className = 'devbar-item';
      Object.assign(span.style, {
        opacity: metric === 'pageSize' ? '0.7' : '0.85',
        cursor: 'default',
      });
      span.textContent = config.label ? `${config.label} ${config.value}` : config.value;

      if (config.thresholds) {
        attachMetricTooltip(state, span, config.title, config.description, config.thresholds);
      } else {
        attachInfoTooltip(state, span, config.title, config.description);
      }
      infoSection.appendChild(span);
    }

    // Render ellipsis button for hidden metrics
    const hiddenMetricsEnabled = hidden.filter((m) => showMetrics[m]);
    if (hiddenMetricsEnabled.length > 0) {
      addSeparator();
      const ellipsisBtn = document.createElement('span');
      ellipsisBtn.className = 'devbar-item devbar-clickable';
      Object.assign(ellipsisBtn.style, {
        opacity: '0.7',
        cursor: 'pointer',
        padding: '0 2px',
      });
      ellipsisBtn.textContent = '\u00B7\u00B7\u00B7';

      // Attach click-toggle tooltip showing hidden metrics (for mobile support)
      attachClickToggleTooltip(state, ellipsisBtn, (tooltip) => {
        addTooltipTitle(state, tooltip, 'More Metrics');

        const metricsContainer = document.createElement('div');
        Object.assign(metricsContainer.style, {
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          marginTop: '8px',
        });

        for (const metric of hiddenMetricsEnabled) {
          const config = metricConfigs[metric];
          const row = document.createElement('div');
          Object.assign(row.style, {
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
          });

          const labelSpan = document.createElement('span');
          Object.assign(labelSpan.style, { color: CSS_COLORS.textMuted });
          labelSpan.textContent = config.title.split('(')[0].trim();

          const valueSpan = document.createElement('span');
          Object.assign(valueSpan.style, { color: CSS_COLORS.text, fontWeight: '500' });
          valueSpan.textContent = config.value;

          row.appendChild(labelSpan);
          row.appendChild(valueSpan);
          metricsContainer.appendChild(row);
        }

        tooltip.appendChild(metricsContainer);
      });

      infoSection.appendChild(ellipsisBtn);
    }
  }

  statusRow.appendChild(infoSection);

  // Console badges - add to status row so they stay with info
  if (showConsoleBadges) {
    if (errorCount > 0) {
      statusRow.appendChild(createConsoleBadge(state, 'error', errorCount, BUTTON_COLORS.error));
    }
    if (warningCount > 0) {
      statusRow.appendChild(createConsoleBadge(state, 'warn', warningCount, BUTTON_COLORS.warning));
    }
    if (infoCount > 0) {
      statusRow.appendChild(createConsoleBadge(state, 'info', infoCount, BUTTON_COLORS.info));
    }
  }

  mainRow.appendChild(statusRow);

  // Action buttons - always render container for consistent height
  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'devbar-actions';
  if (showScreenshot) {
    actionsContainer.appendChild(createScreenshotButton(state, accentColor));
  }
  actionsContainer.appendChild(createAIReviewButton(state));
  actionsContainer.appendChild(createOutlineButton(state));
  actionsContainer.appendChild(createSchemaButton(state));
  actionsContainer.appendChild(createSettingsButton(state));
  actionsContainer.appendChild(createCompactToggleButton(state));
  mainRow.appendChild(actionsContainer);

  wrapper.appendChild(mainRow);

  // Render custom controls row if there are any
  if (customControls.length > 0) {
    const customRow = document.createElement('div');
    Object.assign(customRow.style, {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0 0.75rem 0.5rem 0.75rem',
      borderTop: `1px solid ${accentColor}30`,
      marginTop: '0',
      paddingTop: '0.5rem',
      fontFamily: FONT_MONO,
      fontSize: '0.6875rem',
    });

    customControls.forEach((control) => {
      const btn = document.createElement('button');
      btn.type = 'button';

      const color = control.variant === 'warning' ? BUTTON_COLORS.warning : accentColor;
      const isActive = control.active ?? false;
      const isDisabled = control.disabled ?? false;

      Object.assign(btn.style, {
        padding: '4px 10px',
        backgroundColor: isActive ? `${color}33` : 'transparent',
        border: `1px solid ${isActive ? color : `${color}60`}`,
        borderRadius: '6px',
        color: isActive ? color : `${color}99`,
        fontSize: '0.625rem',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? '0.5' : '1',
        transition: 'all 150ms',
      });

      btn.textContent = control.label;
      btn.disabled = isDisabled;

      if (!isDisabled) {
        btn.onmouseenter = () => {
          btn.style.backgroundColor = `${color}20`;
          btn.style.borderColor = color;
          btn.style.color = color;
        };
        btn.onmouseleave = () => {
          btn.style.backgroundColor = isActive ? `${color}33` : 'transparent';
          btn.style.borderColor = isActive ? color : `${color}60`;
          btn.style.color = isActive ? color : `${color}99`;
        };
        btn.onclick = () => control.onClick();
      }

      customRow.appendChild(btn);
    });

    wrapper.appendChild(customRow);
  }
}

// ============================================================================
// Button Creators
// ============================================================================

function createConsoleBadge(
  state: DevBarState,
  type: 'error' | 'warn' | 'info',
  count: number,
  color: string
): HTMLSpanElement {
  const labelMap = { error: 'error', warn: 'warning', info: 'info' } as const;
  const label = labelMap[type];
  const isActive = state.consoleFilter === type;

  const badge = document.createElement('span');
  badge.className = 'devbar-badge';
  Object.assign(badge.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '18px',
    height: '18px',
    padding: '0 5px',
    borderRadius: '9999px',
    backgroundColor: isActive ? color : `${color}E6`,
    color: '#fff',
    fontSize: '0.625rem',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: isActive ? `0 0 8px ${color}CC` : 'none',
  });
  badge.textContent = count > 99 ? '99+' : String(count);
  attachTextTooltip(
    state,
    badge,
    () => `${count} console ${label}${count === 1 ? '' : 's'} (click to view)`
  );
  badge.onclick = () => {
    state.consoleFilter = state.consoleFilter === type ? null : type;
    state.showOutlineModal = false;
    state.showSchemaModal = false;
    state.render();
  };

  return badge;
}

function createScreenshotButton(state: DevBarState, accentColor: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';

  const hasSuccessState = state.copiedToClipboard || state.copiedPath || state.lastScreenshot;
  const isDisabled = state.capturing;
  const effectiveSave = resolveSaveLocation(state.options.saveLocation, state.sweetlinkConnected);
  // Grey out only when effective save is 'local' but sweetlink not connected (explicit 'local' setting)
  const isGreyedOut = effectiveSave === 'local' && !state.sweetlinkConnected && !hasSuccessState;

  // Attach HTML tooltip
  attachButtonTooltip(state, btn, accentColor, (tooltip, h) => {
    if (state.copiedToClipboard) {
      h.addSuccess('Copied to clipboard!');
      return;
    }
    if (state.copiedPath) {
      h.addSuccess('Path copied to clipboard!');
      return;
    }
    if (state.lastScreenshot) {
      const screenshotPath = state.lastScreenshot;
      const isDownloaded = screenshotPath.endsWith('downloaded');

      if (isDownloaded) {
        h.addSuccess('Screenshot downloaded!');
      } else {
        h.addSuccess('Screenshot saved!', screenshotPath);

        const copyLink = document.createElement('div');
        Object.assign(copyLink.style, {
          color: accentColor,
          cursor: 'pointer',
          fontSize: '0.625rem',
          marginTop: '6px',
          opacity: '0.8',
          transition: 'opacity 150ms',
        });
        copyLink.textContent = 'copy path';
        copyLink.onmouseenter = () => {
          copyLink.style.opacity = '1';
        };
        copyLink.onmouseleave = () => {
          copyLink.style.opacity = '0.8';
        };
        copyLink.onclick = async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(screenshotPath);
            copyLink.textContent = '\u2713 copied!';
            copyLink.style.cursor = 'default';
            copyLink.onclick = null;
          } catch {
            copyLink.textContent = '\u00d7 failed to copy';
            copyLink.style.color = CSS_COLORS.error;
          }
        };
        tooltip.appendChild(copyLink);
      }
      return;
    }

    h.addTitle('Screenshot');
    h.addSectionHeader('Actions');

    if (effectiveSave === 'local' && !state.sweetlinkConnected) {
      h.addShortcut('Shift+Click', 'Copy to clipboard');
      h.addWarning('Sweetlink not connected. Switch save method to Auto or Download.');
    } else {
      const saveLabel = effectiveSave === 'local' ? 'Save to file' : 'Download';
      h.addShortcut('Click', saveLabel);
      h.addShortcut('Shift+Click', 'Copy to clipboard');
      h.addSectionHeader('Keyboard');
      h.addShortcut('Cmd or Ctrl+Shift+S', saveLabel);
      h.addShortcut('Cmd or Ctrl+Shift+C', 'Copy');
    }
  });

  Object.assign(btn.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    minWidth: '22px',
    minHeight: '22px',
    flexShrink: '0',
    borderRadius: '50%',
    border: '1px solid',
    borderColor: hasSuccessState ? accentColor : `${accentColor}80`,
    backgroundColor: hasSuccessState ? `${accentColor}33` : 'transparent',
    color: hasSuccessState ? accentColor : `${accentColor}99`,
    cursor: !isDisabled ? 'pointer' : 'not-allowed',
    opacity: isGreyedOut ? '0.4' : '1',
    transition: 'all 150ms',
  });

  btn.disabled = isDisabled;
  btn.onclick = (e) => {
    // If we have a saved screenshot path, clicking copies the path
    if (state.lastScreenshot && !e.shiftKey) {
      copyPathToClipboard(state, state.lastScreenshot);
    } else {
      state.handleScreenshot(e.shiftKey);
    }
  };

  // Button content
  if (state.copiedToClipboard || state.copiedPath || state.lastScreenshot) {
    btn.textContent = '\u2713';
    btn.style.fontSize = '0.6rem';
  } else if (state.capturing) {
    btn.textContent = '...';
    btn.style.fontSize = '0.5rem';
  } else {
    // Camera icon SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('viewBox', '0 0 50.8 50.8');
    svg.style.stroke = 'currentColor';
    svg.style.fill = 'none';

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('stroke-linecap', 'round');
    g.setAttribute('stroke-linejoin', 'round');
    g.setAttribute('stroke-width', '4');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      'M19.844 7.938H7.938v11.905m0 11.113v11.906h11.905m23.019-11.906v11.906H30.956m11.906-23.018V7.938H30.956'
    );

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '25.4');
    circle.setAttribute('cy', '25.4');
    circle.setAttribute('r', '8.731');

    g.appendChild(path);
    g.appendChild(circle);
    svg.appendChild(g);
    btn.appendChild(svg);
  }

  return btn;
}

function createAIReviewButton(state: DevBarState): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';

  const hasError = !!state.designReviewError;
  const isActive = state.designReviewInProgress || !!state.lastDesignReview || hasError;
  const isDisabled = state.designReviewInProgress || !state.sweetlinkConnected;

  // Use error color (red) when there's an error, otherwise normal review color
  const buttonColor = hasError ? CSS_COLORS.error : BUTTON_COLORS.review;

  // Attach HTML tooltip
  attachButtonTooltip(state, btn, buttonColor, (_tooltip, h) => {
    if (state.designReviewInProgress) {
      h.addProgress('AI Design Review in progress...');
      return;
    }
    if (state.designReviewError) {
      h.addError('Design review failed', state.designReviewError);
      return;
    }
    if (state.lastDesignReview) {
      h.addSuccess('Design review saved!', state.lastDesignReview);
      return;
    }

    h.addTitle('AI Design Review');
    h.addDescription('Captures screenshot and sends to Claude for design analysis.');
    h.addSectionHeader('Requirements');
    h.addShortcut('API Key', 'ANTHROPIC_API_KEY');

    if (!state.sweetlinkConnected) {
      h.addWarning('Sweetlink not connected');
    }
  });

  Object.assign(btn.style, getButtonStyles(buttonColor, isActive, isDisabled));
  if (!state.sweetlinkConnected) btn.style.opacity = '0.5';

  btn.disabled = isDisabled;
  btn.onclick = () => showDesignReviewConfirmation(state);

  if (state.designReviewInProgress) {
    btn.textContent = '~';
    btn.style.fontSize = '0.5rem';
    btn.style.animation = 'pulse 1s infinite';
  } else if (state.designReviewError) {
    // Show 'x' for error state
    btn.textContent = '\u00D7';
    btn.style.fontSize = '0.875rem';
    btn.style.fontWeight = 'bold';
  } else if (state.lastDesignReview) {
    btn.textContent = 'v';
    btn.style.fontSize = '0.5rem';
  } else {
    btn.appendChild(
      createSvgIcon(
        'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z',
        { fill: true }
      )
    );
  }

  return btn;
}

function createOutlineButton(state: DevBarState): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';

  const isActive = state.showOutlineModal || !!state.lastOutline;

  // Attach HTML tooltip
  attachButtonTooltip(state, btn, BUTTON_COLORS.outline, (_tooltip, h) => {
    if (state.lastOutline) {
      const isDownloaded = state.lastOutline.endsWith('downloaded');
      h.addSuccess(isDownloaded ? 'Outline downloaded!' : 'Outline saved!', isDownloaded ? undefined : state.lastOutline);
      return;
    }

    h.addTitle('Document Outline');
    h.addDescription('View page heading structure and save as markdown.');

    if (state.options.saveLocation === 'local' && !state.sweetlinkConnected) {
      h.addWarning('Sweetlink not connected. Switch save method to Auto or Download.');
    }
  });

  Object.assign(btn.style, getButtonStyles(BUTTON_COLORS.outline, isActive, false));
  btn.onclick = () => handleDocumentOutline(state);

  if (state.lastOutline) {
    btn.textContent = 'v';
    btn.style.fontSize = '0.5rem';
  } else {
    btn.appendChild(createSvgIcon('M3 4h18v2H3V4zm0 7h12v2H3v-2zm0 7h18v2H3v-2z', { fill: true }));
  }

  return btn;
}

function createSchemaButton(state: DevBarState): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';

  const isActive = state.showSchemaModal || !!state.lastSchema;

  // Attach HTML tooltip
  attachButtonTooltip(state, btn, BUTTON_COLORS.schema, (_tooltip, h) => {
    if (state.lastSchema) {
      const isDownloaded = state.lastSchema.endsWith('downloaded');
      h.addSuccess(isDownloaded ? 'Schema downloaded!' : 'Schema saved!', isDownloaded ? undefined : state.lastSchema);
      return;
    }

    h.addTitle('Page Schema');
    h.addDescription('View JSON-LD, Open Graph, and other structured data.');

    if (state.options.saveLocation === 'local' && !state.sweetlinkConnected) {
      h.addWarning('Sweetlink not connected. Switch save method to Auto or Download.');
    }
  });

  Object.assign(btn.style, getButtonStyles(BUTTON_COLORS.schema, isActive, false));
  btn.onclick = () => handlePageSchema(state);

  if (state.lastSchema) {
    btn.textContent = 'v';
    btn.style.fontSize = '0.5rem';
  } else {
    btn.appendChild(
      createSvgIcon(
        'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
        { fill: true }
      )
    );
  }

  return btn;
}

/**
 * Create the settings gear button.
 */
function createSettingsButton(state: DevBarState): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('data-testid', 'devbar-settings-button');

  // Attach HTML tooltip
  attachButtonTooltip(state, btn, CSS_COLORS.textSecondary, (_tooltip, h) => {
    h.addTitle('Settings');
    h.addSectionHeader('Keyboard');
    h.addShortcut('Cmd or Ctrl+Shift+M', 'Toggle compact mode');
  });

  const isActive = state.showSettingsPopover;
  const color = CSS_COLORS.textSecondary;

  Object.assign(btn.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    minWidth: '22px',
    minHeight: '22px',
    flexShrink: '0',
    borderRadius: '50%',
    border: `1px solid ${isActive ? color : `${color}60`}`,
    backgroundColor: isActive ? `${color}20` : 'transparent',
    color: isActive ? color : `${color}99`,
    cursor: 'pointer',
    transition: 'all 150ms',
  });

  btn.onclick = () => {
    state.showSettingsPopover = !state.showSettingsPopover;
    state.consoleFilter = null;
    state.showOutlineModal = false;
    state.showSchemaModal = false;
    state.showDesignReviewConfirm = false;
    state.render();
  };

  // Gear icon SVG
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'
  );
  svg.appendChild(path);

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '3');
  svg.appendChild(circle);

  btn.appendChild(svg);
  return btn;
}

/**
 * Create the compact mode toggle button with chevron icon.
 */
function createCompactToggleButton(state: DevBarState): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';

  const isCompact = state.compactMode;
  const { accentColor } = state.options;
  const iconColor = CSS_COLORS.textSecondary;

  Object.assign(btn.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    minWidth: '22px',
    minHeight: '22px',
    flexShrink: '0',
    borderRadius: '50%',
    border: `1px solid ${accentColor}60`,
    backgroundColor: 'transparent',
    color: `${iconColor}99`,
    cursor: 'pointer',
    transition: 'all 150ms',
  });

  attachTextTooltip(
    state,
    btn,
    () => (isCompact ? 'Expand (Cmd or Ctrl+Shift+M)' : 'Compact (Cmd or Ctrl+Shift+M)'),
    {
      onEnter: () => {
        btn.style.borderColor = accentColor;
        btn.style.backgroundColor = `${accentColor}20`;
        btn.style.color = iconColor;
      },
      onLeave: () => {
        btn.style.borderColor = `${accentColor}60`;
        btn.style.backgroundColor = 'transparent';
        btn.style.color = `${iconColor}99`;
      },
    }
  );

  btn.onclick = () => {
    state.toggleCompactMode();
  };

  // Chevron icon SVG - points right when expanded, left when compact
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  // Left chevron (<) when expanded to shrink, right chevron (>) when compact to expand
  path.setAttribute('points', isCompact ? '9 18 15 12 9 6' : '15 18 9 12 15 6');
  svg.appendChild(path);

  btn.appendChild(svg);
  return btn;
}

// ============================================================================
// Console Popup
// ============================================================================

function renderConsolePopup(state: DevBarState, consoleCaptureSingleton: ConsoleCapture): void {
  const filterType = state.consoleFilter;
  if (!filterType) return;

  const logs = consoleCaptureSingleton
    .getLogs()
    .filter((log: ConsoleLog) => log.level === filterType);
  const colorMap = { error: BUTTON_COLORS.error, warn: BUTTON_COLORS.warning, info: BUTTON_COLORS.info };
  const color = colorMap[filterType];
  const labelMap = { error: 'Errors', warn: 'Warnings', info: 'Info' } as const;
  const label = labelMap[filterType];

  const closeModal = () => {
    state.consoleFilter = null;
    state.render();
  };

  const overlay = createModalOverlay(closeModal);
  const modal = createModalBox(color);

  const header = createModalHeader({
    color,
    title: `Console ${label} (${logs.length})`,
    onClose: closeModal,
    onCopyMd: async () => {
      const lines = logs.map((log) => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        return `[${time}] ${log.level}: ${log.message}`;
      });
      await navigator.clipboard.writeText(lines.join('\n'));
    },
    onSave: () => handleSaveConsoleLogs(state, logs),
    sweetlinkConnected: state.sweetlinkConnected,
    saveLocation: state.options.saveLocation,
    isSaving: state.savingConsoleLogs,
    savedPath: state.lastConsoleLogs,
  });
  modal.appendChild(header);

  const content = createModalContent();

  if (logs.length === 0) {
    content.appendChild(createEmptyMessage(`No ${filterType}s recorded`));
  } else {
    renderConsoleLogs(content, logs, color);
  }

  modal.appendChild(content);
  overlay.appendChild(modal);

  state.overlayElement = overlay;
  document.body.appendChild(overlay);
}

function renderConsoleLogs(container: HTMLElement, logs: ConsoleLog[], color: string): void {
  logs.forEach((log, index) => {
    const logItem = document.createElement('div');
    Object.assign(logItem.style, {
      padding: '8px 14px',
      borderBottom: index < logs.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
    });

    const timestamp = document.createElement('span');
    Object.assign(timestamp.style, {
      color: CSS_COLORS.textMuted,
      fontSize: '0.625rem',
      marginRight: '8px',
    });
    timestamp.textContent = new Date(log.timestamp).toLocaleTimeString();
    logItem.appendChild(timestamp);

    const message = document.createElement('span');
    Object.assign(message.style, {
      color,
      fontSize: '0.6875rem',
      wordBreak: 'break-word',
      whiteSpace: 'pre-wrap',
    });
    message.textContent = log.message;
    logItem.appendChild(message);

    container.appendChild(logItem);
  });
}

// ============================================================================
// Outline / Schema Modals
// ============================================================================

function renderOutlineModal(state: DevBarState): void {
  const outline = extractDocumentOutline();
  const color = BUTTON_COLORS.outline;

  const closeModal = () => {
    state.showOutlineModal = false;
    state.render();
  };

  const overlay = createModalOverlay(closeModal);
  const modal = createModalBox(color);

  const header = createModalHeader({
    color,
    title: 'Document Outline',
    onClose: closeModal,
    onCopyMd: async () => {
      const markdown = outlineToMarkdown(outline);
      await navigator.clipboard.writeText(markdown);
    },
    onSave: () => handleSaveOutline(state),
    sweetlinkConnected: state.sweetlinkConnected,
    saveLocation: state.options.saveLocation,
    isSaving: state.savingOutline,
    savedPath: state.lastOutline,
  });
  modal.appendChild(header);

  const content = createModalContent();

  if (outline.length === 0) {
    content.appendChild(createEmptyMessage('No semantic elements found in this document'));
  } else {
    renderOutlineNodes(outline, content, 0);
  }

  modal.appendChild(content);
  overlay.appendChild(modal);

  state.overlayElement = overlay;
  document.body.appendChild(overlay);
}

function renderOutlineNodes(nodes: OutlineNode[], parentEl: HTMLElement, depth: number): void {
  for (const node of nodes) {
    const nodeEl = document.createElement('div');
    Object.assign(nodeEl.style, {
      padding: `4px 0 4px ${depth * 16}px`,
    });

    const tagSpan = document.createElement('span');
    const categoryColor = CATEGORY_COLORS[node.category || 'other'] || CATEGORY_COLORS.other;
    Object.assign(tagSpan.style, {
      color: categoryColor,
      fontSize: '0.6875rem',
      fontWeight: '500',
    });
    tagSpan.textContent = `<${node.tagName}>`;
    nodeEl.appendChild(tagSpan);

    if (node.category) {
      const categorySpan = document.createElement('span');
      Object.assign(categorySpan.style, {
        color: CSS_COLORS.textMuted,
        fontSize: '0.625rem',
        marginLeft: '6px',
      });
      categorySpan.textContent = `[${node.category}]`;
      nodeEl.appendChild(categorySpan);
    }

    const textSpan = document.createElement('span');
    Object.assign(textSpan.style, {
      color: '#d1d5db',
      fontSize: '0.6875rem',
      marginLeft: '8px',
    });
    const truncatedText = node.text.length > 60 ? `${node.text.slice(0, 60)}...` : node.text;
    textSpan.textContent = truncatedText;
    nodeEl.appendChild(textSpan);

    if (node.id) {
      const idSpan = document.createElement('span');
      Object.assign(idSpan.style, {
        color: '#9ca3af',
        fontSize: '0.625rem',
        marginLeft: '6px',
      });
      idSpan.textContent = `#${node.id}`;
      nodeEl.appendChild(idSpan);
    }

    parentEl.appendChild(nodeEl);

    if (node.children.length > 0) {
      renderOutlineNodes(node.children, parentEl, depth + 1);
    }
  }
}

function renderSchemaModal(state: DevBarState): void {
  const schema = extractPageSchema();
  const color = BUTTON_COLORS.schema;

  const closeModal = () => {
    state.showSchemaModal = false;
    state.render();
  };

  const overlay = createModalOverlay(closeModal);
  const modal = createModalBox(color);

  const header = createModalHeader({
    color,
    title: 'Page Schema',
    onClose: closeModal,
    onCopyMd: async () => {
      const markdown = schemaToMarkdown(schema);
      await navigator.clipboard.writeText(markdown);
    },
    onSave: () => handleSaveSchema(state),
    sweetlinkConnected: state.sweetlinkConnected,
    saveLocation: state.options.saveLocation,
    isSaving: state.savingSchema,
    savedPath: state.lastSchema,
  });
  modal.appendChild(header);

  const content = createModalContent();

  const hasContent =
    schema.jsonLd.length > 0 ||
    Object.keys(schema.openGraph).length > 0 ||
    Object.keys(schema.twitter).length > 0 ||
    Object.keys(schema.metaTags).length > 0;

  if (!hasContent) {
    content.appendChild(createEmptyMessage('No structured data found on this page'));
  } else {
    renderSchemaSection(content, 'JSON-LD', schema.jsonLd, color);
    renderSchemaSection(content, 'Open Graph', schema.openGraph, CSS_COLORS.info);
    renderSchemaSection(content, 'Twitter Cards', schema.twitter, CSS_COLORS.cyan);
    renderSchemaSection(content, 'Meta Tags', schema.metaTags, CSS_COLORS.textMuted);
  }

  modal.appendChild(content);
  overlay.appendChild(modal);

  state.overlayElement = overlay;
  document.body.appendChild(overlay);
}

function renderSchemaSection(
  container: HTMLElement,
  title: string,
  items: Record<string, string> | unknown[],
  color: string
): void {
  const isEmpty = Array.isArray(items) ? items.length === 0 : Object.keys(items).length === 0;
  if (isEmpty) return;

  const section = document.createElement('div');
  section.style.marginBottom = '20px';

  const sectionTitle = document.createElement('h3');
  Object.assign(sectionTitle.style, {
    color,
    fontSize: '0.8125rem',
    fontWeight: '600',
    marginBottom: '10px',
    borderBottom: `1px solid ${color}40`,
    paddingBottom: '6px',
  });
  sectionTitle.textContent = title;
  section.appendChild(sectionTitle);

  if (Array.isArray(items)) {
    renderJsonLdItems(section, items);
  } else {
    renderKeyValueItems(section, items);
  }

  container.appendChild(section);
}

function renderJsonLdItems(container: HTMLElement, items: unknown[]): void {
  items.forEach((item, i) => {
    const itemEl = document.createElement('div');
    itemEl.style.marginBottom = '10px';

    const itemTitle = document.createElement('div');
    Object.assign(itemTitle.style, {
      color: '#9ca3af',
      fontSize: '0.6875rem',
      marginBottom: '4px',
    });
    itemTitle.textContent = `Schema ${i + 1}`;
    itemEl.appendChild(itemTitle);

    const codeEl = document.createElement('pre');
    Object.assign(codeEl.style, {
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '4px',
      padding: '10px',
      overflow: 'auto',
      fontSize: '0.625rem',
      margin: '0',
      maxHeight: '300px',
    });
    // Syntax highlight the JSON using DOM methods for safety
    appendHighlightedJson(codeEl, JSON.stringify(item, null, 2));
    itemEl.appendChild(codeEl);

    container.appendChild(itemEl);
  });
}

function appendHighlightedJson(container: HTMLElement, json: string): void {
  // Color map for different token types
  const colors: Record<string, string> = {
    key: CSS_COLORS.primary, // green
    string: CSS_COLORS.warning, // amber/yellow
    number: CSS_COLORS.purple, // purple
    boolean: CSS_COLORS.info, // blue
    nullVal: CSS_COLORS.error, // red
    punct: CSS_COLORS.textMuted, // gray
  };

  // Simple tokenizer for JSON using matchAll for safety
  const tokenPattern =
    /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|(\btrue\b|\bfalse\b)|(\bnull\b)|(-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)|([{}[\],])|(\s+)/g;

  for (const match of json.matchAll(tokenPattern)) {
    const [, str, colon, bool, nullToken, num, punct, whitespace] = match;

    if (whitespace) {
      container.appendChild(document.createTextNode(whitespace));
    } else if (str !== undefined) {
      const span = document.createElement('span');
      span.style.color = colon ? colors.key : colors.string;
      span.textContent = str;
      container.appendChild(span);
      if (colon) {
        const colonSpan = document.createElement('span');
        colonSpan.style.color = colors.punct;
        colonSpan.textContent = ':';
        container.appendChild(colonSpan);
      }
    } else if (bool) {
      const span = document.createElement('span');
      span.style.color = colors.boolean;
      span.textContent = bool;
      container.appendChild(span);
    } else if (nullToken) {
      const span = document.createElement('span');
      span.style.color = colors.nullVal;
      span.textContent = nullToken;
      container.appendChild(span);
    } else if (num) {
      const span = document.createElement('span');
      span.style.color = colors.number;
      span.textContent = num;
      container.appendChild(span);
    } else if (punct) {
      const span = document.createElement('span');
      span.style.color = colors.punct;
      span.textContent = punct;
      container.appendChild(span);
    }
  }
}

function renderKeyValueItems(container: HTMLElement, items: Record<string, string>): void {
  for (const [key, value] of Object.entries(items)) {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      marginBottom: '4px',
      alignItems: 'flex-start',
    });

    const keyEl = document.createElement('span');
    Object.assign(keyEl.style, {
      color: '#9ca3af',
      fontSize: '0.6875rem',
      width: '120px',
      minWidth: '120px',
      maxWidth: '120px',
      flexShrink: '0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
    keyEl.textContent = key;
    // Show full key on hover if it might be truncated
    if (key.length > 18) {
      keyEl.title = key;
    }
    row.appendChild(keyEl);

    const valueEl = document.createElement('span');
    const strValue = String(value);
    Object.assign(valueEl.style, {
      color: '#d1d5db',
      fontSize: '0.6875rem',
      flex: '1',
      wordBreak: 'break-word',
      whiteSpace: 'pre-wrap',
    });
    valueEl.textContent = strValue;
    row.appendChild(valueEl);

    container.appendChild(row);
  }
}

// ============================================================================
// Design Review Confirmation Modal
// ============================================================================

function renderDesignReviewConfirmModal(state: DevBarState): void {
  const color = BUTTON_COLORS.review;
  const closeModal = () => closeDesignReviewConfirm(state);

  const overlay = createModalOverlay(closeModal);
  // Override z-index for this modal to be above others
  overlay.style.zIndex = '10003';

  const modal = createModalBox(color);
  modal.style.maxWidth = '450px';

  // Header with title and close button
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px',
    borderBottom: `1px solid ${color}40`,
    backgroundColor: `${color}15`,
  });

  const title = document.createElement('span');
  Object.assign(title.style, { color, fontSize: '0.875rem', fontWeight: '600' });
  title.textContent = 'AI Design Review';
  header.appendChild(title);

  const closeBtn = createStyledButton({
    color: CSS_COLORS.textMuted,
    text: '\u00D7',
    padding: '0',
    fontSize: '1.25rem',
  });
  closeBtn.style.border = 'none';
  closeBtn.onclick = closeModal;
  header.appendChild(closeBtn);
  modal.appendChild(header);

  // Content
  const content = document.createElement('div');
  Object.assign(content.style, {
    padding: '18px',
    color: CSS_COLORS.text,
    fontSize: '0.8125rem',
    lineHeight: '1.6',
  });

  if (state.apiKeyStatus === null) {
    content.appendChild(createEmptyMessage('Checking API key configuration...'));
  } else if (!state.apiKeyStatus.configured) {
    content.appendChild(renderApiKeyNotConfiguredContent());
  } else {
    content.appendChild(renderApiKeyConfiguredContent(state));
  }

  modal.appendChild(content);

  // Footer with buttons
  const footer = document.createElement('div');
  Object.assign(footer.style, {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    padding: '14px 18px',
    borderTop: `1px solid ${CSS_COLORS.border}`,
  });

  const cancelBtn = createStyledButton({
    color: CSS_COLORS.textMuted,
    text: 'Cancel',
    padding: '8px 16px',
  });
  cancelBtn.onclick = closeModal;
  footer.appendChild(cancelBtn);

  if (state.apiKeyStatus?.configured) {
    const proceedBtn = createStyledButton({ color, text: 'Run Review', padding: '8px 16px' });
    proceedBtn.style.backgroundColor = `${color}20`;
    proceedBtn.onclick = () => proceedWithDesignReview(state);
    footer.appendChild(proceedBtn);
  }

  modal.appendChild(footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function renderApiKeyNotConfiguredContent(): HTMLElement {
  const wrapper = document.createElement('div');

  wrapper.appendChild(
    createInfoBox(
      CSS_COLORS.error,
      'API Key Not Configured',
      'The ANTHROPIC_API_KEY environment variable is not set.'
    )
  );

  // Instructions
  const instructions = document.createElement('div');
  Object.assign(instructions.style, { marginBottom: '12px' });

  const instructTitle = document.createElement('div');
  Object.assign(instructTitle.style, {
    color: CSS_COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: '8px',
  });
  instructTitle.textContent = 'To configure:';
  instructions.appendChild(instructTitle);

  const steps = [
    { text: '1. Get an API key from console.anthropic.com', highlight: false },
    { text: '2. Add to your .env file:', highlight: false },
    { text: '   ANTHROPIC_API_KEY=sk-ant-...', highlight: true },
    { text: '3. Restart your dev server', highlight: false },
  ];

  steps.forEach(({ text, highlight }) => {
    const stepDiv = document.createElement('div');
    Object.assign(stepDiv.style, {
      color: highlight ? CSS_COLORS.primary : CSS_COLORS.textMuted,
      fontSize: '0.75rem',
      marginBottom: '4px',
      fontFamily: FONT_MONO,
    });
    stepDiv.textContent = text;
    instructions.appendChild(stepDiv);
  });

  wrapper.appendChild(instructions);
  return wrapper;
}

function renderApiKeyConfiguredContent(state: DevBarState): HTMLElement {
  const wrapper = document.createElement('div');
  Object.assign(wrapper.style, { marginBottom: '16px' });

  const desc = document.createElement('p');
  Object.assign(desc.style, { color: CSS_COLORS.textSecondary, marginBottom: '12px' });
  desc.textContent = 'This will capture a screenshot and send it to Claude for design analysis.';
  wrapper.appendChild(desc);

  // Cost estimate
  const estimate = calculateCostEstimate(state);
  if (estimate) {
    const costBox = createInfoBox(CSS_COLORS.primary, 'Estimated Cost', []);
    // Remove default margin and adjust padding
    costBox.style.marginBottom = '0';
    costBox.style.padding = '12px';

    const costDetails = document.createElement('div');
    Object.assign(costDetails.style, {
      display: 'flex',
      justifyContent: 'space-between',
      color: CSS_COLORS.textSecondary,
      fontSize: '0.75rem',
    });

    const tokensSpan = document.createElement('span');
    tokensSpan.textContent = `~${estimate.tokens.toLocaleString()} tokens`;
    costDetails.appendChild(tokensSpan);

    const priceSpan = document.createElement('span');
    Object.assign(priceSpan.style, { color: CSS_COLORS.warning, fontWeight: '600' });
    priceSpan.textContent = estimate.cost;
    costDetails.appendChild(priceSpan);

    costBox.appendChild(costDetails);
    wrapper.appendChild(costBox);
  }

  // Model info
  if (state.apiKeyStatus?.model) {
    const modelDiv = document.createElement('div');
    Object.assign(modelDiv.style, {
      color: CSS_COLORS.textMuted,
      fontSize: '0.6875rem',
      marginTop: '12px',
    });
    modelDiv.textContent = `Model: ${state.apiKeyStatus.model}`;
    wrapper.appendChild(modelDiv);
  }

  return wrapper;
}

// ============================================================================
// Settings Popover
// ============================================================================

function renderSettingsPopover(state: DevBarState): void {
  const { position, accentColor } = state.options;
  const color = CSS_COLORS.textSecondary;

  const popover = document.createElement('div');
  popover.setAttribute('data-devbar', 'true');

  // Position based on devbar position
  const isTop = position.startsWith('top');
  const isRight = position.includes('right');

  Object.assign(popover.style, {
    position: 'fixed',
    [isTop ? 'top' : 'bottom']: '70px',
    [isRight ? 'right' : 'left']: isRight ? '16px' : '80px',
    zIndex: '10003',
    backgroundColor: 'var(--devbar-color-bg-elevated)',
    border: `1px solid ${accentColor}`,
    borderRadius: '8px',
    boxShadow: `0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px ${accentColor}33`,
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    minWidth: '240px',
    maxWidth: '280px',
    maxHeight: 'calc(100vh - 100px)',
    overflowY: 'auto',
    fontFamily: FONT_MONO,
  });

  // Header
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: `1px solid ${accentColor}30`,
    position: 'sticky',
    top: '0',
    backgroundColor: 'var(--devbar-color-bg-elevated)',
    zIndex: '1',
  });

  const title = document.createElement('span');
  Object.assign(title.style, { color: accentColor, fontSize: '0.75rem', fontWeight: '600' });
  title.textContent = 'Settings';
  header.appendChild(title);

  const closeBtn = createStyledButton({
    color: CSS_COLORS.textMuted,
    text: '\u00D7',
    padding: '2px 6px',
    fontSize: '0.875rem',
  });
  closeBtn.style.border = 'none';
  closeBtn.onclick = () => {
    state.showSettingsPopover = false;
    state.render();
  };
  header.appendChild(closeBtn);
  popover.appendChild(header);

  // ========== THEME SECTION ==========
  const themeSection = createSettingsSection('Theme');

  const themeOptions = document.createElement('div');
  Object.assign(themeOptions.style, { display: 'flex', gap: '6px' });

  const themeModes: ThemeMode[] = ['system', 'dark', 'light'];
  themeModes.forEach((mode) => {
    const btn = document.createElement('button');
    const isActive = state.themeMode === mode;
    Object.assign(btn.style, {
      padding: '4px 10px',
      backgroundColor: isActive ? `${accentColor}20` : 'transparent',
      border: `1px solid ${isActive ? accentColor : `${color}40`}`,
      borderRadius: '4px',
      color: isActive ? accentColor : color,
      fontSize: '0.625rem',
      cursor: 'pointer',
      textTransform: 'capitalize',
      transition: 'all 150ms',
    });
    btn.textContent = mode;
    btn.onclick = () => {
      setThemeMode(state, mode);
    };
    themeOptions.appendChild(btn);
  });
  themeSection.appendChild(themeOptions);
  popover.appendChild(themeSection);

  // ========== DISPLAY SECTION ==========
  const displaySection = createSettingsSection('Display');

  // Position mini-map selector
  const positionRow = document.createElement('div');
  Object.assign(positionRow.style, { marginBottom: '10px' });

  const posLabel = document.createElement('div');
  Object.assign(posLabel.style, {
    color: CSS_COLORS.text,
    fontSize: '0.6875rem',
    marginBottom: '6px',
  });
  posLabel.textContent = 'Position';
  positionRow.appendChild(posLabel);

  // Mini-map container (represents screen with ~16:10 aspect ratio)
  const miniMap = document.createElement('div');
  Object.assign(miniMap.style, {
    position: 'relative',
    width: '100%',
    height: '70px',
    backgroundColor: 'var(--devbar-color-bg-input)',
    border: `1px solid ${color}30`,
    borderRadius: '4px',
  });

  // Position indicator styles - rectangular bars representing DevBar
  type PositionValue = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'bottom-center';
  const positionConfigs: Array<{
    value: PositionValue;
    style: Partial<CSSStyleDeclaration>;
    title: string;
  }> = [
    { value: 'top-left', style: { top: '6px', left: '6px' }, title: 'Top Left' },
    { value: 'top-right', style: { top: '6px', right: '6px' }, title: 'Top Right' },
    { value: 'bottom-left', style: { bottom: '6px', left: '6px' }, title: 'Bottom Left' },
    { value: 'bottom-right', style: { bottom: '6px', right: '6px' }, title: 'Bottom Right' },
    {
      value: 'bottom-center',
      style: { bottom: '6px', left: '50%', transform: 'translateX(-50%)' },
      title: 'Bottom Center',
    },
  ];

  positionConfigs.forEach(({ value, style, title: posTitle }) => {
    const indicator = document.createElement('button');
    indicator.setAttribute('data-position', value);
    const isActive = state.options.position === value;

    Object.assign(indicator.style, {
      position: 'absolute',
      width: '24px',
      height: '6px',
      backgroundColor: isActive ? accentColor : CSS_COLORS.textMuted,
      border: `1px solid ${isActive ? accentColor : CSS_COLORS.textMuted}`,
      borderRadius: '2px',
      cursor: 'pointer',
      padding: '0',
      transition: 'all 150ms',
      boxShadow: isActive ? `0 0 8px ${accentColor}60` : 'none',
      opacity: isActive ? '1' : '0.5',
      ...style,
    });

    indicator.title = posTitle;
    indicator.onclick = () => {
      state.options.position = value;
      state.settingsManager.saveSettings({ position: value });
      state.render();
    };

    // Hover effect
    indicator.onmouseenter = () => {
      if (!isActive) {
        indicator.style.backgroundColor = accentColor;
        indicator.style.borderColor = accentColor;
        indicator.style.boxShadow = `0 0 6px ${accentColor}40`;
        indicator.style.opacity = '1';
      }
    };
    indicator.onmouseleave = () => {
      if (!isActive) {
        indicator.style.backgroundColor = CSS_COLORS.textMuted;
        indicator.style.borderColor = CSS_COLORS.textMuted;
        indicator.style.boxShadow = 'none';
        indicator.style.opacity = '0.5';
      }
    };

    miniMap.appendChild(indicator);
  });

  positionRow.appendChild(miniMap);
  displaySection.appendChild(positionRow);

  // Compact mode toggle
  displaySection.appendChild(
    createToggleRow('Compact Mode', state.compactMode, accentColor, () => {
      state.toggleCompactMode();
    })
  );

  // Keyboard shortcut hint
  const shortcutHint = document.createElement('div');
  Object.assign(shortcutHint.style, {
    color: CSS_COLORS.textMuted,
    fontSize: '0.5625rem',
    marginTop: '2px',
    marginBottom: '8px',
  });
  shortcutHint.textContent = 'Keyboard: Cmd or Ctrl+Shift+M';
  displaySection.appendChild(shortcutHint);

  // Accent color
  const accentRow = document.createElement('div');
  Object.assign(accentRow.style, { marginBottom: '6px' });

  const accentLabel = document.createElement('div');
  Object.assign(accentLabel.style, {
    color: CSS_COLORS.text,
    fontSize: '0.6875rem',
    marginBottom: '6px',
  });
  accentLabel.textContent = 'Accent Color';
  accentRow.appendChild(accentLabel);

  const colorSwatches = document.createElement('div');
  Object.assign(colorSwatches.style, {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  });

  ACCENT_COLOR_PRESETS.forEach(({ name, value }) => {
    const swatch = document.createElement('button');
    const isActive = state.options.accentColor === value;
    Object.assign(swatch.style, {
      width: '24px',
      height: '24px',
      borderRadius: '50%',
      backgroundColor: value,
      border: isActive ? '2px solid #fff' : '2px solid transparent',
      cursor: 'pointer',
      transition: 'all 150ms',
      boxShadow: isActive ? `0 0 8px ${value}` : 'none',
    });
    swatch.title = name;
    swatch.onclick = () => {
      state.options.accentColor = value;
      state.settingsManager.saveSettings({ accentColor: value });
      state.render();
    };
    colorSwatches.appendChild(swatch);
  });

  accentRow.appendChild(colorSwatches);
  displaySection.appendChild(accentRow);

  popover.appendChild(displaySection);

  // ========== FEATURES SECTION ==========
  const featuresSection = createSettingsSection('Features');

  featuresSection.appendChild(
    createToggleRow('Screenshot Button', state.options.showScreenshot, accentColor, () => {
      state.options.showScreenshot = !state.options.showScreenshot;
      state.settingsManager.saveSettings({ showScreenshot: state.options.showScreenshot });
      state.render();
    })
  );

  featuresSection.appendChild(
    createToggleRow('Console Badges', state.options.showConsoleBadges, accentColor, () => {
      state.options.showConsoleBadges = !state.options.showConsoleBadges;
      state.settingsManager.saveSettings({ showConsoleBadges: state.options.showConsoleBadges });
      state.render();
    })
  );

  featuresSection.appendChild(
    createToggleRow('Tooltips', state.options.showTooltips, accentColor, () => {
      state.options.showTooltips = !state.options.showTooltips;
      state.settingsManager.saveSettings({ showTooltips: state.options.showTooltips });
      state.render();
    })
  );

  // Save location selector
  const saveLocRow = document.createElement('div');
  Object.assign(saveLocRow.style, { marginBottom: '6px' });

  const saveLocLabel = document.createElement('div');
  Object.assign(saveLocLabel.style, {
    color: CSS_COLORS.text,
    fontSize: '0.6875rem',
    marginBottom: '6px',
  });
  saveLocLabel.textContent = 'Save Method';
  saveLocRow.appendChild(saveLocLabel);

  const saveLocOptions = document.createElement('div');
  Object.assign(saveLocOptions.style, { display: 'flex', gap: '6px' });

  const saveLocChoices: Array<{ value: 'auto' | 'local' | 'download'; label: string }> = [
    { value: 'auto', label: 'Auto' },
    { value: 'download', label: 'Download' },
    { value: 'local', label: 'Local' },
  ];

  saveLocChoices.forEach(({ value, label }) => {
    const btn = document.createElement('button');
    const isActive = state.options.saveLocation === value;
    const isLocalDisabled = value === 'local' && !state.sweetlinkConnected;

    Object.assign(btn.style, {
      padding: '4px 10px',
      backgroundColor: isActive ? `${accentColor}20` : 'transparent',
      border: `1px solid ${isActive ? accentColor : `${color}40`}`,
      borderRadius: '4px',
      color: isActive ? accentColor : color,
      fontSize: '0.625rem',
      cursor: isLocalDisabled ? 'not-allowed' : 'pointer',
      transition: 'all 150ms',
      opacity: isLocalDisabled ? '0.5' : '1',
    });
    btn.textContent = label;
    if (isLocalDisabled) {
      btn.title = 'Sweetlink not connected';
    }
    btn.onclick = () => {
      if (isLocalDisabled) return;
      state.options.saveLocation = value;
      state.settingsManager.saveSettings({ saveLocation: value });
      state.render();
    };
    saveLocOptions.appendChild(btn);
  });

  saveLocRow.appendChild(saveLocOptions);
  featuresSection.appendChild(saveLocRow);

  popover.appendChild(featuresSection);

  // ========== METRICS SECTION ==========
  const metricsSection = createSettingsSection('Metrics');

  type MetricKey = 'breakpoint' | 'fcp' | 'lcp' | 'cls' | 'inp' | 'pageSize';
  const metricsToggles: Array<{ key: MetricKey; label: string }> = [
    { key: 'breakpoint', label: 'Breakpoint' },
    { key: 'fcp', label: 'FCP' },
    { key: 'lcp', label: 'LCP' },
    { key: 'cls', label: 'CLS' },
    { key: 'inp', label: 'INP' },
    { key: 'pageSize', label: 'Page Size' },
  ];

  metricsToggles.forEach(({ key, label }) => {
    const currentValue = state.options.showMetrics[key] ?? true;
    metricsSection.appendChild(
      createToggleRow(label, currentValue, accentColor, () => {
        state.options.showMetrics[key] = !state.options.showMetrics[key];
        state.settingsManager.saveSettings({
          showMetrics: {
            breakpoint: state.options.showMetrics.breakpoint ?? true,
            fcp: state.options.showMetrics.fcp ?? true,
            lcp: state.options.showMetrics.lcp ?? true,
            cls: state.options.showMetrics.cls ?? true,
            inp: state.options.showMetrics.inp ?? true,
            pageSize: state.options.showMetrics.pageSize ?? true,
          },
        });
        state.render();
      })
    );
  });

  popover.appendChild(metricsSection);

  // ========== RESET SECTION ==========
  const resetSection = document.createElement('div');
  Object.assign(resetSection.style, {
    padding: '10px 14px',
    borderTop: `1px solid ${color}20`,
  });

  const resetBtn = createStyledButton({
    color: CSS_COLORS.textMuted,
    text: 'Reset to Defaults',
    padding: '6px 12px',
    fontSize: '0.625rem',
  });
  Object.assign(resetBtn.style, {
    width: '100%',
    justifyContent: 'center',
  });
  resetBtn.onclick = () => {
    state.settingsManager.resetToDefaults();
    const defaults = DEFAULT_SETTINGS;
    state.applySettings(defaults);
  };
  resetSection.appendChild(resetBtn);
  popover.appendChild(resetSection);

  state.overlayElement = popover;
  document.body.appendChild(popover);
}

// ============================================================================
// Settings UI Helpers
// ============================================================================

function createSettingsSection(title: string, hasBorder = true): HTMLDivElement {
  const color = CSS_COLORS.textSecondary;
  const section = document.createElement('div');
  Object.assign(section.style, {
    padding: '10px 14px',
    borderBottom: hasBorder ? `1px solid ${color}20` : 'none',
  });

  const sectionTitle = document.createElement('div');
  Object.assign(sectionTitle.style, {
    color,
    fontSize: '0.625rem',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginBottom: '8px',
  });
  sectionTitle.textContent = title;
  section.appendChild(sectionTitle);

  return section;
}

function createToggleRow(
  label: string,
  checked: boolean,
  accentColor: string,
  onChange: () => void
): HTMLDivElement {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '6px',
  });

  const labelEl = document.createElement('span');
  Object.assign(labelEl.style, { color: CSS_COLORS.text, fontSize: '0.6875rem' });
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const toggle = document.createElement('button');
  Object.assign(toggle.style, {
    width: '32px',
    height: '18px',
    borderRadius: '9px',
    border: `1px solid ${checked ? accentColor : CSS_COLORS.border}`,
    backgroundColor: checked ? accentColor : CSS_COLORS.bgInput,
    position: 'relative',
    cursor: 'pointer',
    transition: 'all 150ms',
    flexShrink: '0',
    boxSizing: 'border-box',
  });

  const knob = document.createElement('span');
  Object.assign(knob.style, {
    position: 'absolute',
    top: '2px',
    left: checked ? '14px' : '2px',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: checked ? '#fff' : CSS_COLORS.textMuted,
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
    transition: 'left 150ms, background-color 150ms',
  });
  toggle.appendChild(knob);

  toggle.onclick = onChange;
  row.appendChild(toggle);

  return row;
}
