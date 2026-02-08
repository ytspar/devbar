/**
 * Keyboard shortcut handling for DevBar.
 *
 * Extracted from GlobalDevBar to reduce file size.
 */

import type { DevBarState } from './types.js';

/**
 * Setup keyboard shortcuts for the DevBar.
 * - Escape: close modals/popovers
 * - Cmd/Ctrl+Shift+M: toggle compact mode
 * - Cmd/Ctrl+Shift+S: save screenshot
 * - Cmd/Ctrl+Shift+C: copy screenshot to clipboard
 */
export function setupKeyboardShortcuts(state: DevBarState): void {
  state.keydownHandler = (e: KeyboardEvent) => {
    // Close modals/popovers on Escape
    if (e.key === 'Escape') {
      if (state.showSettingsPopover) {
        state.showSettingsPopover = false;
        state.render();
        return;
      }
      if (
        state.consoleFilter ||
        state.showOutlineModal ||
        state.showSchemaModal ||
        state.showDesignReviewConfirm
      ) {
        state.consoleFilter = null;
        state.showOutlineModal = false;
        state.showSchemaModal = false;
        state.showDesignReviewConfirm = false;
        state.render();
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
      // Cmd/Ctrl+Shift+M: Toggle compact mode
      if (e.key === 'M' || e.key === 'm') {
        e.preventDefault();
        state.toggleCompactMode();
        return;
      }
      if (e.key === 'S' || e.key === 's') {
        e.preventDefault();
        if (state.sweetlinkConnected && !state.capturing) {
          state.handleScreenshot(false);
        }
      } else if (e.key === 'C' || e.key === 'c') {
        const selection = window.getSelection();
        if (!selection || selection.toString().length === 0) {
          e.preventDefault();
          if (!state.capturing) {
            state.handleScreenshot(true);
          }
        }
      }
    }
  };
  window.addEventListener('keydown', state.keydownHandler);
}
