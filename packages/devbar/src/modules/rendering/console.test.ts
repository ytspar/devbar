/**
 * H2: Console popup rendering tests
 *
 * Tests the renderConsolePopup function which creates the console
 * log modal, including filtering by level, rendering log entries
 * with timestamps and color-coding, handling empty states, and
 * modal close behavior.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevBarState } from '../types.js';
import type { ConsoleLog } from '../../types.js';

// Mock UI components
vi.mock('../../ui/index.js', () => ({
  createEmptyMessage: vi.fn((text: string) => {
    const div = document.createElement('div');
    div.className = 'devbar-empty-message';
    div.textContent = text;
    return div;
  }),
  createModalBox: vi.fn((color: string) => {
    const div = document.createElement('div');
    div.className = 'devbar-modal-box';
    div.dataset.color = color;
    return div;
  }),
  createModalContent: vi.fn(() => {
    const div = document.createElement('div');
    div.className = 'devbar-modal-content';
    return div;
  }),
  createModalHeader: vi.fn((config: any) => {
    const div = document.createElement('div');
    div.className = 'devbar-modal-header';
    div.dataset.title = config.title;
    div.dataset.color = config.color;
    // Store callbacks for testing
    (div as any)._onClose = config.onClose;
    (div as any)._onClear = config.onClear;
    return div;
  }),
  createModalOverlay: vi.fn((closeFn: () => void) => {
    const div = document.createElement('div');
    div.className = 'devbar-modal-overlay';
    (div as any)._closeFn = closeFn;
    return div;
  }),
}));

vi.mock('../screenshot.js', () => ({
  consoleLogsToMarkdown: vi.fn(() => '# Mock markdown'),
  handleSaveConsoleLogs: vi.fn(),
}));

import { renderConsolePopup } from './console.js';
import {
  createEmptyMessage,
  createModalBox,
  createModalContent,
  createModalHeader,
  createModalOverlay,
} from '../../ui/index.js';

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
    settingsManager: { get: vi.fn(), getSettings: vi.fn() } as any,
    render: vi.fn(),
    sweetlinkConnected: false,
    consoleFilter: null,
    overlayElement: null,
    savingConsoleLogs: false,
    lastConsoleLogs: null,
    clearConsoleLogs: vi.fn(),
    ...overrides,
  } as any;
}

function createMockConsoleCapture(logs: ConsoleLog[]) {
  return {
    getLogs: vi.fn(() => logs),
  } as any;
}

function makeLogs(entries: Array<{ level: string; message: string; timestamp?: number }>): ConsoleLog[] {
  return entries.map((e, i) => ({
    level: e.level,
    message: e.message,
    timestamp: e.timestamp ?? Date.now() - (entries.length - i) * 1000,
  }));
}

afterEach(() => {
  document.body.textContent = '';
  vi.clearAllMocks();
});

describe('renderConsolePopup', () => {
  // ---- Early return ----

  it('returns early when consoleFilter is null', () => {
    const state = createMockState({ consoleFilter: null });
    const capture = createMockConsoleCapture([]);
    renderConsolePopup(state, capture);

    expect(createModalOverlay).not.toHaveBeenCalled();
  });

  // ---- Modal structure ----

  it('creates modal overlay, box, header, and content', () => {
    const state = createMockState({ consoleFilter: 'error' });
    const capture = createMockConsoleCapture([]);
    renderConsolePopup(state, capture);

    expect(createModalOverlay).toHaveBeenCalledTimes(1);
    expect(createModalBox).toHaveBeenCalledTimes(1);
    expect(createModalHeader).toHaveBeenCalledTimes(1);
    expect(createModalContent).toHaveBeenCalledTimes(1);
  });

  it('appends the overlay to document body', () => {
    const state = createMockState({ consoleFilter: 'error' });
    const capture = createMockConsoleCapture([]);
    renderConsolePopup(state, capture);

    expect(document.body.querySelector('.devbar-modal-overlay')).toBeTruthy();
  });

  it('sets state.overlayElement to the overlay', () => {
    const state = createMockState({ consoleFilter: 'error' });
    const capture = createMockConsoleCapture([]);
    renderConsolePopup(state, capture);

    expect(state.overlayElement).toBeTruthy();
    expect((state.overlayElement as HTMLElement).className).toBe('devbar-modal-overlay');
  });

  // ---- Filtering ----

  it('filters logs by error level', () => {
    const logs = makeLogs([
      { level: 'error', message: 'Error msg' },
      { level: 'warn', message: 'Warning msg' },
      { level: 'info', message: 'Info msg' },
      { level: 'error', message: 'Another error' },
    ]);
    const state = createMockState({ consoleFilter: 'error' });
    const capture = createMockConsoleCapture(logs);
    renderConsolePopup(state, capture);

    // Header should show count of 2 errors
    const headerCall = vi.mocked(createModalHeader).mock.calls[0][0];
    expect(headerCall.title).toBe('Console Errors (2)');
  });

  it('filters logs by warn level', () => {
    const logs = makeLogs([
      { level: 'error', message: 'Error msg' },
      { level: 'warn', message: 'Warning 1' },
      { level: 'warn', message: 'Warning 2' },
      { level: 'warn', message: 'Warning 3' },
    ]);
    const state = createMockState({ consoleFilter: 'warn' });
    const capture = createMockConsoleCapture(logs);
    renderConsolePopup(state, capture);

    const headerCall = vi.mocked(createModalHeader).mock.calls[0][0];
    expect(headerCall.title).toBe('Console Warnings (3)');
  });

  it('filters logs by info level', () => {
    const logs = makeLogs([
      { level: 'info', message: 'Info 1' },
      { level: 'error', message: 'Error msg' },
    ]);
    const state = createMockState({ consoleFilter: 'info' });
    const capture = createMockConsoleCapture(logs);
    renderConsolePopup(state, capture);

    const headerCall = vi.mocked(createModalHeader).mock.calls[0][0];
    expect(headerCall.title).toBe('Console Info (1)');
  });

  // ---- Color coding ----

  it('uses red color for error filter', () => {
    const state = createMockState({ consoleFilter: 'error' });
    const capture = createMockConsoleCapture([]);
    renderConsolePopup(state, capture);

    const boxCall = vi.mocked(createModalBox).mock.calls[0];
    expect(boxCall[0]).toBe('#ef4444');
  });

  it('uses amber color for warn filter', () => {
    const state = createMockState({ consoleFilter: 'warn' });
    const capture = createMockConsoleCapture([]);
    renderConsolePopup(state, capture);

    const boxCall = vi.mocked(createModalBox).mock.calls[0];
    expect(boxCall[0]).toBe('#f59e0b');
  });

  it('uses blue color for info filter', () => {
    const state = createMockState({ consoleFilter: 'info' });
    const capture = createMockConsoleCapture([]);
    renderConsolePopup(state, capture);

    const boxCall = vi.mocked(createModalBox).mock.calls[0];
    expect(boxCall[0]).toBe('#3b82f6');
  });

  // ---- Empty state ----

  it('shows empty message when no matching logs exist', () => {
    const state = createMockState({ consoleFilter: 'error' });
    const capture = createMockConsoleCapture([]);
    renderConsolePopup(state, capture);

    expect(createEmptyMessage).toHaveBeenCalledWith('No errors recorded');
  });

  it('shows empty message for warn filter with no warnings', () => {
    const logs = makeLogs([{ level: 'error', message: 'Error only' }]);
    const state = createMockState({ consoleFilter: 'warn' });
    const capture = createMockConsoleCapture(logs);
    renderConsolePopup(state, capture);

    expect(createEmptyMessage).toHaveBeenCalledWith('No warns recorded');
  });

  it('shows empty message for info filter with no info logs', () => {
    const state = createMockState({ consoleFilter: 'info' });
    const capture = createMockConsoleCapture([]);
    renderConsolePopup(state, capture);

    expect(createEmptyMessage).toHaveBeenCalledWith('No infos recorded');
  });

  // ---- Log rendering ----

  it('renders log entries when matching logs exist', () => {
    const logs = makeLogs([
      { level: 'error', message: 'First error' },
      { level: 'error', message: 'Second error' },
    ]);
    const state = createMockState({ consoleFilter: 'error' });
    const capture = createMockConsoleCapture(logs);
    renderConsolePopup(state, capture);

    // Should NOT call createEmptyMessage since there are logs
    expect(createEmptyMessage).not.toHaveBeenCalled();

    // Content should have child divs for each log entry
    const content = document.querySelector('.devbar-modal-content') as HTMLElement;
    expect(content.children.length).toBe(2);
  });

  it('each log entry contains a timestamp span', () => {
    const ts = new Date('2025-01-15T10:30:00Z').getTime();
    const logs = makeLogs([{ level: 'error', message: 'Test error', timestamp: ts }]);
    const state = createMockState({ consoleFilter: 'error' });
    const capture = createMockConsoleCapture(logs);
    renderConsolePopup(state, capture);

    const content = document.querySelector('.devbar-modal-content') as HTMLElement;
    const logItem = content.children[0] as HTMLElement;
    const timestamp = logItem.children[0] as HTMLElement;

    expect(timestamp.tagName).toBe('SPAN');
    // Timestamp text should be a formatted time
    expect(timestamp.textContent).toBeTruthy();
    expect(timestamp.style.fontSize).toBe('0.625rem');
  });

  it('each log entry contains a message span', () => {
    const logs = makeLogs([{ level: 'error', message: 'My error message' }]);
    const state = createMockState({ consoleFilter: 'error' });
    const capture = createMockConsoleCapture(logs);
    renderConsolePopup(state, capture);

    const content = document.querySelector('.devbar-modal-content') as HTMLElement;
    const logItem = content.children[0] as HTMLElement;
    const message = logItem.children[1] as HTMLElement;

    expect(message.tagName).toBe('SPAN');
    expect(message.textContent).toBe('My error message');
  });

  it('message span uses the filter color', () => {
    const logs = makeLogs([{ level: 'error', message: 'Error' }]);
    const state = createMockState({ consoleFilter: 'error' });
    const capture = createMockConsoleCapture(logs);
    renderConsolePopup(state, capture);

    const content = document.querySelector('.devbar-modal-content') as HTMLElement;
    const message = content.children[0]?.children[1] as HTMLElement;
    expect(message.style.color).toBe('#ef4444');
  });

  it('message span for warnings uses amber color', () => {
    const logs = makeLogs([{ level: 'warn', message: 'Warning' }]);
    const state = createMockState({ consoleFilter: 'warn' });
    const capture = createMockConsoleCapture(logs);
    renderConsolePopup(state, capture);

    const content = document.querySelector('.devbar-modal-content') as HTMLElement;
    const message = content.children[0]?.children[1] as HTMLElement;
    expect(message.style.color).toBe('#f59e0b');
  });

  it('message span for info uses blue color', () => {
    const logs = makeLogs([{ level: 'info', message: 'Info' }]);
    const state = createMockState({ consoleFilter: 'info' });
    const capture = createMockConsoleCapture(logs);
    renderConsolePopup(state, capture);

    const content = document.querySelector('.devbar-modal-content') as HTMLElement;
    const message = content.children[0]?.children[1] as HTMLElement;
    expect(message.style.color).toBe('#3b82f6');
  });

  it('log entries have padding and border-bottom separators', () => {
    const logs = makeLogs([
      { level: 'error', message: 'First' },
      { level: 'error', message: 'Second' },
      { level: 'error', message: 'Third' },
    ]);
    const state = createMockState({ consoleFilter: 'error' });
    const capture = createMockConsoleCapture(logs);
    renderConsolePopup(state, capture);

    const content = document.querySelector('.devbar-modal-content') as HTMLElement;

    // First and second items should have border-bottom
    const first = content.children[0] as HTMLElement;
    expect(first.style.borderBottom).toContain('1px solid');

    const second = content.children[1] as HTMLElement;
    expect(second.style.borderBottom).toContain('1px solid');

    // Last item should have no border-bottom
    const last = content.children[2] as HTMLElement;
    expect(last.style.borderBottom).toContain('none');
  });

  it('log entries have word-break and pre-wrap for long messages', () => {
    const logs = makeLogs([{ level: 'error', message: 'A very long error message' }]);
    const state = createMockState({ consoleFilter: 'error' });
    const capture = createMockConsoleCapture(logs);
    renderConsolePopup(state, capture);

    const content = document.querySelector('.devbar-modal-content') as HTMLElement;
    const message = content.children[0]?.children[1] as HTMLElement;
    expect(message.style.wordBreak).toBe('break-word');
    expect(message.style.whiteSpace).toBe('pre-wrap');
  });

  // ---- Close behavior ----

  it('close function resets consoleFilter to null', () => {
    const state = createMockState({ consoleFilter: 'error' });
    const capture = createMockConsoleCapture([]);
    renderConsolePopup(state, capture);

    const overlayCall = vi.mocked(createModalOverlay).mock.calls[0];
    const closeFn = overlayCall[0];
    closeFn();

    expect(state.consoleFilter).toBeNull();
    expect(state.render).toHaveBeenCalled();
  });

  it('header onClose also resets consoleFilter', () => {
    const state = createMockState({ consoleFilter: 'warn' });
    const capture = createMockConsoleCapture([]);
    renderConsolePopup(state, capture);

    const headerEl = document.querySelector('.devbar-modal-header') as any;
    headerEl._onClose();

    expect(state.consoleFilter).toBeNull();
    expect(state.render).toHaveBeenCalled();
  });

  // ---- Header configuration ----

  it('passes sweetlinkConnected to modal header', () => {
    const state = createMockState({ consoleFilter: 'error', sweetlinkConnected: true });
    const capture = createMockConsoleCapture([]);
    renderConsolePopup(state, capture);

    const headerCall = vi.mocked(createModalHeader).mock.calls[0][0];
    expect(headerCall.sweetlinkConnected).toBe(true);
  });

  it('passes saveLocation to modal header', () => {
    const state = createMockState({
      consoleFilter: 'error',
      options: {
        position: 'bottom-left',
        accentColor: '#10b981',
        showTooltips: true,
        saveLocation: 'local',
        showScreenshot: true,
        showConsoleBadges: true,
        wsPort: 9223,
        showMetrics: { breakpoint: true, fcp: true, lcp: true, cls: true, inp: true, pageSize: true },
      },
    });
    const capture = createMockConsoleCapture([]);
    renderConsolePopup(state, capture);

    const headerCall = vi.mocked(createModalHeader).mock.calls[0][0];
    expect(headerCall.saveLocation).toBe('local');
  });

  it('passes savingConsoleLogs state to header isSaving', () => {
    const state = createMockState({ consoleFilter: 'error', savingConsoleLogs: true });
    const capture = createMockConsoleCapture([]);
    renderConsolePopup(state, capture);

    const headerCall = vi.mocked(createModalHeader).mock.calls[0][0];
    expect(headerCall.isSaving).toBe(true);
  });

  it('passes lastConsoleLogs to header savedPath', () => {
    const state = createMockState({ consoleFilter: 'error', lastConsoleLogs: '/path/to/logs.md' });
    const capture = createMockConsoleCapture([]);
    renderConsolePopup(state, capture);

    const headerCall = vi.mocked(createModalHeader).mock.calls[0][0];
    expect(headerCall.savedPath).toBe('/path/to/logs.md');
  });

  it('header onClear calls state.clearConsoleLogs', () => {
    const state = createMockState({ consoleFilter: 'error' });
    const capture = createMockConsoleCapture([]);
    renderConsolePopup(state, capture);

    const headerCall = vi.mocked(createModalHeader).mock.calls[0][0];
    headerCall.onClear();
    expect(state.clearConsoleLogs).toHaveBeenCalled();
  });

  // ---- Timestamp rendering ----

  it('renders timestamp using toLocaleTimeString', () => {
    const specificTime = new Date('2025-06-15T14:30:45.123Z').getTime();
    const logs = makeLogs([{ level: 'error', message: 'Error', timestamp: specificTime }]);
    const state = createMockState({ consoleFilter: 'error' });
    const capture = createMockConsoleCapture(logs);
    renderConsolePopup(state, capture);

    const content = document.querySelector('.devbar-modal-content') as HTMLElement;
    const timestamp = content.children[0]?.children[0] as HTMLElement;

    // The timestamp text should match toLocaleTimeString output
    const expected = new Date(specificTime).toLocaleTimeString();
    expect(timestamp.textContent).toBe(expected);
  });

  it('timestamp span has muted color styling', () => {
    const logs = makeLogs([{ level: 'error', message: 'Error' }]);
    const state = createMockState({ consoleFilter: 'error' });
    const capture = createMockConsoleCapture(logs);
    renderConsolePopup(state, capture);

    const content = document.querySelector('.devbar-modal-content') as HTMLElement;
    const timestamp = content.children[0]?.children[0] as HTMLElement;
    expect(timestamp.style.color).toBe('var(--devbar-color-text-muted)');
    expect(timestamp.style.marginRight).toBe('8px');
  });

  // ---- Multiple logs rendering ----

  it('renders all matching logs in order', () => {
    const logs = makeLogs([
      { level: 'warn', message: 'Warning A' },
      { level: 'warn', message: 'Warning B' },
      { level: 'warn', message: 'Warning C' },
      { level: 'error', message: 'Error X' },
    ]);
    const state = createMockState({ consoleFilter: 'warn' });
    const capture = createMockConsoleCapture(logs);
    renderConsolePopup(state, capture);

    const content = document.querySelector('.devbar-modal-content') as HTMLElement;
    expect(content.children.length).toBe(3);

    const messages = Array.from(content.children).map(
      (child) => (child.children[1] as HTMLElement).textContent
    );
    expect(messages).toEqual(['Warning A', 'Warning B', 'Warning C']);
  });
});
