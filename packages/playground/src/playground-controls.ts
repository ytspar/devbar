/**
 * Playground Controls
 *
 * Interactive controls panel for testing all DevBar options.
 */

import {
  initGlobalDevBar,
  destroyGlobalDevBar,
  COLORS,
  type GlobalDevBarOptions,
} from '@ytspar/devbar';

// Default options
const DEFAULT_OPTIONS: Required<Omit<GlobalDevBarOptions, 'sizeOverrides'>> = {
  position: 'bottom-left',
  accentColor: COLORS.primary,
  showMetrics: {
    breakpoint: true,
    fcp: true,
    lcp: true,
    pageSize: true,
  },
  showScreenshot: true,
  showConsoleBadges: true,
  showTooltips: true,
};

// Current state
let currentOptions = { ...DEFAULT_OPTIONS };
let controlsCollapsed = false;

/**
 * Toggle control configuration
 */
interface ToggleConfig {
  label: string;
  id: string;
  getValue: () => boolean;
  setValue: (value: boolean) => void;
}

/**
 * Define all toggle controls in a single configuration array
 */
function getToggleConfigs(): ToggleConfig[] {
  return [
    {
      label: 'Show Tooltips',
      id: 'showTooltips',
      getValue: () => currentOptions.showTooltips ?? true,
      setValue: (v) => { currentOptions.showTooltips = v; },
    },
    {
      label: 'Show Screenshot',
      id: 'showScreenshot',
      getValue: () => currentOptions.showScreenshot ?? true,
      setValue: (v) => { currentOptions.showScreenshot = v; },
    },
    {
      label: 'Console Badges',
      id: 'showConsoleBadges',
      getValue: () => currentOptions.showConsoleBadges ?? true,
      setValue: (v) => { currentOptions.showConsoleBadges = v; },
    },
  ];
}

/**
 * Define metrics toggle controls
 */
function getMetricsToggleConfigs(): ToggleConfig[] {
  const ensureMetrics = () => {
    if (!currentOptions.showMetrics) currentOptions.showMetrics = {};
  };

  return [
    {
      label: 'Breakpoint',
      id: 'metrics-breakpoint',
      getValue: () => currentOptions.showMetrics?.breakpoint ?? true,
      setValue: (v) => { ensureMetrics(); currentOptions.showMetrics!.breakpoint = v; },
    },
    {
      label: 'FCP',
      id: 'metrics-fcp',
      getValue: () => currentOptions.showMetrics?.fcp ?? true,
      setValue: (v) => { ensureMetrics(); currentOptions.showMetrics!.fcp = v; },
    },
    {
      label: 'LCP',
      id: 'metrics-lcp',
      getValue: () => currentOptions.showMetrics?.lcp ?? true,
      setValue: (v) => { ensureMetrics(); currentOptions.showMetrics!.lcp = v; },
    },
    {
      label: 'Page Size',
      id: 'metrics-pageSize',
      getValue: () => currentOptions.showMetrics?.pageSize ?? true,
      setValue: (v) => { ensureMetrics(); currentOptions.showMetrics!.pageSize = v; },
    },
  ];
}

/**
 * Initialize playground controls
 */
export function initPlaygroundControls(): void {
  // Create controls panel
  const panel = createControlsPanel();
  document.body.appendChild(panel);

  // Initial devbar setup
  reinitDevBar();
}

/**
 * Reinitialize DevBar with current options
 */
function reinitDevBar(): void {
  destroyGlobalDevBar();
  initGlobalDevBar(currentOptions);
}

/**
 * Create the main controls panel
 */
function createControlsPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'controls-panel';
  panel.id = 'controls-panel';

  // Header with toggle
  const header = document.createElement('div');
  header.className = 'controls-header';

  const title = document.createElement('span');
  title.textContent = 'DevBar Options';
  header.appendChild(title);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'controls-toggle';
  toggleBtn.textContent = '−';
  toggleBtn.onclick = () => {
    controlsCollapsed = !controlsCollapsed;
    panel.classList.toggle('collapsed', controlsCollapsed);
    toggleBtn.textContent = controlsCollapsed ? '+' : '−';
  };
  header.appendChild(toggleBtn);

  panel.appendChild(header);

  // Controls content
  const content = document.createElement('div');
  content.className = 'controls-content';

  // Position selector (visual mini-map)
  content.appendChild(createPositionSelector(
    currentOptions.position ?? 'bottom-left',
    (value) => {
      currentOptions.position = value as typeof currentOptions.position;
      reinitDevBar();
      updatePositionSelector();
    }
  ));

  // Add main toggle controls
  getToggleConfigs().forEach(config => {
    content.appendChild(createToggleFromConfig(config));
  });

  // Metrics section
  const metricsHeader = document.createElement('div');
  metricsHeader.className = 'controls-section-header';
  metricsHeader.textContent = 'Metrics';
  content.appendChild(metricsHeader);

  // Add metrics toggle controls
  getMetricsToggleConfigs().forEach(config => {
    content.appendChild(createToggleFromConfig(config));
  });

  // Reset button
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'controls-reset';
  resetBtn.textContent = 'Reset to Defaults';
  resetBtn.onclick = () => {
    currentOptions = { ...DEFAULT_OPTIONS };
    reinitDevBar();
    updateControlsUI();
  };
  content.appendChild(resetBtn);

  panel.appendChild(content);

  return panel;
}

/**
 * Position values matching GlobalDevBar positioning
 */
const POSITION_CONFIG: Record<string, { top?: string; bottom?: string; left?: string; right?: string; transform?: string }> = {
  'top-left': { top: '10%', left: '12%' },
  'top-right': { top: '10%', right: '8%' },
  'bottom-left': { bottom: '10%', left: '12%' },
  'bottom-right': { bottom: '10%', right: '8%' },
  'bottom-center': { bottom: '8%', left: '50%', transform: 'translateX(-50%)' },
};

/**
 * Create a visual position selector (mini-map)
 */
function createPositionSelector(
  currentValue: string,
  onChange: (value: string) => void
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'control-group';

  const label = document.createElement('label');
  label.textContent = 'Position';
  group.appendChild(label);

  const miniMap = document.createElement('div');
  miniMap.className = 'position-minimap';
  miniMap.id = 'position-minimap';

  // Create position indicators
  const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'bottom-center'];
  positions.forEach(pos => {
    const indicator = document.createElement('button');
    indicator.type = 'button';
    indicator.className = `position-indicator ${pos === currentValue ? 'active' : ''}`;
    indicator.dataset.position = pos;
    indicator.title = pos.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Apply position styles
    const posConfig = POSITION_CONFIG[pos];
    if (posConfig.top) indicator.style.top = posConfig.top;
    if (posConfig.bottom) indicator.style.bottom = posConfig.bottom;
    if (posConfig.left) indicator.style.left = posConfig.left;
    if (posConfig.right) indicator.style.right = posConfig.right;
    if (posConfig.transform) indicator.style.transform = posConfig.transform;

    indicator.onclick = () => {
      onChange(pos);
    };

    miniMap.appendChild(indicator);
  });

  group.appendChild(miniMap);
  return group;
}

/**
 * Update position selector to reflect current state
 */
function updatePositionSelector(): void {
  const miniMap = document.getElementById('position-minimap');
  if (!miniMap) return;

  miniMap.querySelectorAll('.position-indicator').forEach(btn => {
    const indicator = btn as HTMLButtonElement;
    indicator.classList.toggle('active', indicator.dataset.position === currentOptions.position);
  });
}

/**
 * Create a toggle (checkbox) control from a configuration object
 */
function createToggleFromConfig(config: ToggleConfig): HTMLElement {
  const group = document.createElement('div');
  group.className = 'control-group toggle';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = config.id;
  checkbox.checked = config.getValue();
  checkbox.onchange = () => {
    config.setValue(checkbox.checked);
    reinitDevBar();
  };
  group.appendChild(checkbox);

  const labelEl = document.createElement('label');
  labelEl.htmlFor = config.id;
  labelEl.textContent = config.label;
  group.appendChild(labelEl);

  return group;
}

/**
 * Update all controls UI to match current options
 */
function updateControlsUI(): void {
  updatePositionSelector();

  // Update all toggles from their configs
  [...getToggleConfigs(), ...getMetricsToggleConfigs()].forEach(config => {
    const checkbox = document.getElementById(config.id) as HTMLInputElement;
    if (checkbox) checkbox.checked = config.getValue();
  });
}
