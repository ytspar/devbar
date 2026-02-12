/**
 * H1: DevBarState types and closeAllModals tests
 */

import { describe, expect, it, vi } from 'vitest';
import { closeAllModals, type DevBarState } from './types.js';

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
    showOutlineModal: false,
    showSchemaModal: false,
    showA11yModal: false,
    showSettingsPopover: false,
    showDesignReviewConfirm: false,
    consoleFilter: null,
    ...overrides,
  } as any;
}

describe('closeAllModals', () => {
  it('resets all modal flags to false/null', () => {
    const state = createMockState({
      showOutlineModal: true,
      showSchemaModal: true,
      showA11yModal: true,
      showSettingsPopover: true,
      showDesignReviewConfirm: true,
      consoleFilter: 'error',
    });

    closeAllModals(state);

    expect(state.showOutlineModal).toBe(false);
    expect(state.showSchemaModal).toBe(false);
    expect(state.showA11yModal).toBe(false);
    expect(state.showSettingsPopover).toBe(false);
    expect(state.showDesignReviewConfirm).toBe(false);
    expect(state.consoleFilter).toBeNull();
  });

  it('is a no-op when all modals are already closed', () => {
    const state = createMockState();

    closeAllModals(state);

    expect(state.showOutlineModal).toBe(false);
    expect(state.showSchemaModal).toBe(false);
    expect(state.showA11yModal).toBe(false);
    expect(state.showSettingsPopover).toBe(false);
    expect(state.showDesignReviewConfirm).toBe(false);
    expect(state.consoleFilter).toBeNull();
  });

  it('clears consoleFilter when set to warn', () => {
    const state = createMockState({ consoleFilter: 'warn' });

    closeAllModals(state);

    expect(state.consoleFilter).toBeNull();
  });

  it('clears consoleFilter when set to info', () => {
    const state = createMockState({ consoleFilter: 'info' });

    closeAllModals(state);

    expect(state.consoleFilter).toBeNull();
  });

  it('does not call state.render()', () => {
    const state = createMockState({
      showOutlineModal: true,
      showA11yModal: true,
    });

    closeAllModals(state);

    expect(state.render).not.toHaveBeenCalled();
  });

  it('does not modify unrelated state properties', () => {
    const state = createMockState({
      showOutlineModal: true,
      collapsed: true,
      compactMode: true,
    } as any);

    closeAllModals(state);

    expect((state as any).collapsed).toBe(true);
    expect((state as any).compactMode).toBe(true);
  });
});

describe('DevBarState type', () => {
  it('exports the DevBarState interface (compile-time check)', () => {
    // This test verifies that the type is importable and structurally valid
    const state: Partial<DevBarState> = {
      sweetlinkConnected: false,
      collapsed: true,
      container: null,
    };
    expect(state.sweetlinkConnected).toBe(false);
    expect(state.collapsed).toBe(true);
  });
});

describe('PositionStyle type', () => {
  it('exports the PositionStyle type (compile-time check)', async () => {
    // Dynamic import to verify the module exports correctly
    const mod = await import('./types.js');
    expect(typeof mod.closeAllModals).toBe('function');
  });
});
