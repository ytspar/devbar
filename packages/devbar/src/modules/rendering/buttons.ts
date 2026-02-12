/**
 * Button creator functions used by both compact and expanded modes.
 */

import { BUTTON_COLORS, CSS_COLORS, FONT_MONO, withAlpha } from '../../constants.js';
import { resolveSaveLocation } from '../../settings.js';
import { createSvgIcon, getButtonStyles } from '../../ui/index.js';
import { preloadAxe } from '../../accessibility.js';
import {
  copyPathToClipboard,
  handleA11yAudit,
  handleDocumentOutline,
  handlePageSchema,
  showDesignReviewConfirmation,
} from '../screenshot.js';
import {
  attachButtonTooltip,
  attachTextTooltip,
} from '../tooltips.js';
import { closeAllModals, type DevBarState } from '../types.js';

export function createConsoleBadge(
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
    backgroundColor: isActive ? color : withAlpha(color, 90),
    color: '#fff',
    fontSize: '0.625rem',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: isActive ? `0 0 8px ${withAlpha(color, 80)}` : 'none',
  });
  badge.textContent = count > 99 ? '99+' : String(count);
  attachTextTooltip(
    state,
    badge,
    () => `${count} console ${label}${count === 1 ? '' : 's'} (click to view)`
  );
  badge.onclick = () => {
    const newFilter = state.consoleFilter === type ? null : type;
    closeAllModals(state);
    state.consoleFilter = newFilter;
    state.render();
  };

  return badge;
}

export function createScreenshotButton(state: DevBarState, accentColor: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Screenshot');

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
    borderColor: hasSuccessState ? accentColor : withAlpha(accentColor, 50),
    backgroundColor: hasSuccessState ? withAlpha(accentColor, 20) : 'transparent',
    color: hasSuccessState ? accentColor : withAlpha(accentColor, 60),
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
    btn.appendChild(
      createSvgIcon(
        'M19.844 7.938H7.938v11.905m0 11.113v11.906h11.905m23.019-11.906v11.906H30.956m11.906-23.018V7.938H30.956',
        {
          viewBox: '0 0 50.8 50.8',
          stroke: true,
          strokeWidth: '4',
          children: [{ type: 'circle', cx: '25.4', cy: '25.4', r: '8.731' }],
        }
      )
    );
  }

  return btn;
}

export function createAIReviewButton(state: DevBarState): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'AI Design Review');

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

export function createOutlineButton(state: DevBarState): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Document Outline');

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

export function createSchemaButton(state: DevBarState): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Page Schema');

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

export function createA11yButton(state: DevBarState): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Accessibility Audit');

  const isActive = state.showA11yModal || !!state.lastA11yAudit;

  attachButtonTooltip(state, btn, BUTTON_COLORS.a11y, (_tooltip, h) => {
    if (state.lastA11yAudit) {
      const isDownloaded = state.lastA11yAudit.endsWith('downloaded');
      h.addSuccess(isDownloaded ? 'A11y report downloaded!' : 'A11y report saved!', isDownloaded ? undefined : state.lastA11yAudit);
      return;
    }

    h.addTitle('Accessibility Audit');
    h.addDescription('Run axe-core audit to check WCAG compliance.');

    if (state.options.saveLocation === 'local' && !state.sweetlinkConnected) {
      h.addWarning('Sweetlink not connected. Switch save method to Auto or Download.');
    }
  });

  // Preload axe-core on hover
  btn.addEventListener('mouseenter', () => preloadAxe(), { once: true });

  Object.assign(btn.style, getButtonStyles(BUTTON_COLORS.a11y, isActive, false));
  btn.onclick = () => handleA11yAudit(state);

  if (state.lastA11yAudit) {
    btn.textContent = 'v';
    btn.style.fontSize = '0.5rem';
  } else {
    // Accessibility/shield icon
    btn.appendChild(
      createSvgIcon(
        'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
        { fill: true }
      )
    );
  }

  return btn;
}

/**
 * Create the settings gear button.
 */
export function createSettingsButton(state: DevBarState): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('data-testid', 'devbar-settings-button');
  btn.setAttribute('aria-label', 'Settings');

  // Attach HTML tooltip
  attachButtonTooltip(state, btn, CSS_COLORS.textSecondary, (_tooltip, h) => {
    h.addTitle('Settings');
    h.addSectionHeader('Keyboard');
    h.addShortcut('Cmd or Ctrl+Shift+M', 'Toggle compact mode');
  });

  const isActive = state.showSettingsPopover;
  const color = CSS_COLORS.textSecondary;

  Object.assign(btn.style, getButtonStyles(color, isActive, false));

  btn.onclick = () => {
    const wasOpen = state.showSettingsPopover;
    closeAllModals(state);
    state.showSettingsPopover = !wasOpen;
    state.render();
  };

  // Gear icon SVG
  btn.appendChild(
    createSvgIcon(
      'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
      { stroke: true, children: [{ type: 'circle', cx: '12', cy: '12', r: '3' }] }
    )
  );
  return btn;
}

/**
 * Create the compact mode toggle button with chevron icon.
 */
export function createCompactToggleButton(state: DevBarState): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', state.compactMode ? 'Switch to expanded mode' : 'Switch to compact mode');

  const isCompact = state.compactMode;
  const { accentColor } = state.options;
  const iconColor = CSS_COLORS.textSecondary;

  Object.assign(btn.style, getButtonStyles(iconColor, false, false));
  btn.style.borderColor = withAlpha(accentColor, 38);

  attachTextTooltip(
    state,
    btn,
    () => (isCompact ? 'Expand (Cmd or Ctrl+Shift+M)' : 'Compact (Cmd or Ctrl+Shift+M)'),
    {
      onEnter: () => {
        btn.style.borderColor = accentColor;
        btn.style.backgroundColor = withAlpha(accentColor, 13);
        btn.style.color = iconColor;
      },
      onLeave: () => {
        btn.style.borderColor = withAlpha(accentColor, 38);
        btn.style.backgroundColor = 'transparent';
        btn.style.color = withAlpha(iconColor, 60);
      },
    }
  );

  btn.onclick = () => {
    state.toggleCompactMode();
  };

  // Chevron icon SVG - points right when expanded, left when compact
  const chevronPoints = isCompact ? '9 18 15 12 9 6' : '15 18 9 12 15 6';
  btn.appendChild(
    createSvgIcon('', { stroke: true, children: [{ type: 'polyline', points: chevronPoints }] })
  );
  return btn;
}
