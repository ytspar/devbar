/**
 * Rendering: renderCollapsed, renderCompact, renderExpanded, renderOverlays,
 * console popups, modals, settings popover, and all DOM-creation UI code.
 *
 * Extracted from GlobalDevBar to reduce file size.
 * Split into sub-modules for maintainability; this barrel re-exports the
 * public `render` function so external import paths remain unchanged.
 */

import type { ConsoleCapture } from '@ytspar/sweetlink/browser/consoleCapture';
import { clearAllTooltips } from '../tooltips.js';
import { closeAllModals, type DevBarState } from '../types.js';
import { renderCollapsed } from './collapsed.js';
import { renderCompact } from './compact.js';
import { renderConsolePopup } from './console.js';
import { renderExpanded } from './expanded.js';
import { renderDesignReviewConfirmModal, renderA11yModal, renderOutlineModal, renderSchemaModal } from './modals.js';
import { renderSettingsPopover } from './settings.js';
import { renderGuard, setRenderGuard } from './common.js';

function renderOverlays(state: DevBarState, consoleCaptureSingleton: ConsoleCapture): void {
  // Safety: only one overlay at a time. First match wins; close the rest.
  // (Overlay cleanup already performed by render() before calling this.)
  if (state.consoleFilter) {
    const filter = state.consoleFilter;
    closeAllModals(state);
    state.consoleFilter = filter;
    renderConsolePopup(state, consoleCaptureSingleton);
  } else if (state.showOutlineModal) {
    closeAllModals(state);
    state.showOutlineModal = true;
    renderOutlineModal(state);
  } else if (state.showSchemaModal) {
    closeAllModals(state);
    state.showSchemaModal = true;
    renderSchemaModal(state);
  } else if (state.showA11yModal) {
    closeAllModals(state);
    state.showA11yModal = true;
    renderA11yModal(state);
  } else if (state.showDesignReviewConfirm) {
    closeAllModals(state);
    state.showDesignReviewConfirm = true;
    renderDesignReviewConfirmModal(state);
  } else if (state.showSettingsPopover) {
    closeAllModals(state);
    state.showSettingsPopover = true;
    renderSettingsPopover(state);
  }
}

/**
 * Main render dispatch - creates container and delegates to appropriate renderer.
 */
export function render(
  state: DevBarState,
  consoleCaptureSingleton: ConsoleCapture,
  customControls: {
    id: string;
    label: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    variant?: 'default' | 'warning';
  }[]
): void {
  if (state.destroyed) return;
  if (typeof document === 'undefined') return;
  if (renderGuard) return;
  setRenderGuard(true);

  // Clear any orphaned tooltips from previous render
  clearAllTooltips(state);

  // Remove existing overlay if any (modals append to body, need explicit cleanup)
  if (state.overlayElement) {
    state.overlayElement.remove();
    state.overlayElement = null;
    document.body.style.overflow = '';
  }

  // Remove existing container if any
  if (state.container) {
    state.container.remove();
  }

  // Create new container and append immediately so the devbar stays visible
  // even if content or overlay rendering throws
  state.container = document.createElement('div');
  state.container.setAttribute('data-devbar', 'true');
  state.container.setAttribute('role', 'toolbar');
  state.container.setAttribute('aria-label', 'DevBar');
  document.body.appendChild(state.container);

  try {
    if (state.collapsed) {
      renderCollapsed(state);
    } else if (state.compactMode) {
      renderCompact(state);
    } else {
      renderExpanded(state, customControls);
    }
  } catch (e) {
    console.error('[GlobalDevBar] Render failed:', e);
  }

  try {
    renderOverlays(state, consoleCaptureSingleton);
  } catch (e) {
    console.error('[GlobalDevBar] Overlay render failed:', e);
  }

  // Lock body scroll while a modal overlay is open
  if (state.overlayElement) {
    document.body.style.overflow = 'hidden';
  }

  setRenderGuard(false);
}
