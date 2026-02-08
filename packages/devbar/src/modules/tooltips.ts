/**
 * Tooltip creation, positioning, and management helpers.
 *
 * Unified tooltip system: text tooltips, HTML tooltips with rich content builders,
 * click-to-toggle tooltips for mobile, and composable hover behavior via TooltipHoverOptions.
 */

import { CSS_COLORS, FONT_MONO } from '../constants.js';
import type { DevBarState } from './types.js';

/** Base styles for tooltip containers */
const TOOLTIP_BASE_STYLES = {
  position: 'fixed',
  zIndex: '10004',
  backgroundColor: 'var(--devbar-color-bg-elevated)',
  border: `1px solid ${CSS_COLORS.border}`,
  borderRadius: '6px',
  padding: '10px 12px',
  fontSize: '0.6875rem',
  fontFamily: FONT_MONO,
  maxWidth: '280px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
  pointerEvents: 'auto',
} as const;

/** Create a tooltip container element and track it for cleanup */
export function createTooltipContainer(state: DevBarState): HTMLDivElement {
  const tooltip = document.createElement('div');
  tooltip.setAttribute('data-devbar', 'true');
  tooltip.setAttribute('data-devbar-tooltip', 'true');
  Object.assign(tooltip.style, TOOLTIP_BASE_STYLES);
  state.activeTooltips.add(tooltip);
  return tooltip;
}

/** Remove a tooltip and untrack it */
export function removeTooltip(state: DevBarState, tooltip: HTMLDivElement): void {
  tooltip.remove();
  state.activeTooltips.delete(tooltip);
}

/** Clear all active tooltips (called on re-render) */
export function clearAllTooltips(state: DevBarState): void {
  for (const tooltip of state.activeTooltips) {
    tooltip.remove();
  }
  state.activeTooltips.clear();
}

/** Add a bold title to tooltip (metric name, feature name, etc.) */
export function addTooltipTitle(state: DevBarState, container: HTMLElement, title: string): void {
  const titleEl = document.createElement('div');
  const accentColor = state.settingsManager.get('accentColor') || CSS_COLORS.primary;
  Object.assign(titleEl.style, {
    color: accentColor,
    fontWeight: '600',
    marginBottom: '4px',
  });
  titleEl.textContent = title;
  container.appendChild(titleEl);
}

/** Add a description paragraph to tooltip */
export function addTooltipDescription(container: HTMLElement, description: string): void {
  const descEl = document.createElement('div');
  Object.assign(descEl.style, {
    color: CSS_COLORS.text,
    marginBottom: '10px',
    lineHeight: '1.4',
  });
  descEl.textContent = description;
  container.appendChild(descEl);
}

/** Add a muted uppercase section header to tooltip */
export function addTooltipSectionHeader(container: HTMLElement, header: string): void {
  const headerEl = document.createElement('div');
  Object.assign(headerEl.style, {
    color: CSS_COLORS.textMuted,
    fontSize: '0.625rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '6px',
  });
  headerEl.textContent = header;
  container.appendChild(headerEl);
}

/** Add a colored row with dot + label + value (for thresholds) */
export function addTooltipColoredRow(
  container: HTMLElement,
  label: string,
  value: string,
  color: string,
  labelWidth = '70px'
): void {
  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '8px' });

  const dot = document.createElement('span');
  Object.assign(dot.style, {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: color,
    flexShrink: '0',
  });
  row.appendChild(dot);

  const labelSpan = document.createElement('span');
  Object.assign(labelSpan.style, {
    color,
    fontWeight: '500',
    minWidth: labelWidth,
  });
  labelSpan.textContent = label;
  row.appendChild(labelSpan);

  const valueSpan = document.createElement('span');
  Object.assign(valueSpan.style, { color: CSS_COLORS.textMuted });
  valueSpan.textContent = value;
  row.appendChild(valueSpan);

  container.appendChild(row);
}

/** Add an info row with label + value (for breakpoint details) */
export function addTooltipInfoRow(container: HTMLElement, label: string, value: string): void {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex',
    gap: '8px',
    lineHeight: '1.4',
  });

  const labelSpan = document.createElement('span');
  Object.assign(labelSpan.style, { color: CSS_COLORS.textMuted });
  labelSpan.textContent = label;
  row.appendChild(labelSpan);

  const valueSpan = document.createElement('span');
  Object.assign(valueSpan.style, { color: CSS_COLORS.text });
  valueSpan.textContent = value;
  row.appendChild(valueSpan);

  container.appendChild(row);
}

/** Position tooltip above the anchor element, adjusting for screen edges */
export function positionTooltip(tooltip: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const anchorCenterX = rect.left + rect.width / 2;
  const isRightSide = anchorCenterX > window.innerWidth / 2;

  tooltip.style.bottom = `${window.innerHeight - rect.top + 8}px`;

  document.body.appendChild(tooltip);

  const tooltipRect = tooltip.getBoundingClientRect();

  if (isRightSide) {
    // Right-align tooltip with anchor (tooltip extends leftward)
    const rightAlignedLeft = rect.right - tooltipRect.width;
    tooltip.style.left = `${Math.max(10, rightAlignedLeft)}px`;
  } else {
    // Left-align tooltip with anchor (tooltip extends rightward)
    tooltip.style.left = `${rect.left}px`;

    // Adjust if off-screen right
    const newTooltipRect = tooltip.getBoundingClientRect();
    if (newTooltipRect.right > window.innerWidth - 10) {
      tooltip.style.left = `${window.innerWidth - tooltipRect.width - 10}px`;
    }
  }

  // Final check: ensure not off-screen left
  const finalRect = tooltip.getBoundingClientRect();
  if (finalRect.left < 10) {
    tooltip.style.left = '10px';
  }
}

/** Options for composing additional hover behavior with tooltips */
export type TooltipHoverOptions = {
  onEnter?: () => void;
  onLeave?: () => void;
};

/** Attach a plain-text tooltip to an element (evaluated at hover time) */
export function attachTextTooltip(
  state: DevBarState,
  element: HTMLElement,
  getText: () => string,
  hoverOptions?: TooltipHoverOptions
): void {
  attachHtmlTooltip(state, element, (tooltip) => {
    const text = getText();
    const lines = text.split('\n');
    for (const line of lines) {
      const div = document.createElement('div');
      Object.assign(div.style, {
        color: CSS_COLORS.primary,
        lineHeight: '1.4',
      });
      div.textContent = line;
      tooltip.appendChild(div);
    }
  }, hoverOptions);
}

/** Attach an HTML tooltip to an element with custom content builder */
export function attachHtmlTooltip(
  state: DevBarState,
  element: HTMLElement,
  buildContent: (tooltip: HTMLDivElement) => void,
  hoverOptions?: TooltipHoverOptions
): void {
  if (!state.options.showTooltips) return;

  let tooltipEl: HTMLDivElement | null = null;
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  const cancelHide = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  };

  const scheduleHide = () => {
    cancelHide();
    hideTimeout = setTimeout(() => {
      if (tooltipEl) {
        removeTooltip(state, tooltipEl);
        tooltipEl = null;
      }
    }, 100);
  };

  element.onmouseenter = () => {
    cancelHide();
    // Clear any existing tooltip for this element first
    if (tooltipEl) {
      removeTooltip(state, tooltipEl);
      tooltipEl = null;
    }
    tooltipEl = createTooltipContainer(state);
    // Keep tooltip open when mouse enters it
    tooltipEl.onmouseenter = cancelHide;
    tooltipEl.onmouseleave = scheduleHide;
    buildContent(tooltipEl);
    positionTooltip(tooltipEl, element);
    hoverOptions?.onEnter?.();
  };

  element.onmouseleave = () => {
    scheduleHide();
    hoverOptions?.onLeave?.();
  };

  // Also clean up tooltip on click (in case element triggers re-render)
  const originalOnclick = element.onclick;
  element.onclick = (e) => {
    cancelHide();
    if (tooltipEl) {
      removeTooltip(state, tooltipEl);
      tooltipEl = null;
    }
    if (originalOnclick) {
      originalOnclick.call(element, e);
    }
  };
}

/**
 * Attach an HTML tooltip with click-to-toggle support for mobile.
 * - Click toggles tooltip open/closed (pinned state)
 * - Hover opens tooltip on mouseenter (if not pinned)
 * - Hover closes tooltip on mouseleave (if not pinned)
 */
export function attachClickToggleTooltip(
  state: DevBarState,
  element: HTMLElement,
  buildContent: (tooltip: HTMLDivElement) => void
): void {
  if (!state.options.showTooltips) return;

  let tooltipEl: HTMLDivElement | null = null;
  let isPinned = false;

  // Store original opacity to restore on deactivate
  const originalOpacity = element.style.opacity || '0.7';

  const setActiveState = (active: boolean) => {
    element.style.opacity = active ? '1' : originalOpacity;
  };

  const showTooltip = () => {
    if (tooltipEl) {
      removeTooltip(state, tooltipEl);
    }
    tooltipEl = createTooltipContainer(state);
    buildContent(tooltipEl);
    positionTooltip(tooltipEl, element);
  };

  const hideTooltip = () => {
    if (tooltipEl) {
      removeTooltip(state, tooltipEl);
      tooltipEl = null;
    }
  };

  // Click toggles pinned state
  element.onclick = (e) => {
    e.stopPropagation();
    if (isPinned) {
      // Unpin and hide
      isPinned = false;
      setActiveState(false);
      hideTooltip();
    } else {
      // Pin and show
      isPinned = true;
      setActiveState(true);
      showTooltip();
    }
  };

  // Hover shows tooltip (if not pinned)
  element.onmouseenter = () => {
    if (!isPinned) {
      setActiveState(true);
      showTooltip();
    }
  };

  // Hover hides tooltip (if not pinned)
  element.onmouseleave = () => {
    if (!isPinned) {
      setActiveState(false);
      hideTooltip();
    }
  };

  // Close pinned tooltip when clicking outside
  const handleDocumentClick = (e: MouseEvent) => {
    if (
      isPinned &&
      tooltipEl &&
      !element.contains(e.target as Node) &&
      !tooltipEl.contains(e.target as Node)
    ) {
      isPinned = false;
      setActiveState(false);
      hideTooltip();
    }
  };

  // Add document click listener
  document.addEventListener('click', handleDocumentClick);

  // Store cleanup function on element for later removal
  (element as HTMLElement & { _tooltipCleanup?: () => void })._tooltipCleanup = () => {
    document.removeEventListener('click', handleDocumentClick);
    hideTooltip();
  };
}

/** Add a keyboard shortcut row to tooltip */
export function addTooltipShortcut(
  container: HTMLElement,
  key: string,
  description: string
): void {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex',
    gap: '8px',
    alignItems: 'baseline',
  });

  const keySpan = document.createElement('span');
  Object.assign(keySpan.style, {
    color: CSS_COLORS.textMuted,
    fontSize: '0.625rem',
    minWidth: '90px',
  });
  keySpan.textContent = key;
  row.appendChild(keySpan);

  const descSpan = document.createElement('span');
  Object.assign(descSpan.style, { color: CSS_COLORS.text });
  descSpan.textContent = description;
  row.appendChild(descSpan);

  container.appendChild(row);
}

/** Add a warning message to tooltip */
export function addTooltipWarning(container: HTMLElement, text: string): void {
  const warning = document.createElement('div');
  Object.assign(warning.style, {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    marginTop: '8px',
    padding: '6px 8px',
    backgroundColor: `${CSS_COLORS.warning}15`,
    border: `1px solid ${CSS_COLORS.warning}30`,
    borderRadius: '4px',
    fontSize: '0.625rem',
  });

  const icon = document.createElement('span');
  icon.textContent = '\u26A0';
  Object.assign(icon.style, { color: CSS_COLORS.warning, flexShrink: '0' });
  warning.appendChild(icon);

  const textSpan = document.createElement('span');
  Object.assign(textSpan.style, { color: CSS_COLORS.warning });
  textSpan.textContent = text;
  warning.appendChild(textSpan);

  container.appendChild(warning);
}

/** Add a success status message to tooltip */
export function addTooltipSuccess(
  container: HTMLElement,
  text: string,
  subtext?: string
): void {
  const status = document.createElement('div');
  Object.assign(status.style, {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    padding: '6px 8px',
    backgroundColor: `${CSS_COLORS.primary}15`,
    border: `1px solid ${CSS_COLORS.primary}30`,
    borderRadius: '4px',
  });

  const icon = document.createElement('span');
  icon.textContent = '\u2713';
  Object.assign(icon.style, { color: CSS_COLORS.primary, fontWeight: '600', flexShrink: '0' });
  status.appendChild(icon);

  const textContainer = document.createElement('div');
  const mainText = document.createElement('div');
  Object.assign(mainText.style, { color: CSS_COLORS.primary, fontWeight: '500' });
  mainText.textContent = text;
  textContainer.appendChild(mainText);

  if (subtext) {
    const sub = document.createElement('div');
    Object.assign(sub.style, {
      color: CSS_COLORS.textMuted,
      fontSize: '0.625rem',
      marginTop: '2px',
      wordBreak: 'break-all',
    });
    sub.textContent = subtext;
    textContainer.appendChild(sub);
  }

  status.appendChild(textContainer);
  container.appendChild(status);
}

/** Add an error status message to tooltip */
export function addTooltipError(
  container: HTMLElement,
  title: string,
  message: string
): void {
  const status = document.createElement('div');
  Object.assign(status.style, {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    padding: '6px 8px',
    backgroundColor: `${CSS_COLORS.error}15`,
    border: `1px solid ${CSS_COLORS.error}30`,
    borderRadius: '4px',
  });

  const icon = document.createElement('span');
  icon.textContent = '\u00D7';
  Object.assign(icon.style, {
    color: CSS_COLORS.error,
    fontWeight: '600',
    flexShrink: '0',
    fontSize: '0.875rem',
  });
  status.appendChild(icon);

  const textContainer = document.createElement('div');
  const titleEl = document.createElement('div');
  Object.assign(titleEl.style, { color: CSS_COLORS.error, fontWeight: '500' });
  titleEl.textContent = title;
  textContainer.appendChild(titleEl);

  const msgEl = document.createElement('div');
  Object.assign(msgEl.style, {
    color: CSS_COLORS.textMuted,
    fontSize: '0.625rem',
    marginTop: '2px',
  });
  msgEl.textContent = message;
  textContainer.appendChild(msgEl);

  status.appendChild(textContainer);
  container.appendChild(status);
}

/** Add a "in progress" status to tooltip */
export function addTooltipProgress(container: HTMLElement, text: string): void {
  const status = document.createElement('div');
  Object.assign(status.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 8px',
    backgroundColor: `${CSS_COLORS.info}15`,
    border: `1px solid ${CSS_COLORS.info}30`,
    borderRadius: '4px',
  });

  const spinner = document.createElement('span');
  spinner.textContent = '~';
  Object.assign(spinner.style, {
    color: CSS_COLORS.info,
    fontWeight: '600',
    animation: 'pulse 1s infinite',
  });
  status.appendChild(spinner);

  const textSpan = document.createElement('span');
  Object.assign(textSpan.style, { color: CSS_COLORS.info });
  textSpan.textContent = text;
  status.appendChild(textSpan);

  container.appendChild(status);
}

/** Attach a button tooltip with custom title color */
export function attachButtonTooltip(
  state: DevBarState,
  element: HTMLElement,
  titleColor: string,
  buildContent: (
    tooltip: HTMLDivElement,
    helpers: {
      addTitle: (title: string) => void;
      addDescription: (desc: string) => void;
      addSectionHeader: (header: string) => void;
      addShortcut: (key: string, desc: string) => void;
      addWarning: (text: string) => void;
      addSuccess: (text: string, subtext?: string) => void;
      addError: (title: string, message: string) => void;
      addProgress: (text: string) => void;
    }
  ) => void
): void {
  attachHtmlTooltip(state, element, (tooltip) => {
    const helpers = {
      addTitle: (title: string) => {
        const titleEl = document.createElement('div');
        Object.assign(titleEl.style, {
          color: titleColor,
          fontWeight: '600',
          marginBottom: '4px',
        });
        titleEl.textContent = title;
        tooltip.appendChild(titleEl);
      },
      addDescription: (desc: string) => addTooltipDescription(tooltip, desc),
      addSectionHeader: (header: string) => addTooltipSectionHeader(tooltip, header),
      addShortcut: (key: string, desc: string) => addTooltipShortcut(tooltip, key, desc),
      addWarning: (text: string) => addTooltipWarning(tooltip, text),
      addSuccess: (text: string, subtext?: string) => addTooltipSuccess(tooltip, text, subtext),
      addError: (title: string, message: string) => addTooltipError(tooltip, title, message),
      addProgress: (text: string) => addTooltipProgress(tooltip, text),
    };
    buildContent(tooltip, helpers);
  });
}

/** Attach a metric tooltip with title, description, and colored thresholds */
export function attachMetricTooltip(
  state: DevBarState,
  element: HTMLElement,
  title: string,
  description: string,
  thresholds: { good: string; needsWork: string; poor: string }
): void {
  attachHtmlTooltip(state, element, (tooltip) => {
    addTooltipTitle(state, tooltip, title);
    addTooltipDescription(tooltip, description);
    addTooltipSectionHeader(tooltip, 'Thresholds');

    const thresholdsContainer = document.createElement('div');
    Object.assign(thresholdsContainer.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    });

    addTooltipColoredRow(thresholdsContainer, 'Good', thresholds.good, CSS_COLORS.primary);
    addTooltipColoredRow(
      thresholdsContainer,
      'Needs work',
      thresholds.needsWork,
      CSS_COLORS.warning
    );
    addTooltipColoredRow(thresholdsContainer, 'Poor', thresholds.poor, CSS_COLORS.error);

    tooltip.appendChild(thresholdsContainer);
  });
}

/** Attach a breakpoint tooltip showing current breakpoint and all breakpoint ranges */
export function attachBreakpointTooltip(
  state: DevBarState,
  element: HTMLElement,
  breakpoint: string,
  dimensions: string,
  breakpointLabel: string
): void {
  attachHtmlTooltip(state, element, (tooltip) => {
    addTooltipTitle(state, tooltip, 'Tailwind Breakpoint');

    // Current breakpoint info
    const currentSection = document.createElement('div');
    Object.assign(currentSection.style, { marginBottom: '10px' });
    addTooltipInfoRow(currentSection, 'Current:', `${breakpoint} (${breakpointLabel})`);
    addTooltipInfoRow(currentSection, 'Viewport:', dimensions);
    tooltip.appendChild(currentSection);

    // Breakpoints reference
    addTooltipSectionHeader(tooltip, 'Breakpoints');

    const bpContainer = document.createElement('div');
    Object.assign(bpContainer.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      fontSize: '0.625rem',
    });

    const breakpoints = [
      { name: 'base', range: '<640px' },
      { name: 'sm', range: '\u2265640px' },
      { name: 'md', range: '\u2265768px' },
      { name: 'lg', range: '\u22651024px' },
      { name: 'xl', range: '\u22651280px' },
      { name: '2xl', range: '\u22651536px' },
    ];

    for (const bp of breakpoints) {
      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', gap: '8px' });

      const nameSpan = document.createElement('span');
      Object.assign(nameSpan.style, {
        color: bp.name === breakpoint ? CSS_COLORS.primary : CSS_COLORS.textMuted,
        fontWeight: bp.name === breakpoint ? '600' : '400',
        minWidth: '32px',
      });
      nameSpan.textContent = bp.name;
      row.appendChild(nameSpan);

      const rangeSpan = document.createElement('span');
      Object.assign(rangeSpan.style, {
        color: bp.name === breakpoint ? CSS_COLORS.text : CSS_COLORS.textMuted,
      });
      rangeSpan.textContent = bp.range;
      row.appendChild(rangeSpan);

      bpContainer.appendChild(row);
    }

    tooltip.appendChild(bpContainer);
  });
}

/** Attach a simple info tooltip with title and description */
export function attachInfoTooltip(
  state: DevBarState,
  element: HTMLElement,
  title: string,
  description: string
): void {
  attachHtmlTooltip(state, element, (tooltip) => {
    addTooltipTitle(state, tooltip, title);

    const descEl = document.createElement('div');
    Object.assign(descEl.style, {
      color: CSS_COLORS.text,
      lineHeight: '1.4',
    });
    descEl.textContent = description;
    tooltip.appendChild(descEl);
  });
}
