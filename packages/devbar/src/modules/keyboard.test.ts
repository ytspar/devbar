/**
 * Keyboard shortcuts module tests
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupKeyboardShortcuts } from './keyboard.js';
import type { DevBarState } from './types.js';

function createMockState(overrides: Partial<DevBarState> = {}): DevBarState {
  return {
    options: {
      showTooltips: true,
      showScreenshot: true,
      showConsoleBadges: true,
      position: 'bottom-left',
      wsPort: 24680,
    },
    debug: { state: vi.fn(), perf: vi.fn(), ws: vi.fn(), render: vi.fn(), event: vi.fn() },
    showSettingsPopover: false,
    consoleFilter: null,
    showOutlineModal: false,
    showSchemaModal: false,
    showDesignReviewConfirm: false,
    capturing: false,
    sweetlinkConnected: false,
    keydownHandler: null,
    render: vi.fn(),
    handleScreenshot: vi.fn(),
    toggleCompactMode: vi.fn(),
    ...overrides,
  } as any;
}

function createKeyboardEvent(key: string, opts: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
}

describe('setupKeyboardShortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers a keydown handler on window', () => {
    const state = createMockState();
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    setupKeyboardShortcuts(state);

    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(state.keydownHandler).toBeTypeOf('function');
  });

  describe('Escape key', () => {
    it('closes settings popover on Escape', () => {
      const state = createMockState({ showSettingsPopover: true });
      setupKeyboardShortcuts(state);

      state.keydownHandler!(createKeyboardEvent('Escape'));

      expect(state.showSettingsPopover).toBe(false);
      expect(state.render).toHaveBeenCalled();
    });

    it('prioritizes settings popover over other modals', () => {
      const state = createMockState({
        showSettingsPopover: true,
        showOutlineModal: true,
        consoleFilter: 'error',
      });
      setupKeyboardShortcuts(state);

      state.keydownHandler!(createKeyboardEvent('Escape'));

      // Settings popover should be closed first
      expect(state.showSettingsPopover).toBe(false);
      // Other modals should still be open
      expect(state.showOutlineModal).toBe(true);
      expect(state.consoleFilter).toBe('error');
    });

    it('closes console filter on Escape', () => {
      const state = createMockState({ consoleFilter: 'error' });
      setupKeyboardShortcuts(state);

      state.keydownHandler!(createKeyboardEvent('Escape'));

      expect(state.consoleFilter).toBeNull();
      expect(state.render).toHaveBeenCalled();
    });

    it('closes outline modal on Escape', () => {
      const state = createMockState({ showOutlineModal: true });
      setupKeyboardShortcuts(state);

      state.keydownHandler!(createKeyboardEvent('Escape'));

      expect(state.showOutlineModal).toBe(false);
      expect(state.render).toHaveBeenCalled();
    });

    it('closes schema modal on Escape', () => {
      const state = createMockState({ showSchemaModal: true });
      setupKeyboardShortcuts(state);

      state.keydownHandler!(createKeyboardEvent('Escape'));

      expect(state.showSchemaModal).toBe(false);
      expect(state.render).toHaveBeenCalled();
    });

    it('closes design review confirm on Escape', () => {
      const state = createMockState({ showDesignReviewConfirm: true });
      setupKeyboardShortcuts(state);

      state.keydownHandler!(createKeyboardEvent('Escape'));

      expect(state.showDesignReviewConfirm).toBe(false);
      expect(state.render).toHaveBeenCalled();
    });

    it('closes all modals at once when Escape is pressed (non-settings)', () => {
      const state = createMockState({
        consoleFilter: 'warn',
        showOutlineModal: true,
        showSchemaModal: true,
        showDesignReviewConfirm: true,
      });
      setupKeyboardShortcuts(state);

      state.keydownHandler!(createKeyboardEvent('Escape'));

      expect(state.consoleFilter).toBeNull();
      expect(state.showOutlineModal).toBe(false);
      expect(state.showSchemaModal).toBe(false);
      expect(state.showDesignReviewConfirm).toBe(false);
    });

    it('does nothing on Escape when nothing is open', () => {
      const state = createMockState();
      setupKeyboardShortcuts(state);

      state.keydownHandler!(createKeyboardEvent('Escape'));

      expect(state.render).not.toHaveBeenCalled();
    });
  });

  describe('Cmd/Ctrl+Shift+M: toggle compact mode', () => {
    it('calls toggleCompactMode on Cmd+Shift+M', () => {
      const state = createMockState();
      setupKeyboardShortcuts(state);

      const event = createKeyboardEvent('M', { metaKey: true, shiftKey: true });
      state.keydownHandler!(event);

      expect(state.toggleCompactMode).toHaveBeenCalledTimes(1);
    });

    it('calls toggleCompactMode on Ctrl+Shift+M', () => {
      const state = createMockState();
      setupKeyboardShortcuts(state);

      const event = createKeyboardEvent('M', { ctrlKey: true, shiftKey: true });
      state.keydownHandler!(event);

      expect(state.toggleCompactMode).toHaveBeenCalledTimes(1);
    });

    it('handles lowercase m', () => {
      const state = createMockState();
      setupKeyboardShortcuts(state);

      const event = createKeyboardEvent('m', { metaKey: true, shiftKey: true });
      state.keydownHandler!(event);

      expect(state.toggleCompactMode).toHaveBeenCalledTimes(1);
    });

    it('does not toggle without shift key', () => {
      const state = createMockState();
      setupKeyboardShortcuts(state);

      const event = createKeyboardEvent('M', { metaKey: true, shiftKey: false });
      state.keydownHandler!(event);

      expect(state.toggleCompactMode).not.toHaveBeenCalled();
    });
  });

  describe('Cmd/Ctrl+Shift+S: save screenshot', () => {
    it('calls handleScreenshot(false) when connected and not capturing', () => {
      const state = createMockState({
        sweetlinkConnected: true,
        capturing: false,
      });
      setupKeyboardShortcuts(state);

      const event = createKeyboardEvent('S', { metaKey: true, shiftKey: true });
      state.keydownHandler!(event);

      expect(state.handleScreenshot).toHaveBeenCalledWith(false);
    });

    it('does not trigger screenshot when not connected', () => {
      const state = createMockState({
        sweetlinkConnected: false,
        capturing: false,
      });
      setupKeyboardShortcuts(state);

      const event = createKeyboardEvent('S', { metaKey: true, shiftKey: true });
      state.keydownHandler!(event);

      expect(state.handleScreenshot).not.toHaveBeenCalled();
    });

    it('does not trigger screenshot when already capturing', () => {
      const state = createMockState({
        sweetlinkConnected: true,
        capturing: true,
      });
      setupKeyboardShortcuts(state);

      const event = createKeyboardEvent('S', { metaKey: true, shiftKey: true });
      state.keydownHandler!(event);

      expect(state.handleScreenshot).not.toHaveBeenCalled();
    });

    it('handles lowercase s', () => {
      const state = createMockState({
        sweetlinkConnected: true,
        capturing: false,
      });
      setupKeyboardShortcuts(state);

      const event = createKeyboardEvent('s', { metaKey: true, shiftKey: true });
      state.keydownHandler!(event);

      expect(state.handleScreenshot).toHaveBeenCalledWith(false);
    });
  });

  describe('Cmd/Ctrl+Shift+C: copy screenshot to clipboard', () => {
    it('calls handleScreenshot(true) when no text is selected', () => {
      const state = createMockState({
        capturing: false,
      });
      setupKeyboardShortcuts(state);

      // Mock getSelection to return empty selection
      vi.spyOn(window, 'getSelection').mockReturnValue({
        toString: () => '',
      } as any);

      const event = createKeyboardEvent('C', { metaKey: true, shiftKey: true });
      state.keydownHandler!(event);

      expect(state.handleScreenshot).toHaveBeenCalledWith(true);
    });

    it('does not trigger when text is selected (allows native copy)', () => {
      const state = createMockState({
        capturing: false,
      });
      setupKeyboardShortcuts(state);

      vi.spyOn(window, 'getSelection').mockReturnValue({
        toString: () => 'selected text',
      } as any);

      const event = createKeyboardEvent('C', { metaKey: true, shiftKey: true });
      state.keydownHandler!(event);

      expect(state.handleScreenshot).not.toHaveBeenCalled();
    });

    it('does not trigger when already capturing', () => {
      const state = createMockState({
        capturing: true,
      });
      setupKeyboardShortcuts(state);

      vi.spyOn(window, 'getSelection').mockReturnValue({
        toString: () => '',
      } as any);

      const event = createKeyboardEvent('C', { metaKey: true, shiftKey: true });
      state.keydownHandler!(event);

      expect(state.handleScreenshot).not.toHaveBeenCalled();
    });

    it('handles lowercase c', () => {
      const state = createMockState({
        capturing: false,
      });
      setupKeyboardShortcuts(state);

      vi.spyOn(window, 'getSelection').mockReturnValue({
        toString: () => '',
      } as any);

      const event = createKeyboardEvent('c', { metaKey: true, shiftKey: true });
      state.keydownHandler!(event);

      expect(state.handleScreenshot).toHaveBeenCalledWith(true);
    });
  });

  describe('unrelated keys', () => {
    it('does not react to regular key presses', () => {
      const state = createMockState();
      setupKeyboardShortcuts(state);

      state.keydownHandler!(createKeyboardEvent('a'));

      expect(state.render).not.toHaveBeenCalled();
      expect(state.toggleCompactMode).not.toHaveBeenCalled();
      expect(state.handleScreenshot).not.toHaveBeenCalled();
    });

    it('does not react to Cmd+S without Shift', () => {
      const state = createMockState({ sweetlinkConnected: true });
      setupKeyboardShortcuts(state);

      const event = createKeyboardEvent('S', { metaKey: true });
      state.keydownHandler!(event);

      expect(state.handleScreenshot).not.toHaveBeenCalled();
    });
  });
});
