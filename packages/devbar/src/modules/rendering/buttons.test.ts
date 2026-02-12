/**
 * H2: Rendering buttons tests
 *
 * Tests DOM-creating button functions from the rendering/buttons module.
 * Uses happy-dom (the project's default vitest environment).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevBarState } from '../types.js';

// Mock heavy dependencies that buttons.ts imports
vi.mock('../../settings.js', () => ({
  resolveSaveLocation: vi.fn(() => 'auto'),
}));

vi.mock('../../ui/index.js', () => ({
  createSvgIcon: vi.fn(() => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    return svg;
  }),
  getButtonStyles: vi.fn(() => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    border: '1px solid',
    cursor: 'pointer',
  })),
}));

vi.mock('../../accessibility.js', () => ({
  preloadAxe: vi.fn(),
}));

vi.mock('../screenshot.js', () => ({
  copyPathToClipboard: vi.fn(),
  handleA11yAudit: vi.fn(),
  handleDocumentOutline: vi.fn(),
  handlePageSchema: vi.fn(),
  showDesignReviewConfirmation: vi.fn(),
}));

vi.mock('../tooltips.js', () => ({
  attachButtonTooltip: vi.fn(),
  attachTextTooltip: vi.fn(),
}));

import {
  createA11yButton,
  createAIReviewButton,
  createCompactToggleButton,
  createConsoleBadge,
  createOutlineButton,
  createSchemaButton,
  createScreenshotButton,
  createSettingsButton,
} from './buttons.js';

function createMockState(overrides: Partial<DevBarState> = {}): DevBarState {
  return {
    options: {
      showTooltips: true,
      saveLocation: 'auto',
      showScreenshot: true,
      showConsoleBadges: true,
      position: 'bottom-left',
      wsPort: 9223,
      accentColor: '#10b981',
      showMetrics: { breakpoint: true, fcp: true, lcp: true, cls: true, inp: true, pageSize: true },
    },
    debug: { state: vi.fn(), perf: vi.fn(), ws: vi.fn(), render: vi.fn(), event: vi.fn() },
    activeTooltips: new Set(),
    settingsManager: {
      get: vi.fn((key: string) => {
        if (key === 'accentColor') return '#10b981';
        return undefined;
      }),
      getSettings: vi.fn(),
    } as any,
    render: vi.fn(),
    sweetlinkConnected: false,
    consoleFilter: null,
    capturing: false,
    copiedToClipboard: false,
    copiedPath: false,
    lastScreenshot: null,
    designReviewInProgress: false,
    lastDesignReview: null,
    designReviewError: null,
    showDesignReviewConfirm: false,
    showOutlineModal: false,
    showSchemaModal: false,
    showA11yModal: false,
    showSettingsPopover: false,
    lastOutline: null,
    lastSchema: null,
    lastA11yAudit: null,
    compactMode: false,
    collapsed: false,
    handleScreenshot: vi.fn(),
    toggleCompactMode: vi.fn(),
    ...overrides,
  } as any;
}

afterEach(() => {
  document.body.textContent = '';
  vi.clearAllMocks();
});

describe('createConsoleBadge', () => {
  it('creates a span element with badge class', () => {
    const state = createMockState();
    const badge = createConsoleBadge(state, 'error', 5, '#ef4444');

    expect(badge.tagName).toBe('SPAN');
    expect(badge.className).toBe('devbar-badge');
  });

  it('displays the count as text', () => {
    const state = createMockState();
    const badge = createConsoleBadge(state, 'warn', 12, '#f59e0b');

    expect(badge.textContent).toBe('12');
  });

  it('caps display at 99+', () => {
    const state = createMockState();
    const badge = createConsoleBadge(state, 'error', 150, '#ef4444');

    expect(badge.textContent).toBe('99+');
  });

  it('shows count of 1 without plus suffix', () => {
    const state = createMockState();
    const badge = createConsoleBadge(state, 'info', 1, '#3b82f6');

    expect(badge.textContent).toBe('1');
  });

  it('toggles consoleFilter on click', () => {
    const state = createMockState({ consoleFilter: null });
    const badge = createConsoleBadge(state, 'error', 3, '#ef4444');

    badge.onclick!(new MouseEvent('click'));

    expect(state.consoleFilter).toBe('error');
    expect(state.render).toHaveBeenCalled();
  });

  it('clears consoleFilter on second click (toggle off)', () => {
    const state = createMockState({ consoleFilter: 'error' });
    const badge = createConsoleBadge(state, 'error', 3, '#ef4444');

    badge.onclick!(new MouseEvent('click'));

    expect(state.consoleFilter).toBeNull();
    expect(state.render).toHaveBeenCalled();
  });

  it('applies cursor pointer style', () => {
    const state = createMockState();
    const badge = createConsoleBadge(state, 'warn', 2, '#f59e0b');

    expect(badge.style.cursor).toBe('pointer');
  });
});

describe('createScreenshotButton', () => {
  it('creates a button element', () => {
    const state = createMockState();
    const btn = createScreenshotButton(state, '#10b981');

    expect(btn.tagName).toBe('BUTTON');
    expect(btn.type).toBe('button');
  });

  it('sets aria-label to Screenshot', () => {
    const state = createMockState();
    const btn = createScreenshotButton(state, '#10b981');

    expect(btn.getAttribute('aria-label')).toBe('Screenshot');
  });

  it('disables button when capturing', () => {
    const state = createMockState({ capturing: true });
    const btn = createScreenshotButton(state, '#10b981');

    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('...');
  });

  it('shows checkmark when copiedToClipboard', () => {
    const state = createMockState({ copiedToClipboard: true });
    const btn = createScreenshotButton(state, '#10b981');

    expect(btn.textContent).toContain('\u2713');
  });

  it('shows checkmark when lastScreenshot is set', () => {
    const state = createMockState({ lastScreenshot: '/path/to/screenshot.png' });
    const btn = createScreenshotButton(state, '#10b981');

    expect(btn.textContent).toContain('\u2713');
  });

  it('contains an SVG icon in default state', () => {
    const state = createMockState();
    const btn = createScreenshotButton(state, '#10b981');

    expect(btn.querySelector('svg')).toBeTruthy();
  });
});

describe('createAIReviewButton', () => {
  it('creates a button with aria-label', () => {
    const state = createMockState();
    const btn = createAIReviewButton(state);

    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('aria-label')).toBe('AI Design Review');
  });

  it('is disabled when sweetlink not connected', () => {
    const state = createMockState({ sweetlinkConnected: false });
    const btn = createAIReviewButton(state);

    expect(btn.disabled).toBe(true);
  });

  it('is disabled when design review is in progress', () => {
    const state = createMockState({ designReviewInProgress: true, sweetlinkConnected: true });
    const btn = createAIReviewButton(state);

    expect(btn.disabled).toBe(true);
  });

  it('shows X character when there is a design review error', () => {
    const state = createMockState({ designReviewError: 'API key missing' });
    const btn = createAIReviewButton(state);

    expect(btn.textContent).toBe('\u00D7');
  });

  it('shows v when last design review exists', () => {
    const state = createMockState({ lastDesignReview: '/path/to/review.md' });
    const btn = createAIReviewButton(state);

    expect(btn.textContent).toBe('v');
  });
});

describe('createOutlineButton', () => {
  it('creates a button with correct aria-label', () => {
    const state = createMockState();
    const btn = createOutlineButton(state);

    expect(btn.getAttribute('aria-label')).toBe('Document Outline');
  });

  it('shows v when lastOutline is set', () => {
    const state = createMockState({ lastOutline: '/path/to/outline.md' });
    const btn = createOutlineButton(state);

    expect(btn.textContent).toBe('v');
  });

  it('shows SVG icon in default state', () => {
    const state = createMockState();
    const btn = createOutlineButton(state);

    expect(btn.querySelector('svg')).toBeTruthy();
  });
});

describe('createSchemaButton', () => {
  it('creates a button with correct aria-label', () => {
    const state = createMockState();
    const btn = createSchemaButton(state);

    expect(btn.getAttribute('aria-label')).toBe('Page Schema');
  });

  it('shows v when lastSchema is set', () => {
    const state = createMockState({ lastSchema: '/path/to/schema.md' });
    const btn = createSchemaButton(state);

    expect(btn.textContent).toBe('v');
  });

  it('shows SVG icon in default state', () => {
    const state = createMockState();
    const btn = createSchemaButton(state);

    expect(btn.querySelector('svg')).toBeTruthy();
  });
});

describe('createA11yButton', () => {
  it('creates a button with correct aria-label', () => {
    const state = createMockState();
    const btn = createA11yButton(state);

    expect(btn.getAttribute('aria-label')).toBe('Accessibility Audit');
  });

  it('shows v when lastA11yAudit is set', () => {
    const state = createMockState({ lastA11yAudit: '/path/to/a11y.md' });
    const btn = createA11yButton(state);

    expect(btn.textContent).toBe('v');
  });

  it('shows SVG icon in default state', () => {
    const state = createMockState();
    const btn = createA11yButton(state);

    expect(btn.querySelector('svg')).toBeTruthy();
  });
});

describe('createSettingsButton', () => {
  it('creates a button with data-testid', () => {
    const state = createMockState();
    const btn = createSettingsButton(state);

    expect(btn.getAttribute('data-testid')).toBe('devbar-settings-button');
    expect(btn.getAttribute('aria-label')).toBe('Settings');
  });

  it('toggles showSettingsPopover on click', () => {
    const state = createMockState({ showSettingsPopover: false });
    const btn = createSettingsButton(state);

    btn.onclick!(new MouseEvent('click'));

    expect(state.showSettingsPopover).toBe(true);
    expect(state.render).toHaveBeenCalled();
  });

  it('closes settings popover if already open', () => {
    const state = createMockState({ showSettingsPopover: true });
    const btn = createSettingsButton(state);

    btn.onclick!(new MouseEvent('click'));

    // closeAllModals sets it false, then toggle sets it to !true = false
    expect(state.showSettingsPopover).toBe(false);
  });

  it('contains an SVG gear icon', () => {
    const state = createMockState();
    const btn = createSettingsButton(state);

    expect(btn.querySelector('svg')).toBeTruthy();
  });
});

describe('createCompactToggleButton', () => {
  it('creates a button with correct aria-label when expanded', () => {
    const state = createMockState({ compactMode: false });
    const btn = createCompactToggleButton(state);

    expect(btn.getAttribute('aria-label')).toBe('Switch to compact mode');
  });

  it('creates a button with correct aria-label when compact', () => {
    const state = createMockState({ compactMode: true });
    const btn = createCompactToggleButton(state);

    expect(btn.getAttribute('aria-label')).toBe('Switch to expanded mode');
  });

  it('calls toggleCompactMode on click', () => {
    const state = createMockState();
    const btn = createCompactToggleButton(state);

    btn.onclick!(new MouseEvent('click'));

    expect(state.toggleCompactMode).toHaveBeenCalled();
  });

  it('contains an SVG chevron icon', () => {
    const state = createMockState();
    const btn = createCompactToggleButton(state);

    expect(btn.querySelector('svg')).toBeTruthy();
  });
});
