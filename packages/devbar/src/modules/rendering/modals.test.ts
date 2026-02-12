/**
 * Modal rendering tests
 *
 * Tests DOM-creating modal functions from the rendering/modals module:
 * renderOutlineModal, renderSchemaModal, renderA11yModal, renderDesignReviewConfirmModal.
 *
 * Uses happy-dom (the project's default vitest environment).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevBarState } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures these are available to the hoisted vi.mock calls
// ---------------------------------------------------------------------------

const {
  mockRunA11yAudit,
  mockA11yToMarkdown,
  mockGroupViolationsByImpact,
  mockGetImpactColor,
  mockGetViolationCounts,
  mockExtractDocumentOutline,
  mockOutlineToMarkdown,
  mockExtractPageSchema,
  mockSchemaToMarkdown,
  mockCheckMissingTags,
  mockExtractFavicons,
  mockIsImageKey,
  mockHandleSaveOutline,
  mockHandleSaveSchema,
  mockHandleSaveA11yAudit,
  mockCalculateCostEstimate,
  mockCloseDesignReviewConfirm,
  mockProceedWithDesignReview,
} = vi.hoisted(() => ({
  mockRunA11yAudit: vi.fn(),
  mockA11yToMarkdown: vi.fn(() => '# A11y Report'),
  mockGroupViolationsByImpact: vi.fn(() => new Map()),
  mockGetImpactColor: vi.fn((impact: string) => {
    const colors: Record<string, string> = {
      critical: '#ef4444',
      serious: '#f97316',
      moderate: '#f59e0b',
      minor: '#84cc16',
    };
    return colors[impact] || '#6b7280';
  }),
  mockGetViolationCounts: vi.fn(() => ({
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    total: 0,
  })),
  mockExtractDocumentOutline: vi.fn(() => []),
  mockOutlineToMarkdown: vi.fn(() => '# Outline'),
  mockExtractPageSchema: vi.fn(() => ({
    jsonLd: [],
    openGraph: {},
    twitter: {},
    metaTags: {},
  })),
  mockSchemaToMarkdown: vi.fn(() => '# Schema'),
  mockCheckMissingTags: vi.fn(() => []),
  mockExtractFavicons: vi.fn(() => []),
  mockIsImageKey: vi.fn(() => false),
  mockHandleSaveOutline: vi.fn(),
  mockHandleSaveSchema: vi.fn(),
  mockHandleSaveA11yAudit: vi.fn(),
  mockCalculateCostEstimate: vi.fn(() => null),
  mockCloseDesignReviewConfirm: vi.fn(),
  mockProceedWithDesignReview: vi.fn(),
}));

vi.mock('../../accessibility.js', () => ({
  runA11yAudit: mockRunA11yAudit,
  a11yToMarkdown: mockA11yToMarkdown,
  groupViolationsByImpact: mockGroupViolationsByImpact,
  getImpactColor: mockGetImpactColor,
  getViolationCounts: mockGetViolationCounts,
}));

vi.mock('../../outline.js', () => ({
  extractDocumentOutline: mockExtractDocumentOutline,
  outlineToMarkdown: mockOutlineToMarkdown,
}));

vi.mock('../../schema.js', () => ({
  extractPageSchema: mockExtractPageSchema,
  schemaToMarkdown: mockSchemaToMarkdown,
  checkMissingTags: mockCheckMissingTags,
  extractFavicons: mockExtractFavicons,
  isImageKey: mockIsImageKey,
}));

vi.mock('../../settings.js', () => ({
  resolveSaveLocation: vi.fn(() => 'auto'),
}));

vi.mock('../screenshot.js', () => ({
  handleSaveOutline: mockHandleSaveOutline,
  handleSaveSchema: mockHandleSaveSchema,
  handleSaveA11yAudit: mockHandleSaveA11yAudit,
  calculateCostEstimate: mockCalculateCostEstimate,
  closeDesignReviewConfirm: mockCloseDesignReviewConfirm,
  proceedWithDesignReview: mockProceedWithDesignReview,
}));

import {
  renderOutlineModal,
  renderSchemaModal,
  renderA11yModal,
  renderDesignReviewConfirmModal,
} from './modals.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    showA11yModal: true,
    showSettingsPopover: false,
    lastOutline: null,
    lastSchema: null,
    lastA11yAudit: null,
    savingOutline: false,
    savingSchema: false,
    savingA11yAudit: false,
    compactMode: false,
    collapsed: false,
    handleScreenshot: vi.fn(),
    toggleCompactMode: vi.fn(),
    overlayElement: null,
    apiKeyStatus: null,
    ...overrides,
  } as any;
}

/** Find the h2 title element inside an overlay. */
function findTitle(overlay: HTMLElement): string | null {
  const h2 = overlay.querySelector('h2');
  return h2?.textContent ?? null;
}

/** Find the modal box (direct child of overlay that is not the overlay itself). */
function findModalBox(overlay: HTMLElement): HTMLElement | null {
  return overlay.firstElementChild as HTMLElement | null;
}

afterEach(() => {
  document.body.textContent = '';
  vi.clearAllMocks();
});

// ===========================================================================
// renderOutlineModal
// ===========================================================================

describe('renderOutlineModal', () => {
  it('appends an overlay to document.body', () => {
    const state = createMockState();
    renderOutlineModal(state);

    expect(document.body.children.length).toBe(1);
    const overlay = document.body.firstElementChild as HTMLElement;
    expect(overlay.getAttribute('data-devbar')).toBe('true');
    expect(overlay.getAttribute('data-devbar-overlay')).toBe('true');
  });

  it('sets state.overlayElement', () => {
    const state = createMockState();
    renderOutlineModal(state);

    expect(state.overlayElement).toBe(document.body.firstElementChild);
  });

  it('renders the title "Document Outline"', () => {
    const state = createMockState();
    renderOutlineModal(state);

    const overlay = document.body.firstElementChild as HTMLElement;
    expect(findTitle(overlay)).toBe('Document Outline');
  });

  it('shows empty message when outline has no elements', () => {
    mockExtractDocumentOutline.mockReturnValue([]);
    const state = createMockState();
    renderOutlineModal(state);

    expect(document.body.textContent).toContain('No semantic elements found');
  });

  it('renders outline nodes when present', () => {
    mockExtractDocumentOutline.mockReturnValue([
      {
        tagName: 'h1',
        text: 'Hello World',
        level: 1,
        id: 'main-title',
        category: 'heading',
        children: [],
      },
    ]);
    const state = createMockState();
    renderOutlineModal(state);

    expect(document.body.textContent).toContain('<h1>');
    expect(document.body.textContent).toContain('Hello World');
    expect(document.body.textContent).toContain('#main-title');
  });

  it('renders nested outline children', () => {
    mockExtractDocumentOutline.mockReturnValue([
      {
        tagName: 'main',
        text: 'Main',
        level: 0,
        id: '',
        category: 'landmark',
        children: [
          {
            tagName: 'h2',
            text: 'Section',
            level: 2,
            id: '',
            category: 'heading',
            children: [],
          },
        ],
      },
    ]);
    const state = createMockState();
    renderOutlineModal(state);

    expect(document.body.textContent).toContain('<main>');
    expect(document.body.textContent).toContain('<h2>');
    expect(document.body.textContent).toContain('Section');
  });

  it('close button sets showOutlineModal to false and calls render', () => {
    const state = createMockState({ showOutlineModal: true });
    renderOutlineModal(state);

    const overlay = document.body.firstElementChild as HTMLElement;
    const buttons = overlay.querySelectorAll('button');
    const closeBtn = buttons[buttons.length - 1];
    closeBtn.click();

    expect(state.showOutlineModal).toBe(false);
    expect(state.render).toHaveBeenCalled();
  });

  it('truncates long text to 60 characters', () => {
    const longText = 'A'.repeat(80);
    mockExtractDocumentOutline.mockReturnValue([
      {
        tagName: 'p',
        text: longText,
        level: 0,
        id: '',
        category: 'other',
        children: [],
      },
    ]);
    const state = createMockState();
    renderOutlineModal(state);

    expect(document.body.textContent).toContain('A'.repeat(60) + '...');
    expect(document.body.textContent).not.toContain('A'.repeat(61));
  });

  it('shows warning icon for skipped heading levels', () => {
    mockExtractDocumentOutline.mockReturnValue([
      {
        tagName: 'h1',
        text: 'Title',
        level: 1,
        id: '',
        category: 'heading',
        children: [],
      },
      {
        tagName: 'h3',
        text: 'Skipped h2',
        level: 3,
        id: '',
        category: 'heading',
        children: [],
      },
    ]);
    const state = createMockState();
    renderOutlineModal(state);

    // The warning character \u26A0
    expect(document.body.textContent).toContain('\u26A0');
  });

  it('creates overlay > modal > header + content structure', () => {
    mockExtractDocumentOutline.mockReturnValue([]);
    const state = createMockState();
    renderOutlineModal(state);

    const overlay = document.body.firstElementChild as HTMLElement;
    const modal = findModalBox(overlay);
    expect(modal).toBeTruthy();
    // Modal should have at least 2 children: header and content
    expect(modal!.children.length).toBeGreaterThanOrEqual(2);
  });
});

// ===========================================================================
// renderSchemaModal
// ===========================================================================

describe('renderSchemaModal', () => {
  beforeEach(() => {
    mockExtractPageSchema.mockReturnValue({
      jsonLd: [],
      openGraph: {},
      twitter: {},
      metaTags: {},
    });
    mockCheckMissingTags.mockReturnValue([]);
    mockExtractFavicons.mockReturnValue([]);
  });

  it('appends an overlay to document.body', () => {
    const state = createMockState();
    renderSchemaModal(state);

    expect(document.body.children.length).toBe(1);
    const overlay = document.body.firstElementChild as HTMLElement;
    expect(overlay.getAttribute('data-devbar-overlay')).toBe('true');
  });

  it('sets state.overlayElement', () => {
    const state = createMockState();
    renderSchemaModal(state);

    expect(state.overlayElement).toBe(document.body.firstElementChild);
  });

  it('renders the title "Page Schema"', () => {
    const state = createMockState();
    renderSchemaModal(state);

    const overlay = document.body.firstElementChild as HTMLElement;
    expect(findTitle(overlay)).toBe('Page Schema');
  });

  it('shows empty message when no structured data found', () => {
    const state = createMockState();
    renderSchemaModal(state);

    expect(document.body.textContent).toContain('No structured data found');
  });

  it('renders Open Graph data when present', () => {
    mockExtractPageSchema.mockReturnValue({
      jsonLd: [],
      openGraph: { 'og:title': 'Test Title', 'og:description': 'Test Description' },
      twitter: {},
      metaTags: {},
    });

    const state = createMockState();
    renderSchemaModal(state);

    expect(document.body.textContent).toContain('Open Graph');
    expect(document.body.textContent).toContain('og:title');
    expect(document.body.textContent).toContain('Test Title');
  });

  it('renders Twitter card data when present', () => {
    mockExtractPageSchema.mockReturnValue({
      jsonLd: [],
      openGraph: {},
      twitter: { 'twitter:card': 'summary_large_image' },
      metaTags: {},
    });

    const state = createMockState();
    renderSchemaModal(state);

    expect(document.body.textContent).toContain('Twitter Cards');
    expect(document.body.textContent).toContain('twitter:card');
  });

  it('renders JSON-LD data when present', () => {
    mockExtractPageSchema.mockReturnValue({
      jsonLd: [{ '@type': 'Organization', name: 'Acme' }],
      openGraph: {},
      twitter: {},
      metaTags: {},
    });

    const state = createMockState();
    renderSchemaModal(state);

    expect(document.body.textContent).toContain('JSON-LD');
    expect(document.body.textContent).toContain('Organization');
  });

  it('renders missing tags section when there are missing tags', () => {
    mockCheckMissingTags.mockReturnValue([
      { tag: 'meta[description]', severity: 'error', hint: 'Required for SEO' },
    ]);

    const state = createMockState();
    renderSchemaModal(state);

    expect(document.body.textContent).toContain('Missing Tags');
    expect(document.body.textContent).toContain('meta[description]');
    expect(document.body.textContent).toContain('Required for SEO');
  });

  it('renders favicons section when favicons exist', () => {
    mockExtractFavicons.mockReturnValue([
      { label: 'favicon.ico', url: '/favicon.ico', size: '32x32' },
    ]);

    const state = createMockState();
    renderSchemaModal(state);

    expect(document.body.textContent).toContain('Favicons');
    expect(document.body.textContent).toContain('favicon.ico');
  });

  it('close button sets showSchemaModal to false and calls render', () => {
    const state = createMockState({ showSchemaModal: true });
    renderSchemaModal(state);

    const overlay = document.body.firstElementChild as HTMLElement;
    const buttons = overlay.querySelectorAll('button');
    const closeBtn = buttons[buttons.length - 1];
    closeBtn.click();

    expect(state.showSchemaModal).toBe(false);
    expect(state.render).toHaveBeenCalled();
  });

  it('creates overlay > modal > header + content structure', () => {
    const state = createMockState();
    renderSchemaModal(state);

    const overlay = document.body.firstElementChild as HTMLElement;
    const modal = findModalBox(overlay);
    expect(modal).toBeTruthy();
    expect(modal!.children.length).toBeGreaterThanOrEqual(2);
  });
});

// ===========================================================================
// renderA11yModal
// ===========================================================================

describe('renderA11yModal', () => {
  it('appends an overlay to document.body', () => {
    mockRunA11yAudit.mockReturnValue(new Promise(() => {})); // never resolves
    const state = createMockState();
    renderA11yModal(state);

    expect(document.body.children.length).toBe(1);
    const overlay = document.body.firstElementChild as HTMLElement;
    expect(overlay.getAttribute('data-devbar-overlay')).toBe('true');
  });

  it('sets state.overlayElement', () => {
    mockRunA11yAudit.mockReturnValue(new Promise(() => {}));
    const state = createMockState();
    renderA11yModal(state);

    expect(state.overlayElement).toBe(document.body.firstElementChild);
  });

  it('shows loading state initially', () => {
    mockRunA11yAudit.mockReturnValue(new Promise(() => {})); // pending
    const state = createMockState();
    renderA11yModal(state);

    expect(document.body.textContent).toContain('Running accessibility audit...');
  });

  it('shows loading header with "Accessibility Audit" title', () => {
    mockRunA11yAudit.mockReturnValue(new Promise(() => {}));
    const state = createMockState();
    renderA11yModal(state);

    const overlay = document.body.firstElementChild as HTMLElement;
    expect(findTitle(overlay)).toBe('Accessibility Audit');
  });

  it('shows success message when audit finds no violations', async () => {
    const auditResult = {
      violations: [],
      passes: [{ id: 'color-contrast', description: 'Color contrast check passed' }],
      incomplete: [],
      inapplicable: [],
      timestamp: '2025-01-01T00:00:00Z',
      url: 'http://localhost:3000',
    };
    mockRunA11yAudit.mockResolvedValue(auditResult);

    const state = createMockState();
    renderA11yModal(state);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('No accessibility violations found!');
    });
  });

  it('shows pass count when audit has passes and no violations', async () => {
    const auditResult = {
      violations: [],
      passes: [
        { id: 'rule-1', description: 'Rule 1' },
        { id: 'rule-2', description: 'Rule 2' },
        { id: 'rule-3', description: 'Rule 3' },
      ],
      incomplete: [],
      inapplicable: [],
      timestamp: '2025-01-01T00:00:00Z',
      url: 'http://localhost:3000',
    };
    mockRunA11yAudit.mockResolvedValue(auditResult);

    const state = createMockState();
    renderA11yModal(state);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('3 rules passed');
    });
  });

  it('shows "No Issues" in title when no violations', async () => {
    mockRunA11yAudit.mockResolvedValue({
      violations: [],
      passes: [],
      incomplete: [],
      inapplicable: [],
      timestamp: '2025-01-01T00:00:00Z',
      url: 'http://localhost:3000',
    });

    const state = createMockState();
    renderA11yModal(state);

    await vi.waitFor(() => {
      expect(findTitle(document.body.firstElementChild as HTMLElement)).toContain('No Issues');
    });
  });

  it('shows violation count in title when violations exist', async () => {
    const violation = {
      id: 'color-contrast',
      impact: 'serious' as const,
      description: 'Color contrast is insufficient',
      help: 'Elements must have sufficient color contrast',
      helpUrl: 'https://dequeuniversity.com/rules/axe/color-contrast',
      tags: ['wcag2aa'],
      nodes: [{ html: '<div>test</div>', target: ['div'], failureSummary: 'Fix me' }],
    };
    mockRunA11yAudit.mockResolvedValue({
      violations: [violation],
      passes: [],
      incomplete: [],
      inapplicable: [],
      timestamp: '2025-01-01T00:00:00Z',
      url: 'http://localhost:3000',
    });
    mockGetViolationCounts.mockReturnValue({ critical: 0, serious: 1, moderate: 0, minor: 0, total: 1 });
    mockGroupViolationsByImpact.mockReturnValue(
      new Map([
        ['critical', []],
        ['serious', [violation]],
        ['moderate', []],
        ['minor', []],
      ])
    );

    const state = createMockState();
    renderA11yModal(state);

    await vi.waitFor(() => {
      const title = findTitle(document.body.firstElementChild as HTMLElement);
      expect(title).toContain('1 Violation');
    });
  });

  it('shows plural "Violations" for multiple violations', async () => {
    const violation1 = {
      id: 'color-contrast',
      impact: 'serious' as const,
      description: 'desc1',
      help: 'help1',
      helpUrl: 'url1',
      tags: ['wcag2aa'],
      nodes: [{ html: '<div>1</div>', target: ['div'] }],
    };
    const violation2 = {
      id: 'image-alt',
      impact: 'critical' as const,
      description: 'desc2',
      help: 'help2',
      helpUrl: 'url2',
      tags: ['wcag2a'],
      nodes: [{ html: '<img>', target: ['img'] }],
    };
    mockRunA11yAudit.mockResolvedValue({
      violations: [violation1, violation2],
      passes: [],
      incomplete: [],
      inapplicable: [],
      timestamp: '2025-01-01T00:00:00Z',
      url: 'http://localhost:3000',
    });
    mockGetViolationCounts.mockReturnValue({ critical: 1, serious: 1, moderate: 0, minor: 0, total: 2 });
    mockGroupViolationsByImpact.mockReturnValue(
      new Map([
        ['critical', [violation2]],
        ['serious', [violation1]],
        ['moderate', []],
        ['minor', []],
      ])
    );

    const state = createMockState();
    renderA11yModal(state);

    await vi.waitFor(() => {
      const title = findTitle(document.body.firstElementChild as HTMLElement);
      expect(title).toContain('2 Violations');
    });
  });

  it('renders violation group sections', async () => {
    const violation = {
      id: 'color-contrast',
      impact: 'serious' as const,
      description: 'Color contrast is insufficient',
      help: 'Elements must have sufficient color contrast',
      helpUrl: 'https://dequeuniversity.com/rules/axe/color-contrast',
      tags: ['wcag2aa'],
      nodes: [{ html: '<div style="color: #ccc">low contrast</div>', target: ['div'] }],
    };
    mockRunA11yAudit.mockResolvedValue({
      violations: [violation],
      passes: [],
      incomplete: [],
      inapplicable: [],
      timestamp: '2025-01-01T00:00:00Z',
      url: 'http://localhost:3000',
    });
    mockGetViolationCounts.mockReturnValue({ critical: 0, serious: 1, moderate: 0, minor: 0, total: 1 });
    mockGroupViolationsByImpact.mockReturnValue(
      new Map([
        ['critical', []],
        ['serious', [violation]],
        ['moderate', []],
        ['minor', []],
      ])
    );

    const state = createMockState();
    renderA11yModal(state);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('serious (1)');
      expect(document.body.textContent).toContain('color-contrast');
      expect(document.body.textContent).toContain('Elements must have sufficient color contrast');
    });
  });

  it('shows error state when audit fails', async () => {
    mockRunA11yAudit.mockRejectedValue(new Error('axe-core failed to load'));

    const state = createMockState();
    renderA11yModal(state);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Audit Failed');
      expect(document.body.textContent).toContain('axe-core failed to load');
    });
  });

  it('shows "Unknown error" when error is not an Error instance', async () => {
    mockRunA11yAudit.mockRejectedValue('string error');

    const state = createMockState();
    renderA11yModal(state);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Unknown error');
    });
  });

  it('shows error title with "Error" suffix', async () => {
    mockRunA11yAudit.mockRejectedValue(new Error('test'));

    const state = createMockState();
    renderA11yModal(state);

    await vi.waitFor(() => {
      const title = findTitle(document.body.firstElementChild as HTMLElement);
      expect(title).toContain('Error');
    });
  });

  it('does not update modal when modal is closed before audit completes', async () => {
    let resolveAudit!: (value: any) => void;
    mockRunA11yAudit.mockReturnValue(
      new Promise((resolve) => {
        resolveAudit = resolve;
      })
    );

    const state = createMockState({ showA11yModal: true });
    renderA11yModal(state);

    // Close the modal before audit completes
    state.showA11yModal = false;

    resolveAudit({
      violations: [],
      passes: [],
      incomplete: [],
      inapplicable: [],
      timestamp: '2025-01-01T00:00:00Z',
      url: 'http://localhost:3000',
    });

    // Wait a tick
    await new Promise((r) => setTimeout(r, 10));

    // The loading text should still be there (modal content was not replaced)
    expect(document.body.textContent).toContain('Running accessibility audit...');
  });

  it('does not update modal on error when modal is closed', async () => {
    let rejectAudit!: (reason: any) => void;
    mockRunA11yAudit.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectAudit = reject;
      })
    );

    const state = createMockState({ showA11yModal: true });
    renderA11yModal(state);

    // Close the modal
    state.showA11yModal = false;

    rejectAudit(new Error('test'));

    // Wait a tick
    await new Promise((r) => setTimeout(r, 10));

    // Should still show loading, not error
    expect(document.body.textContent).toContain('Running accessibility audit...');
    expect(document.body.textContent).not.toContain('Audit Failed');
  });

  it('close button during loading sets showA11yModal to false', () => {
    mockRunA11yAudit.mockReturnValue(new Promise(() => {}));
    const state = createMockState({ showA11yModal: true });
    renderA11yModal(state);

    const overlay = document.body.firstElementChild as HTMLElement;
    const buttons = overlay.querySelectorAll('button');
    const closeBtn = buttons[buttons.length - 1];
    closeBtn.click();

    expect(state.showA11yModal).toBe(false);
    expect(state.render).toHaveBeenCalled();
  });

  it('renders summary bar with impact counts', async () => {
    const violation = {
      id: 'test-rule',
      impact: 'critical' as const,
      description: 'desc',
      help: 'help',
      helpUrl: 'url',
      tags: [],
      nodes: [{ html: '<div>x</div>', target: ['div'] }],
    };
    mockRunA11yAudit.mockResolvedValue({
      violations: [violation],
      passes: [],
      incomplete: [],
      inapplicable: [],
      timestamp: '2025-01-01T00:00:00Z',
      url: 'http://localhost:3000',
    });
    mockGetViolationCounts.mockReturnValue({ critical: 1, serious: 0, moderate: 0, minor: 0, total: 1 });
    mockGroupViolationsByImpact.mockReturnValue(
      new Map([
        ['critical', [violation]],
        ['serious', []],
        ['moderate', []],
        ['minor', []],
      ])
    );

    const state = createMockState();
    renderA11yModal(state);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('1 critical');
    });
  });

  it('renders node HTML snippets in violation details', async () => {
    const violation = {
      id: 'image-alt',
      impact: 'serious' as const,
      description: 'Images must have alt text',
      help: 'Images require alt attributes',
      helpUrl: 'url',
      tags: [],
      nodes: [
        { html: '<img src="test.png">', target: ['img'] },
      ],
    };
    mockRunA11yAudit.mockResolvedValue({
      violations: [violation],
      passes: [],
      incomplete: [],
      inapplicable: [],
      timestamp: '2025-01-01T00:00:00Z',
      url: 'http://localhost:3000',
    });
    mockGetViolationCounts.mockReturnValue({ critical: 0, serious: 1, moderate: 0, minor: 0, total: 1 });
    mockGroupViolationsByImpact.mockReturnValue(
      new Map([
        ['critical', []],
        ['serious', [violation]],
        ['moderate', []],
        ['minor', []],
      ])
    );

    const state = createMockState();
    renderA11yModal(state);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('<img src="test.png">');
      expect(document.body.textContent).toContain('1 element affected');
    });
  });

  it('shows "more" button when violation has > 3 nodes', async () => {
    const nodes = Array.from({ length: 5 }, (_, i) => ({
      html: `<div id="node-${i}">text</div>`,
      target: [`#node-${i}`],
    }));
    const violation = {
      id: 'test-rule',
      impact: 'moderate' as const,
      description: 'desc',
      help: 'help',
      helpUrl: 'url',
      tags: [],
      nodes,
    };
    mockRunA11yAudit.mockResolvedValue({
      violations: [violation],
      passes: [],
      incomplete: [],
      inapplicable: [],
      timestamp: '2025-01-01T00:00:00Z',
      url: 'http://localhost:3000',
    });
    mockGetViolationCounts.mockReturnValue({ critical: 0, serious: 0, moderate: 1, minor: 0, total: 1 });
    mockGroupViolationsByImpact.mockReturnValue(
      new Map([
        ['critical', []],
        ['serious', []],
        ['moderate', [violation]],
        ['minor', []],
      ])
    );

    const state = createMockState();
    renderA11yModal(state);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('+ 2 more');
    });
  });

  it('creates overlay > modal > header + content structure', () => {
    mockRunA11yAudit.mockReturnValue(new Promise(() => {}));
    const state = createMockState();
    renderA11yModal(state);

    const overlay = document.body.firstElementChild as HTMLElement;
    const modal = findModalBox(overlay);
    expect(modal).toBeTruthy();
    expect(modal!.children.length).toBeGreaterThanOrEqual(2);
  });
});

// ===========================================================================
// renderDesignReviewConfirmModal
// ===========================================================================

describe('renderDesignReviewConfirmModal', () => {
  it('appends an overlay to document.body', () => {
    const state = createMockState();
    renderDesignReviewConfirmModal(state);

    expect(document.body.children.length).toBe(1);
    const overlay = document.body.firstElementChild as HTMLElement;
    expect(overlay.getAttribute('data-devbar-overlay')).toBe('true');
  });

  it('sets state.overlayElement', () => {
    const state = createMockState();
    renderDesignReviewConfirmModal(state);

    expect(state.overlayElement).toBe(document.body.firstElementChild);
  });

  it('renders the title "AI Design Review"', () => {
    const state = createMockState();
    renderDesignReviewConfirmModal(state);

    const overlay = document.body.firstElementChild as HTMLElement;
    expect(findTitle(overlay)).toBe('AI Design Review');
  });

  it('sets maxWidth on modal box', () => {
    const state = createMockState();
    renderDesignReviewConfirmModal(state);

    const overlay = document.body.firstElementChild as HTMLElement;
    const modal = findModalBox(overlay);
    expect(modal!.style.maxWidth).toBe('450px');
  });

  it('shows checking message when apiKeyStatus is null', () => {
    const state = createMockState({ apiKeyStatus: null });
    renderDesignReviewConfirmModal(state);

    expect(document.body.textContent).toContain('Checking API key configuration...');
  });

  it('shows API key not configured message when not configured', () => {
    const state = createMockState({
      apiKeyStatus: { configured: false },
    });
    renderDesignReviewConfirmModal(state);

    expect(document.body.textContent).toContain('API Key Not Configured');
    expect(document.body.textContent).toContain('ANTHROPIC_API_KEY');
  });

  it('shows configuration instructions when not configured', () => {
    const state = createMockState({
      apiKeyStatus: { configured: false },
    });
    renderDesignReviewConfirmModal(state);

    expect(document.body.textContent).toContain('To configure:');
    expect(document.body.textContent).toContain('console.anthropic.com');
    expect(document.body.textContent).toContain('ANTHROPIC_API_KEY=sk-ant-...');
  });

  it('shows description when API key is configured', () => {
    const state = createMockState({
      apiKeyStatus: { configured: true },
    });
    renderDesignReviewConfirmModal(state);

    expect(document.body.textContent).toContain('capture a screenshot');
    expect(document.body.textContent).toContain('Claude');
  });

  it('shows model info when available', () => {
    const state = createMockState({
      apiKeyStatus: { configured: true, model: 'claude-sonnet-4-20250514' },
    });
    renderDesignReviewConfirmModal(state);

    expect(document.body.textContent).toContain('claude-sonnet-4-20250514');
  });

  it('shows cost estimate when available', () => {
    mockCalculateCostEstimate.mockReturnValue({ tokens: 5000, cost: '$0.02' });
    const state = createMockState({
      apiKeyStatus: { configured: true },
    });
    renderDesignReviewConfirmModal(state);

    expect(document.body.textContent).toContain('Estimated Cost');
    expect(document.body.textContent).toContain('5,000');
    expect(document.body.textContent).toContain('$0.02');
  });

  it('does not show cost estimate when not available', () => {
    mockCalculateCostEstimate.mockReturnValue(null);
    const state = createMockState({
      apiKeyStatus: { configured: true },
    });
    renderDesignReviewConfirmModal(state);

    expect(document.body.textContent).not.toContain('Estimated Cost');
  });

  it('shows "Run Review" button when API key is configured', () => {
    const state = createMockState({
      apiKeyStatus: { configured: true },
    });
    renderDesignReviewConfirmModal(state);

    const buttons = document.body.querySelectorAll('button');
    const buttonTexts = Array.from(buttons).map((b) => b.textContent);
    expect(buttonTexts).toContain('Run Review');
  });

  it('does not show "Run Review" button when API key is not configured', () => {
    const state = createMockState({
      apiKeyStatus: { configured: false },
    });
    renderDesignReviewConfirmModal(state);

    const buttons = document.body.querySelectorAll('button');
    const buttonTexts = Array.from(buttons).map((b) => b.textContent);
    expect(buttonTexts).not.toContain('Run Review');
  });

  it('calls proceedWithDesignReview when "Run Review" is clicked', () => {
    const state = createMockState({
      apiKeyStatus: { configured: true },
    });
    renderDesignReviewConfirmModal(state);

    const buttons = document.body.querySelectorAll('button');
    const runBtn = Array.from(buttons).find((b) => b.textContent === 'Run Review');
    expect(runBtn).toBeTruthy();
    runBtn!.click();

    expect(mockProceedWithDesignReview).toHaveBeenCalledWith(state);
  });

  it('calls closeDesignReviewConfirm when close button is clicked', () => {
    const state = createMockState();
    renderDesignReviewConfirmModal(state);

    const overlay = document.body.firstElementChild as HTMLElement;
    // In the design review confirm, minimal header has only a close button
    // The close button is the last button in the header
    const buttons = overlay.querySelectorAll('button');
    // With apiKeyStatus null, no "Run Review" footer, so only the close button exists
    const closeBtn = buttons[buttons.length - 1];
    closeBtn.click();

    expect(mockCloseDesignReviewConfirm).toHaveBeenCalledWith(state);
  });

  it('creates overlay > modal > header + content structure', () => {
    const state = createMockState();
    renderDesignReviewConfirmModal(state);

    const overlay = document.body.firstElementChild as HTMLElement;
    const modal = findModalBox(overlay);
    expect(modal).toBeTruthy();
    // At least: header, content, possibly footer
    expect(modal!.children.length).toBeGreaterThanOrEqual(2);
  });

  it('does not show footer when apiKeyStatus is null', () => {
    const state = createMockState({ apiKeyStatus: null });
    renderDesignReviewConfirmModal(state);

    const buttons = document.body.querySelectorAll('button');
    const buttonTexts = Array.from(buttons).map((b) => b.textContent);
    expect(buttonTexts).not.toContain('Run Review');
  });
});
