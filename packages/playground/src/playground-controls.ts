/**
 * Playground Controls
 *
 * Interactive controls panel for testing all DevBar options and
 * a breakpoint simulator that constrains the content container.
 */

import {
  initGlobalDevBar,
  destroyGlobalDevBar,
  TAILWIND_BREAKPOINTS,
  type TailwindBreakpoint,
  type GlobalDevBarOptions,
} from '@ytspar/devbar';

// Default options
const DEFAULT_OPTIONS: Required<Omit<GlobalDevBarOptions, 'sizeOverrides'>> = {
  position: 'bottom-left',
  accentColor: '#10b981',
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
let currentBreakpoint: TailwindBreakpoint | 'auto' = 'auto';
let controlsCollapsed = false;

// Breakpoint widths for the simulator
const BREAKPOINT_WIDTHS: Record<TailwindBreakpoint | 'auto', number | null> = {
  'auto': null,  // Full width (no constraint)
  'base': 375,   // Mobile
  'sm': 640,
  'md': 768,
  'lg': 1024,
  'xl': 1280,
  '2xl': 1536,
};

/**
 * Initialize playground controls
 */
export function initPlaygroundControls(): void {
  // Create controls panel
  const panel = createControlsPanel();
  document.body.appendChild(panel);

  // Create breakpoint indicator/selector in top right
  const bpSelector = createBreakpointSelector();
  document.body.appendChild(bpSelector);

  // Wrap app content in a resizable container
  wrapContentContainer();

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
 * Wrap the #app content in a container for breakpoint simulation
 */
function wrapContentContainer(): void {
  const app = document.getElementById('app');
  if (!app) return;

  // Create wrapper
  const wrapper = document.createElement('div');
  wrapper.id = 'playground-viewport';
  wrapper.className = 'playground-viewport';

  // Move app content into wrapper
  app.parentNode?.insertBefore(wrapper, app);
  wrapper.appendChild(app);

  // Apply initial breakpoint
  updateViewportWidth();
}

/**
 * Update the viewport container width based on selected breakpoint
 */
function updateViewportWidth(): void {
  const wrapper = document.getElementById('playground-viewport');
  if (!wrapper) return;

  const width = BREAKPOINT_WIDTHS[currentBreakpoint];

  if (width === null) {
    wrapper.style.maxWidth = '';
    wrapper.style.margin = '';
  } else {
    wrapper.style.maxWidth = `${width}px`;
    wrapper.style.margin = '0 auto';
  }

  // Update breakpoint indicator
  updateBreakpointIndicator();
}

/**
 * Update the breakpoint indicator display
 */
function updateBreakpointIndicator(): void {
  const indicator = document.getElementById('bp-current');
  if (!indicator) return;

  if (currentBreakpoint === 'auto') {
    // Show actual window breakpoint
    const width = window.innerWidth;
    let bp: TailwindBreakpoint = 'base';
    if (width >= TAILWIND_BREAKPOINTS['2xl'].min) bp = '2xl';
    else if (width >= TAILWIND_BREAKPOINTS.xl.min) bp = 'xl';
    else if (width >= TAILWIND_BREAKPOINTS.lg.min) bp = 'lg';
    else if (width >= TAILWIND_BREAKPOINTS.md.min) bp = 'md';
    else if (width >= TAILWIND_BREAKPOINTS.sm.min) bp = 'sm';
    indicator.textContent = `${bp.toUpperCase()} (${width}px)`;
  } else {
    const width = BREAKPOINT_WIDTHS[currentBreakpoint];
    indicator.textContent = `${currentBreakpoint.toUpperCase()} (${width}px)`;
  }
}

/**
 * Create the breakpoint selector in top right
 */
function createBreakpointSelector(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'bp-selector';

  // Current breakpoint display
  const current = document.createElement('div');
  current.id = 'bp-current';
  current.className = 'bp-current';
  container.appendChild(current);

  // Breakpoint buttons
  const buttons = document.createElement('div');
  buttons.className = 'bp-buttons';

  // Auto button
  const autoBtn = createBpButton('auto', 'AUTO');
  buttons.appendChild(autoBtn);

  // Separator
  const sep = document.createElement('span');
  sep.className = 'bp-sep';
  sep.textContent = '|';
  buttons.appendChild(sep);

  // Breakpoint buttons
  const bps: TailwindBreakpoint[] = ['base', 'sm', 'md', 'lg', 'xl', '2xl'];
  bps.forEach(bp => {
    const btn = createBpButton(bp, bp.toUpperCase());
    buttons.appendChild(btn);
  });

  container.appendChild(buttons);

  // Listen for window resize to update auto breakpoint
  window.addEventListener('resize', () => {
    if (currentBreakpoint === 'auto') {
      updateBreakpointIndicator();
    }
  });

  return container;
}

/**
 * Create a breakpoint button
 */
function createBpButton(bp: TailwindBreakpoint | 'auto', label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `bp-btn ${bp === currentBreakpoint ? 'active' : ''}`;
  btn.dataset.bp = bp;
  btn.textContent = label;

  btn.onclick = () => {
    currentBreakpoint = bp;
    updateViewportWidth();
    updateBpButtonStates();
  };

  return btn;
}

/**
 * Update breakpoint button active states
 */
function updateBpButtonStates(): void {
  document.querySelectorAll('.bp-btn').forEach(btn => {
    const bpBtn = btn as HTMLButtonElement;
    bpBtn.classList.toggle('active', bpBtn.dataset.bp === currentBreakpoint);
  });
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
      currentOptions.position = value as GlobalDevBarOptions['position'];
      reinitDevBar();
      updatePositionSelector();
    }
  ));

  // Toggle controls
  content.appendChild(createToggleControl('Show Tooltips', 'showTooltips', currentOptions.showTooltips ?? true, (value) => {
    currentOptions.showTooltips = value;
    reinitDevBar();
  }));

  content.appendChild(createToggleControl('Show Screenshot', 'showScreenshot', currentOptions.showScreenshot ?? true, (value) => {
    currentOptions.showScreenshot = value;
    reinitDevBar();
  }));

  content.appendChild(createToggleControl('Console Badges', 'showConsoleBadges', currentOptions.showConsoleBadges ?? true, (value) => {
    currentOptions.showConsoleBadges = value;
    reinitDevBar();
  }));

  // Metrics section
  const metricsHeader = document.createElement('div');
  metricsHeader.className = 'controls-section-header';
  metricsHeader.textContent = 'Metrics';
  content.appendChild(metricsHeader);

  content.appendChild(createToggleControl('Breakpoint', 'metrics-breakpoint', currentOptions.showMetrics?.breakpoint ?? true, (value) => {
    if (!currentOptions.showMetrics) currentOptions.showMetrics = {};
    currentOptions.showMetrics.breakpoint = value;
    reinitDevBar();
  }));

  content.appendChild(createToggleControl('FCP', 'metrics-fcp', currentOptions.showMetrics?.fcp ?? true, (value) => {
    if (!currentOptions.showMetrics) currentOptions.showMetrics = {};
    currentOptions.showMetrics.fcp = value;
    reinitDevBar();
  }));

  content.appendChild(createToggleControl('LCP', 'metrics-lcp', currentOptions.showMetrics?.lcp ?? true, (value) => {
    if (!currentOptions.showMetrics) currentOptions.showMetrics = {};
    currentOptions.showMetrics.lcp = value;
    reinitDevBar();
  }));

  content.appendChild(createToggleControl('Page Size', 'metrics-pageSize', currentOptions.showMetrics?.pageSize ?? true, (value) => {
    if (!currentOptions.showMetrics) currentOptions.showMetrics = {};
    currentOptions.showMetrics.pageSize = value;
    reinitDevBar();
  }));

  // Reset button
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'controls-reset';
  resetBtn.textContent = 'Reset to Defaults';
  resetBtn.onclick = () => {
    currentOptions = { ...DEFAULT_OPTIONS };
    reinitDevBar();
    // Update all controls to match
    updateControlsUI();
  };
  content.appendChild(resetBtn);

  panel.appendChild(content);

  return panel;
}

/**
 * Position values matching GlobalDevBar positioning
 * These use CSS custom properties for the mini-map scaling
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
 * Create a toggle (checkbox) control
 */
function createToggleControl(
  label: string,
  id: string,
  checked: boolean,
  onChange: (value: boolean) => void
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'control-group toggle';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = id;
  checkbox.checked = checked;
  checkbox.onchange = () => onChange(checkbox.checked);
  group.appendChild(checkbox);

  const labelEl = document.createElement('label');
  labelEl.htmlFor = id;
  labelEl.textContent = label;
  group.appendChild(labelEl);

  return group;
}

/**
 * Update all controls UI to match current options
 */
function updateControlsUI(): void {
  // Position mini-map
  updatePositionSelector();

  // Toggles
  const toggleMap: Record<string, boolean> = {
    'showTooltips': currentOptions.showTooltips ?? true,
    'showScreenshot': currentOptions.showScreenshot ?? true,
    'showConsoleBadges': currentOptions.showConsoleBadges ?? true,
    'metrics-breakpoint': currentOptions.showMetrics?.breakpoint ?? true,
    'metrics-fcp': currentOptions.showMetrics?.fcp ?? true,
    'metrics-lcp': currentOptions.showMetrics?.lcp ?? true,
    'metrics-pageSize': currentOptions.showMetrics?.pageSize ?? true,
  };

  Object.entries(toggleMap).forEach(([id, value]) => {
    const checkbox = document.getElementById(id) as HTMLInputElement;
    if (checkbox) checkbox.checked = value;
  });
}
