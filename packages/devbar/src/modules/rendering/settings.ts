/**
 * Settings popover rendering for the DevBar.
 */

import { CSS_COLORS, FONT_MONO, withAlpha } from '../../constants.js';
import { ACCENT_COLOR_PRESETS, DEFAULT_SETTINGS } from '../../settings.js';
import type { ThemeMode } from '../../types.js';
import { createCloseButton, createStyledButton } from '../../ui/index.js';
import { setThemeMode } from '../theme.js';
import type { DevBarState } from '../types.js';

export function renderSettingsPopover(state: DevBarState): void {
  const { position, accentColor } = state.options;

  // Transparent overlay for click-outside-to-close (consistent with other modals)
  const overlay = document.createElement('div');
  overlay.setAttribute('data-devbar', 'true');
  overlay.setAttribute('data-devbar-overlay', 'true');
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    zIndex: '10003',
  });
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      state.showSettingsPopover = false;
      state.render();
    }
  };

  const popover = document.createElement('div');
  popover.setAttribute('data-devbar', 'true');

  // Position: centered over the devbar on desktop, centered on screen on mobile
  const isTop = position.startsWith('top');
  const popoverWidth = 480;
  const edgePad = 16;

  let leftPx: number;
  if (state.container && window.innerWidth > 640) {
    const barRect = state.container.getBoundingClientRect();
    const barCenter = barRect.left + barRect.width / 2;
    leftPx = Math.max(edgePad, Math.min(barCenter - popoverWidth / 2, window.innerWidth - popoverWidth - edgePad));
  } else {
    leftPx = Math.max(edgePad, (window.innerWidth - popoverWidth) / 2);
  }

  Object.assign(popover.style, {
    position: 'fixed',
    [isTop ? 'top' : 'bottom']: '70px',
    left: `${leftPx}px`,
    zIndex: '10003',
    backgroundColor: 'var(--devbar-color-bg-elevated)',
    border: `1px solid ${accentColor}`,
    borderRadius: '8px',
    boxShadow: `0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px ${withAlpha(accentColor, 20)}`,
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    width: `${popoverWidth}px`,
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: 'calc(100vh - 100px)',
    overflowY: 'auto',
    fontFamily: FONT_MONO,
  });

  popover.appendChild(createSettingsHeader(state));

  // Two-column grid for settings sections (collapses to 1 column on mobile via CSS)
  const grid = document.createElement('div');
  grid.className = 'devbar-settings-grid';
  Object.assign(grid.style, {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
  });

  // Left column: Theme + Display
  const color = CSS_COLORS.textSecondary;
  const leftCol = document.createElement('div');
  Object.assign(leftCol.style, { borderRight: `1px solid ${withAlpha(color, 13)}` });
  leftCol.appendChild(createThemeSection(state));
  leftCol.appendChild(createDisplaySection(state));
  grid.appendChild(leftCol);

  // Right column: Features + Metrics
  const rightCol = document.createElement('div');
  rightCol.appendChild(createFeaturesSection(state));
  rightCol.appendChild(createMetricsSection(state));
  grid.appendChild(rightCol);

  popover.appendChild(grid);
  popover.appendChild(createResetSection(state));

  overlay.appendChild(popover);
  state.overlayElement = overlay;
  document.body.appendChild(overlay);
}

// ============================================================================
// Settings Popover Section Builders
// ============================================================================

function createSettingsHeader(state: DevBarState): HTMLDivElement {
  const { accentColor } = state.options;

  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: `1px solid ${withAlpha(accentColor, 19)}`,
    position: 'sticky',
    top: '0',
    backgroundColor: 'var(--devbar-color-bg-elevated)',
    zIndex: '1',
  });

  const title = document.createElement('span');
  Object.assign(title.style, { color: accentColor, fontSize: '0.75rem', fontWeight: '600' });
  title.textContent = 'Settings';
  header.appendChild(title);

  header.appendChild(createCloseButton(() => {
    state.showSettingsPopover = false;
    state.render();
  }));

  return header;
}

function createThemeSection(state: DevBarState): HTMLDivElement {
  const { accentColor } = state.options;

  const themeSection = createSettingsSection('Theme');

  const themeOptions = document.createElement('div');
  Object.assign(themeOptions.style, { display: 'flex', gap: '6px' });

  const themeModes: ThemeMode[] = ['system', 'dark', 'light'];
  themeModes.forEach((mode) => {
    const btn = createSettingsRadioButton({
      label: mode,
      isActive: state.themeMode === mode,
      accentColor,
      onClick: () => setThemeMode(state, mode),
    });
    btn.style.textTransform = 'capitalize';
    themeOptions.appendChild(btn);
  });
  themeSection.appendChild(themeOptions);

  return themeSection;
}

type SettingsPositionValue = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'bottom-center';

function createDisplaySection(state: DevBarState): HTMLDivElement {
  const displaySection = createSettingsSection('Display');

  displaySection.appendChild(createPositionPicker(state));
  displaySection.appendChild(createCompactModeToggle(state));
  displaySection.appendChild(createAccentColorPicker(state));
  displaySection.appendChild(createScreenshotQualitySlider(state));

  return displaySection;
}

function createPositionPicker(state: DevBarState): HTMLDivElement {
  const { accentColor } = state.options;
  const color = CSS_COLORS.textSecondary;

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
    border: `1px solid ${withAlpha(color, 19)}`,
    borderRadius: '4px',
  });

  // Position indicator styles - rectangular bars representing DevBar
  const positionConfigs: Array<{
    value: SettingsPositionValue;
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
      boxShadow: isActive ? `0 0 8px ${withAlpha(accentColor, 38)}` : 'none',
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
        indicator.style.boxShadow = `0 0 6px ${withAlpha(accentColor, 25)}`;
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
  return positionRow;
}

function createCompactModeToggle(state: DevBarState): DocumentFragment {
  const { accentColor } = state.options;
  const fragment = document.createDocumentFragment();

  fragment.appendChild(
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
  fragment.appendChild(shortcutHint);

  return fragment;
}

function createAccentColorPicker(state: DevBarState): HTMLDivElement {
  const { accentColor } = state.options;

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
  return accentRow;
}

function createScreenshotQualitySlider(state: DevBarState): HTMLDivElement {
  const { accentColor } = state.options;
  const color = CSS_COLORS.textSecondary;

  const qualityRow = document.createElement('div');
  Object.assign(qualityRow.style, { marginTop: '8px' });

  const qualityHeader = document.createElement('div');
  Object.assign(qualityHeader.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '6px',
  });

  const qualityLabel = document.createElement('span');
  Object.assign(qualityLabel.style, {
    color: CSS_COLORS.text,
    fontSize: '0.6875rem',
  });
  qualityLabel.textContent = 'Screenshot Quality';
  qualityHeader.appendChild(qualityLabel);

  const qualityValue = document.createElement('span');
  Object.assign(qualityValue.style, {
    color: accentColor,
    fontSize: '0.6875rem',
    fontFamily: 'monospace',
    minWidth: '28px',
    textAlign: 'right',
  });
  const quality = state.options.screenshotQuality;
  qualityValue.textContent = quality.toFixed(2);
  qualityHeader.appendChild(qualityValue);
  qualityRow.appendChild(qualityHeader);

  // Wrapper: positions the visible track line behind the transparent range input
  const sliderWrap = document.createElement('div');
  Object.assign(sliderWrap.style, { position: 'relative', height: '20px' });

  // Visible track rail (a real div, always renders)
  const track = document.createElement('div');
  Object.assign(track.style, {
    position: 'absolute',
    top: '50%',
    left: '0',
    right: '0',
    height: '2px',
    transform: 'translateY(-50%)',
    borderRadius: '1px',
    background: withAlpha(color, 25),
    pointerEvents: 'none',
  });

  // Filled portion of the track
  const trackFill = document.createElement('div');
  Object.assign(trackFill.style, {
    height: '100%',
    width: `${quality * 100}%`,
    borderRadius: '1px',
    background: accentColor,
  });
  track.appendChild(trackFill);
  sliderWrap.appendChild(track);

  const qualitySlider = document.createElement('input');
  qualitySlider.type = 'range';
  qualitySlider.min = '0';
  qualitySlider.max = '1';
  qualitySlider.step = '0.01';
  qualitySlider.value = String(quality);
  Object.assign(qualitySlider.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    appearance: 'none',
    WebkitAppearance: 'none',
    background: 'transparent',
    outline: 'none',
    cursor: 'pointer',
    margin: '0',
  });

  // Style the thumb via a scoped style element
  const sliderId = `devbar-quality-${Date.now()}`;
  qualitySlider.id = sliderId;
  const sliderStyle = document.createElement('style');
  sliderStyle.textContent = [
    `#${sliderId}::-webkit-slider-thumb {`,
    `  -webkit-appearance: none;`,
    `  width: 12px; height: 12px;`,
    `  border-radius: 50%;`,
    `  background: ${accentColor};`,
    `  border: 2px solid ${CSS_COLORS.bg};`,
    `  box-shadow: 0 0 4px ${withAlpha(accentColor, 50)};`,
    `  cursor: grab;`,
    `}`,
    `#${sliderId}::-webkit-slider-thumb:active { cursor: grabbing; }`,
    `#${sliderId}::-moz-range-thumb {`,
    `  width: 12px; height: 12px;`,
    `  border-radius: 50%;`,
    `  background: ${accentColor};`,
    `  border: 2px solid ${CSS_COLORS.bg};`,
    `  box-shadow: 0 0 4px ${withAlpha(accentColor, 50)};`,
    `  cursor: grab;`,
    `}`,
    `#${sliderId}::-webkit-slider-runnable-track { background: transparent; }`,
    `#${sliderId}::-moz-range-track { background: transparent; }`,
  ].join('\n');
  sliderWrap.appendChild(sliderStyle);

  qualitySlider.oninput = () => {
    const val = parseFloat(qualitySlider.value);
    qualityValue.textContent = val.toFixed(2);
    trackFill.style.width = `${val * 100}%`;
    state.options.screenshotQuality = val;
  };
  qualitySlider.onchange = () => {
    state.settingsManager.saveSettings({ screenshotQuality: state.options.screenshotQuality });
  };
  sliderWrap.appendChild(qualitySlider);
  qualityRow.appendChild(sliderWrap);

  return qualityRow;
}

function createFeaturesSection(state: DevBarState): HTMLDivElement {
  const { accentColor } = state.options;

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
    const isLocalDisabled = value === 'local' && !state.sweetlinkConnected;
    const btn = createSettingsRadioButton({
      label,
      isActive: state.options.saveLocation === value,
      accentColor,
      disabled: isLocalDisabled,
      disabledTitle: 'Sweetlink not connected',
      onClick: () => {
        state.options.saveLocation = value;
        state.settingsManager.saveSettings({ saveLocation: value });
        state.render();
      },
    });
    saveLocOptions.appendChild(btn);
  });

  saveLocRow.appendChild(saveLocOptions);
  featuresSection.appendChild(saveLocRow);

  return featuresSection;
}

type SettingsMetricKey = 'breakpoint' | 'fcp' | 'lcp' | 'cls' | 'inp' | 'pageSize';

function createMetricsSection(state: DevBarState): HTMLDivElement {
  const { accentColor } = state.options;

  const metricsSection = createSettingsSection('Metrics');

  const metricsToggles: Array<{ key: SettingsMetricKey; label: string }> = [
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

  return metricsSection;
}

function createResetSection(state: DevBarState): HTMLDivElement {
  const color = CSS_COLORS.textSecondary;

  const resetSection = document.createElement('div');
  Object.assign(resetSection.style, {
    padding: '10px 14px',
    borderTop: `1px solid ${withAlpha(color, 13)}`,
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
    border: `1px solid transparent`,
  });
  const resetColor = CSS_COLORS.textMuted;
  resetBtn.onmouseenter = () => {
    resetBtn.style.border = `1px solid ${resetColor}`;
    resetBtn.style.backgroundColor = withAlpha(resetColor, 6);
  };
  resetBtn.onmouseleave = () => {
    resetBtn.style.border = '1px solid transparent';
    resetBtn.style.backgroundColor = 'transparent';
  };
  resetBtn.onclick = () => {
    state.settingsManager.resetToDefaults();
    const defaults = DEFAULT_SETTINGS;
    state.applySettings(defaults);
  };
  resetSection.appendChild(resetBtn);

  return resetSection;
}

// ============================================================================
// Settings UI Helpers
// ============================================================================

function createSettingsSection(title: string, hasBorder = true): HTMLDivElement {
  const color = CSS_COLORS.textSecondary;
  const section = document.createElement('div');
  Object.assign(section.style, {
    padding: '10px 14px',
    borderBottom: hasBorder ? `1px solid ${withAlpha(color, 13)}` : 'none',
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

function createSettingsRadioButton(options: {
  label: string;
  isActive: boolean;
  accentColor: string;
  disabled?: boolean;
  disabledTitle?: string;
  onClick: () => void;
}): HTMLButtonElement {
  const { label, isActive, accentColor, disabled, disabledTitle, onClick } = options;
  const color = CSS_COLORS.textSecondary;

  const btn = document.createElement('button');
  Object.assign(btn.style, {
    padding: '4px 10px',
    backgroundColor: isActive ? withAlpha(accentColor, 13) : 'transparent',
    border: `1px solid ${isActive ? accentColor : 'transparent'}`,
    borderRadius: '4px',
    color: isActive ? accentColor : color,
    fontFamily: FONT_MONO,
    fontSize: '0.625rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 150ms',
    opacity: disabled ? '0.5' : '1',
  });
  btn.textContent = label;

  if (disabled) {
    if (disabledTitle) btn.title = disabledTitle;
  } else if (!isActive) {
    btn.onmouseenter = () => {
      btn.style.borderColor = `${color}`;
      btn.style.backgroundColor = withAlpha(color, 6);
    };
    btn.onmouseleave = () => {
      btn.style.borderColor = 'transparent';
      btn.style.backgroundColor = 'transparent';
    };
  }

  btn.onclick = () => {
    if (!disabled) onClick();
  };

  return btn;
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
