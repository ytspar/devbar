/**
 * Expanded state rendering for the DevBar — helper functions and orchestrator.
 */

import {
  BUTTON_COLORS,
  CSS_COLORS,
  DEVBAR_THEME,
  FONT_MONO,
  TAILWIND_BREAKPOINTS,
  withAlpha,
} from '../../constants.js';
import type { DevBarControl } from '../../types.js';
import { getSweetlinkConnectionTooltip } from '../demoMode.js';
import { getResponsiveMetricVisibility } from '../performance.js';
import {
  addTooltipTitle,
  attachBreakpointTooltip,
  attachClickToggleTooltip,
  attachInfoTooltip,
  attachMetricTooltip,
  attachTextTooltip,
} from '../tooltips.js';
import type { DevBarState, PositionStyle } from '../types.js';
import {
  createA11yButton,
  createAIReviewButton,
  createCompactToggleButton,
  createConsoleBadge,
  createDemoButton,
  createOutlineButton,
  createRecordButton,
  createRulerButton,
  createSchemaButton,
  createScreenshotButton,
  createSettingsButton,
} from './buttons.js';
import {
  captureDotPosition,
  createConnectionIndicator,
  createControlElement,
  TOOLBAR_POSITIONS,
} from './common.js';

/**
 * Compute the CSS position for the expanded devbar wrapper.
 * Uses the captured dot position when available for smooth collapse/expand transitions.
 */
function computeExpandedPosition(
  state: DevBarState,
  position: string,
  isCentered: boolean
): PositionStyle {
  // Dot offset from container edge in expanded mode:
  // border (1px) + padding (12px) + half indicator (6px) = 19px from left
  // border (1px) + padding (8px) + half indicator (6px) = 15px from top
  const DOT_OFFSET_LEFT = 19;
  const DOT_OFFSET_TOP = 15;

  // Use captured dot position to align the expanded bar's dot with where it was
  // Always use top/left positioning for precise alignment
  if (state.lastDotPosition && !isCentered) {
    const isRight = position.endsWith('right');

    let posStyle: PositionStyle;
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
    return posStyle;
  }

  return TOOLBAR_POSITIONS[position] ?? TOOLBAR_POSITIONS['bottom-left']!;
}

/**
 * Style the expanded wrapper container and attach the double-click-to-collapse handler.
 */
function styleExpandedWrapper(
  state: DevBarState,
  wrapper: HTMLElement,
  posStyle: PositionStyle,
  accentColor: string,
  isCentered: boolean
): void {
  state.resetPositionStyles(wrapper);

  const sizeOverrides = state.options.sizeOverrides;

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
    boxShadow: `${DEVBAR_THEME.shadows.dropToolbar}, 0 0 0 1px ${withAlpha(accentColor, 10)}`,
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    boxSizing: 'border-box',
    width: sizeOverrides?.width ?? defaultWidth,
    maxWidth: sizeOverrides?.maxWidth ?? defaultMaxWidth,
    minWidth: sizeOverrides?.minWidth ?? defaultMinWidth,
    cursor: 'default',
  });

  wrapper.ondblclick = (e) => {
    // Ignore double-clicks on interactive elements (buttons, inputs, selects)
    // to prevent rapid settings-button clicks from collapsing the devbar
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, select, a')) return;

    const dotEl = wrapper.querySelector('.devbar-status span span');
    if (dotEl) {
      captureDotPosition(state, dotEl);
    }
    state.collapsed = true;
    state.debug.state('Collapsed DevBar (double-click)');
    state.render();
  };
}

/**
 * Create the main row flex container used in expanded mode.
 */
function createExpandedMainRow(): HTMLDivElement {
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
  return mainRow;
}

/**
 * Create the connection indicator configured to collapse the devbar on click.
 */
function createExpandedConnectionIndicator(state: DevBarState): HTMLSpanElement {
  const connIndicator = createConnectionIndicator(state);
  attachTextTooltip(state, connIndicator, () =>
    getSweetlinkConnectionTooltip(state.sweetlinkConnected, 'click to minimize')
  );
  connIndicator.onclick = (e) => {
    e.stopPropagation();
    captureDotPosition(state, connIndicator);
    state.collapsed = true;
    state.debug.state('Collapsed DevBar (connection dot click)');
    state.render();
  };
  return connIndicator;
}

/**
 * Create the info section containing breakpoint display and performance metrics.
 */
function createInfoSection(
  state: DevBarState,
  showMetrics: DevBarState['options']['showMetrics']
): HTMLDivElement {
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
    appendBreakpointInfo(state, infoSection);
  }

  // Performance stats with responsive visibility
  if (state.perfStats) {
    appendPerformanceMetrics(state, infoSection, showMetrics);
  }

  return infoSection;
}

/**
 * Append the Tailwind breakpoint indicator to the info section.
 */
function appendBreakpointInfo(state: DevBarState, infoSection: HTMLDivElement): void {
  if (!state.breakpointInfo) return;

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

/** Metric config shape used by performance metric rendering. */
type MetricConfig = {
  label: string;
  value: string;
  title: string;
  description: string;
  thresholds?: { good: string; needsWork: string; poor: string };
};

/**
 * Build the metric configuration map from current perf stats.
 */
function buildMetricConfigs(
  perfStats: NonNullable<DevBarState['perfStats']>
): Record<'fcp' | 'lcp' | 'cls' | 'inp' | 'pageSize', MetricConfig> {
  return {
    fcp: {
      label: 'FCP',
      value: perfStats.fcp,
      title: 'First Contentful Paint (FCP)',
      description: 'Time until the first text or image renders on screen.',
      thresholds: { good: '<1.8s', needsWork: '1.8-3s', poor: '>3s' },
    },
    lcp: {
      label: 'LCP',
      value: perfStats.lcp,
      title: 'Largest Contentful Paint (LCP)',
      description: 'Time until the largest visible element renders on screen.',
      thresholds: { good: '<2.5s', needsWork: '2.5-4s', poor: '>4s' },
    },
    cls: {
      label: 'CLS',
      value: perfStats.cls,
      title: 'Cumulative Layout Shift (CLS)',
      description: 'Visual stability score. Higher values mean more unexpected layout shifts.',
      thresholds: { good: '<0.1', needsWork: '0.1-0.25', poor: '>0.25' },
    },
    inp: {
      label: 'INP',
      value: perfStats.inp,
      title: 'Interaction to Next Paint (INP)',
      description: 'Responsiveness to user input. Measures the longest interaction delay.',
      thresholds: { good: '<200ms', needsWork: '200-500ms', poor: '>500ms' },
    },
    pageSize: {
      label: '',
      value: perfStats.totalSize,
      title: 'Total Page Size',
      description:
        'Compressed/transferred size including HTML, CSS, JS, images, and other resources.',
    },
  };
}

/**
 * Append performance metric spans (visible metrics + hidden-metrics ellipsis) to the info section.
 */
function appendPerformanceMetrics(
  state: DevBarState,
  infoSection: HTMLDivElement,
  showMetrics: DevBarState['options']['showMetrics']
): void {
  if (!state.perfStats) return;

  const { visible, hidden } = getResponsiveMetricVisibility(state);
  const metricConfigs = buildMetricConfigs(state.perfStats);

  const addSeparator = () => {
    const sep = document.createElement('span');
    sep.style.opacity = '0.4';
    sep.textContent = '|';
    infoSection.appendChild(sep);
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
    appendHiddenMetricsEllipsis(state, infoSection, hiddenMetricsEnabled, metricConfigs);
  }
}

/**
 * Append the ellipsis button that reveals hidden metrics in a click-toggle tooltip.
 */
function appendHiddenMetricsEllipsis(
  state: DevBarState,
  infoSection: HTMLDivElement,
  hiddenMetricsEnabled: Array<'fcp' | 'lcp' | 'cls' | 'inp' | 'pageSize'>,
  metricConfigs: Record<'fcp' | 'lcp' | 'cls' | 'inp' | 'pageSize', MetricConfig>
): void {
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
      labelSpan.textContent = config.title.split('(')[0]!.trim();

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

/**
 * Create the status row containing the connection indicator, info section, and console badges.
 */
function createStatusRow(
  state: DevBarState,
  showMetrics: DevBarState['options']['showMetrics'],
  showConsoleBadges: boolean,
  errorCount: number,
  warningCount: number,
  infoCount: number
): HTMLDivElement {
  const connIndicator = createExpandedConnectionIndicator(state);

  const statusRow = document.createElement('div');
  statusRow.className = 'devbar-status';
  Object.assign(statusRow.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'nowrap',
    flexShrink: '1',
    minWidth: '0',
  });
  statusRow.appendChild(connIndicator);

  const infoSection = createInfoSection(state, showMetrics);
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

  return statusRow;
}

/**
 * Create the action buttons container (screenshot, AI review, outline, schema, a11y, settings, compact).
 */
function createActionButtonsContainer(
  state: DevBarState,
  showScreenshot: boolean,
  accentColor: string
): HTMLDivElement {
  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'devbar-actions';
  if (showScreenshot) {
    actionsContainer.appendChild(createScreenshotButton(state, accentColor));
  }
  actionsContainer.appendChild(createAIReviewButton(state));
  actionsContainer.appendChild(createOutlineButton(state));
  actionsContainer.appendChild(createSchemaButton(state));
  actionsContainer.appendChild(createA11yButton(state));
  actionsContainer.appendChild(createRulerButton(state));
  actionsContainer.appendChild(createRecordButton(state));
  actionsContainer.appendChild(createDemoButton(state));
  actionsContainer.appendChild(createSettingsButton(state));
  actionsContainer.appendChild(createCompactToggleButton(state));
  return actionsContainer;
}

function createCustomControlsStrip(
  className: string,
  customControls: DevBarControl[],
  accentColor: string,
  state: DevBarState
): HTMLDivElement | null {
  if (customControls.length === 0) return null;

  const customRow = document.createElement('div');
  customRow.className = className;
  Object.assign(customRow.style, {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    alignContent: 'flex-start',
    justifyContent: 'flex-start',
    gap: '0.5rem',
    padding: '0 0.75rem 0.5rem 0.75rem',
    borderTop: `1px solid ${withAlpha(accentColor, 19)}`,
    marginTop: '0',
    paddingTop: '0.5rem',
    width: '100%',
    maxWidth: '100%',
    minWidth: '0',
    overflow: 'visible',
    boxSizing: 'border-box',
    fontFamily: FONT_MONO,
    fontSize: '0.6875rem',
  });

  for (const control of customControls) {
    customRow.appendChild(createControlElement(control, accentColor, state));
  }

  return customRow;
}

/**
 * Create the inline custom controls group used for compact badges such as
 * release metadata. Controls with a `group` still render in the secondary row.
 */
function createInlineCustomControls(
  customControls: DevBarControl[],
  accentColor: string,
  state: DevBarState
): HTMLDivElement | null {
  const inlineControls = customControls.filter((control) => !control.group);
  const inlineRow = createCustomControlsStrip(
    'devbar-custom-controls devbar-custom-controls-inline',
    inlineControls,
    accentColor,
    state
  );

  if (!inlineRow) return null;

  Object.assign(inlineRow.style, {
    padding: '0',
    borderTop: '0',
    width: 'auto',
    flex: '0 1 auto',
    overflow: 'hidden',
  });

  return inlineRow;
}

/**
 * Create the custom controls row for grouped user-defined controls.
 * Controls with a `group` field are rendered under a group header label.
 * Controls without `onClick` render as non-interactive badges (span, no hover).
 * Returns null if there are no grouped controls.
 */
function createCustomControlsRow(
  customControls: DevBarControl[],
  accentColor: string,
  state: DevBarState
): HTMLDivElement | null {
  const groupedControls = customControls.filter((control) => control.group);
  if (groupedControls.length === 0) return null;

  const customRow = document.createElement('div');
  customRow.className = 'devbar-custom-controls devbar-custom-controls-row';
  Object.assign(customRow.style, {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    alignContent: 'flex-start',
    justifyContent: 'flex-start',
    gap: '0.5rem',
    padding: '0 0.75rem 0.5rem 0.75rem',
    borderTop: `1px solid ${withAlpha(accentColor, 19)}`,
    marginTop: '0',
    paddingTop: '0.5rem',
    width: '100%',
    maxWidth: '100%',
    minWidth: '0',
    overflow: 'visible',
    boxSizing: 'border-box',
    fontFamily: FONT_MONO,
    fontSize: '0.6875rem',
  });

  // Partition controls into ungrouped and grouped
  const groups = new Map<string, typeof customControls>();
  for (const control of groupedControls) {
    if (!control.group) continue;
    const list = groups.get(control.group) ?? [];
    list.push(control);
    groups.set(control.group, list);
  }

  // Render each group with a small header label
  for (const [groupName, controls] of groups) {
    const groupLabel = document.createElement('span');
    groupLabel.className = 'devbar-custom-group-label';
    Object.assign(groupLabel.style, {
      color: withAlpha(accentColor, 50),
      fontSize: '0.5625rem',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      flex: '0 1 auto',
      minWidth: '0',
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      marginLeft: [...groups.keys()].indexOf(groupName) > 0 ? '0.25rem' : '0',
    });
    groupLabel.textContent = groupName;
    customRow.appendChild(groupLabel);

    for (const control of controls) {
      customRow.appendChild(createControlElement(control, accentColor, state));
    }
  }

  return customRow;
}

// ============================================================================
// Expanded State -- Orchestrator
// ============================================================================

export function renderExpanded(state: DevBarState, customControls: DevBarControl[]): void {
  if (!state.container) return;

  const { position, accentColor, showMetrics, showScreenshot, showConsoleBadges } = state.options;
  const { errorCount, warningCount, infoCount } = state.getLogCounts();

  const isCentered = position === 'bottom-center';
  const wrapper = state.container;
  if (customControls.length > 0) {
    wrapper.dataset.devbarCustomControls = 'true';
  } else {
    delete wrapper.dataset.devbarCustomControls;
  }

  // 1. Position and style the wrapper
  const posStyle = computeExpandedPosition(state, position, isCentered);
  styleExpandedWrapper(state, wrapper, posStyle, accentColor, isCentered);

  // 2. Build the main row
  const mainRow = createExpandedMainRow();

  // 3. Status row (connection dot + info metrics + console badges)
  const statusRow = createStatusRow(
    state,
    showMetrics,
    showConsoleBadges,
    errorCount,
    warningCount,
    infoCount
  );
  mainRow.appendChild(statusRow);

  // 4. Inline custom controls (release metadata, version badges, etc.)
  const inlineControls = createInlineCustomControls(customControls, accentColor, state);
  if (inlineControls) {
    mainRow.appendChild(inlineControls);
  }

  // 5. Action buttons
  const actionsContainer = createActionButtonsContainer(state, showScreenshot, accentColor);
  mainRow.appendChild(actionsContainer);

  wrapper.appendChild(mainRow);

  // 6. Grouped custom controls row (if any)
  const customRow = createCustomControlsRow(customControls, accentColor, state);
  if (customRow) {
    wrapper.appendChild(customRow);
  }
}
