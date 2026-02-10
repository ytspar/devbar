/**
 * devbar Modals
 *
 * Modal creation utilities for the devbar UI.
 */

import { MODAL_BOX_BASE_STYLES, MODAL_OVERLAY_STYLES } from '../constants.js';
import { resolveSaveLocation } from '../settings.js';
import { createStyledButton } from './buttons.js';

/**
 * Configuration for creating a modal
 */
export interface ModalConfig {
  color: string;
  title: string;
  onClose: () => void;
  onCopyMd: () => Promise<void>;
  onSave?: () => void;
  sweetlinkConnected: boolean;
  /** Save location preference: 'auto', 'local' (via sweetlink), or 'download' (browser) */
  saveLocation?: 'auto' | 'local' | 'download';
  /** Whether a save operation is in progress */
  isSaving?: boolean;
  /** Path where data was saved or download confirmation message */
  savedPath?: string | null;
}

/**
 * Create modal overlay with click-outside-to-close behavior
 */
export function createModalOverlay(onClose: () => void): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.setAttribute('data-devbar', 'true');
  Object.assign(overlay.style, MODAL_OVERLAY_STYLES);
  overlay.onclick = (e) => {
    if (e.target === overlay) onClose();
  };
  return overlay;
}

/**
 * Create modal box with border and shadow
 */
export function createModalBox(color: string): HTMLDivElement {
  const modal = document.createElement('div');
  Object.assign(modal.style, {
    ...MODAL_BOX_BASE_STYLES,
    border: `1px solid ${color}`,
    boxShadow: `0 20px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px ${color}33`,
  });
  return modal;
}

/**
 * Create modal header with title, copy/save/close buttons
 */
export function createModalHeader(config: ModalConfig): HTMLDivElement {
  const { color, title, onClose, onCopyMd, onSave, sweetlinkConnected, saveLocation = 'auto', isSaving, savedPath } =
    config;
  const effectiveSave = resolveSaveLocation(saveLocation, sweetlinkConnected);

  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: `1px solid ${color}40`,
    flexWrap: 'wrap',
    gap: '8px',
  });

  const titleEl = document.createElement('h2');
  Object.assign(titleEl.style, {
    color,
    fontSize: '1rem',
    fontWeight: '600',
    margin: '0',
  });
  titleEl.textContent = title;
  header.appendChild(titleEl);

  const headerButtons = document.createElement('div');
  Object.assign(headerButtons.style, { display: 'flex', gap: '10px', alignItems: 'center' });

  // Copy MD button
  const copyBtn = createStyledButton({ color, text: 'Copy MD' });
  copyBtn.onclick = async () => {
    try {
      await onCopyMd();
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = 'Copy MD';
      }, 1500);
    } catch {
      console.error('[GlobalDevBar] Failed to copy to clipboard');
    }
  };
  headerButtons.appendChild(copyBtn);

  // Save/Download button
  if (onSave) {
    // 'local' requires connection; 'auto' and 'download' always have a working method
    const canSave = effectiveSave === 'download' || sweetlinkConnected;

    let buttonText: string;
    if (isSaving) {
      buttonText = effectiveSave === 'local' ? 'Saving...' : 'Downloading...';
    } else {
      buttonText = effectiveSave === 'local' ? 'Save' : 'Download';
    }

    const saveBtn = createStyledButton({ color, text: buttonText });

    if (isSaving || !canSave) {
      saveBtn.style.opacity = '0.6';
      saveBtn.style.cursor = 'not-allowed';
      if (!canSave) {
        saveBtn.title = 'Sweetlink not connected. Switch save method to Auto or Download.';
      }
    } else {
      saveBtn.onclick = onSave;
    }

    headerButtons.appendChild(saveBtn);
  }

  // Close button - use same padding as other buttons for consistent height
  const closeBtn = createStyledButton({
    color,
    text: '×',
    padding: '6px 10px',
    fontSize: '0.875rem',
  });
  closeBtn.onclick = onClose;
  headerButtons.appendChild(closeBtn);

  header.appendChild(headerButtons);

  // Show saved/downloaded confirmation below buttons
  if (savedPath) {
    const isDownloaded = savedPath.endsWith('downloaded');
    const savedConfirm = document.createElement('div');
    Object.assign(savedConfirm.style, {
      width: '100%',
      marginTop: '4px',
      padding: '8px 12px',
      backgroundColor: `${color}15`,
      border: `1px solid ${color}30`,
      borderRadius: '6px',
      fontSize: '0.75rem',
      color: color,
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    });

    // Checkmark icon
    const checkmark = document.createElement('span');
    checkmark.textContent = '\u2713';
    Object.assign(checkmark.style, { fontWeight: '600' });
    savedConfirm.appendChild(checkmark);

    // Path/status text
    const pathText = document.createElement('span');
    Object.assign(pathText.style, {
      color: '#9ca3af',
      fontFamily: 'monospace',
      fontSize: '0.6875rem',
      wordBreak: 'break-all',
    });
    pathText.textContent = isDownloaded ? 'Downloaded' : `Saved to ${savedPath}`;
    savedConfirm.appendChild(pathText);

    header.appendChild(savedConfirm);
  }

  return header;
}

/**
 * Create modal content container
 */
export function createModalContent(): HTMLDivElement {
  const content = document.createElement('div');
  Object.assign(content.style, {
    flex: '1',
    overflow: 'auto',
    padding: '16px 20px',
  });
  return content;
}

/**
 * Create empty state message for modals
 */
export function createEmptyMessage(text: string): HTMLDivElement {
  const emptyMsg = document.createElement('div');
  Object.assign(emptyMsg.style, {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: '0.875rem',
    padding: '40px',
  });
  emptyMsg.textContent = text;
  return emptyMsg;
}

/**
 * Create a colored info box (for error states, cost estimates, etc.)
 */
export function createInfoBox(
  color: string,
  title: string,
  content: string | HTMLElement[]
): HTMLDivElement {
  const box = document.createElement('div');
  Object.assign(box.style, {
    backgroundColor: `${color}15`,
    border: `1px solid ${color}40`,
    borderRadius: '8px',
    padding: '14px',
    marginBottom: '16px',
  });

  const titleEl = document.createElement('div');
  Object.assign(titleEl.style, {
    color,
    fontWeight: '600',
    marginBottom: '8px',
  });
  titleEl.textContent = title;
  box.appendChild(titleEl);

  if (typeof content === 'string') {
    const textEl = document.createElement('div');
    Object.assign(textEl.style, { color: '#94a3b8' });
    textEl.textContent = content;
    box.appendChild(textEl);
  } else {
    content.forEach((el) => box.appendChild(el));
  }

  return box;
}
