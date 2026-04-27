/**
 * devbar Modals
 *
 * Modal creation utilities for the devbar UI.
 */

import {
  CSS_COLORS,
  DEVBAR_THEME,
  MODAL_BOX_BASE_STYLES,
  MODAL_OVERLAY_STYLES,
  withAlpha,
} from '../constants.js';
import { resolveSaveLocation } from '../settings.js';
import { createCloseButton, createStyledButton } from './buttons.js';

/**
 * Configuration for creating a modal
 */
export interface ModalConfig {
  color: string;
  title: string;
  onClose: () => void;
  /** When omitted, header renders only title + close button (minimal mode for confirm dialogs) */
  onCopyMd?: () => Promise<void>;
  onSave?: () => void;
  onClear?: () => void;
  sweetlinkConnected?: boolean;
  /** Save location preference: 'auto', 'local' (via sweetlink), or 'download' (browser) */
  saveLocation?: 'auto' | 'local' | 'download';
  /** Whether a save operation is in progress */
  isSaving?: boolean;
  /** Path where data was saved or download confirmation message */
  savedPath?: string | null;
  /** Agent-readable context that explains where this evidence came from */
  evidenceContext?: ModalEvidenceContext;
}

export interface ModalEvidenceContext {
  title?: string;
  items: Array<{ label: string; value: string }>;
  copyText?: string;
}

/**
 * Create modal overlay with click-outside-to-close behavior
 */
export function createModalOverlay(onClose: () => void): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.setAttribute('data-devbar', 'true');
  overlay.setAttribute('data-devbar-overlay', 'true');
  Object.assign(overlay.style, MODAL_OVERLAY_STYLES);
  overlay.onclick = (e) => {
    if (e.target === overlay) onClose();
  };
  return overlay;
}

/**
 * Create modal box with border and shadow.
 * Pass `ariaLabel` to give the dialog an accessible name so screen readers
 * announce its title — without it, axe flags the dialog as unnamed and SR
 * users hear "dialog" with no context.
 */
export function createModalBox(color: string, ariaLabel?: string): HTMLDivElement {
  const modal = document.createElement('div');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  if (ariaLabel) modal.setAttribute('aria-label', ariaLabel);
  modal.tabIndex = -1;
  Object.assign(modal.style, {
    ...MODAL_BOX_BASE_STYLES,
    border: `1px solid ${color}`,
    boxShadow: `${DEVBAR_THEME.shadows.dropXl}, 0 0 0 1px ${withAlpha(color, 20)}`,
  });
  return modal;
}

/**
 * Move focus to a modal once it's been added to the DOM. Uses queueMicrotask
 * so the focus happens after the current frame's append, when the element
 * is connected and focusable.
 */
export function focusModal(modal: HTMLElement): void {
  queueMicrotask(() => {
    try {
      modal.focus();
    } catch {
      /* element was removed before microtask ran */
    }
  });
}

/**
 * Create modal header with title, copy/save/close buttons
 */
export function createModalHeader(config: ModalConfig): HTMLDivElement {
  const {
    color,
    title,
    onClose,
    onCopyMd,
    onSave,
    onClear,
    sweetlinkConnected = false,
    saveLocation = 'auto',
    isSaving,
    savedPath,
    evidenceContext,
  } = config;
  const effectiveSave = resolveSaveLocation(saveLocation, sweetlinkConnected);

  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: `1px solid ${withAlpha(color, 25)}`,
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

  // Copy MD button (only in data modals, not confirm dialogs)
  if (onCopyMd) {
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
  }

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

  // Clear button
  if (onClear) {
    const clearBtn = createStyledButton({ color, text: 'Clear' });
    clearBtn.onclick = onClear;
    headerButtons.appendChild(clearBtn);
  }

  // Close button
  headerButtons.appendChild(createCloseButton(onClose));

  header.appendChild(headerButtons);

  // Show saved/downloaded confirmation below buttons
  if (savedPath) {
    const isDownloaded = savedPath.endsWith('downloaded');
    const savedConfirm = document.createElement('div');
    Object.assign(savedConfirm.style, {
      width: '100%',
      marginTop: '4px',
      padding: '8px 12px',
      backgroundColor: withAlpha(color, 8),
      border: `1px solid ${withAlpha(color, 19)}`,
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
      color: CSS_COLORS.textSecondary,
      fontFamily: 'monospace',
      fontSize: '0.6875rem',
      wordBreak: 'break-all',
    });
    pathText.textContent = isDownloaded ? 'Downloaded' : `Saved to ${savedPath}`;
    savedConfirm.appendChild(pathText);

    header.appendChild(savedConfirm);
  }

  if (evidenceContext) {
    header.appendChild(createEvidenceContextBox(color, evidenceContext));
  }

  return header;
}

function createEvidenceContextBox(
  color: string,
  evidenceContext: ModalEvidenceContext
): HTMLDivElement {
  const box = document.createElement('div');
  Object.assign(box.style, {
    width: '100%',
    marginTop: '4px',
    padding: '10px 12px',
    backgroundColor: withAlpha(color, 6),
    border: `1px solid ${withAlpha(color, 19)}`,
    borderRadius: '6px',
    display: 'grid',
    gap: '8px',
  });

  const topRow = document.createElement('div');
  Object.assign(topRow.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  });

  const title = document.createElement('span');
  Object.assign(title.style, {
    color,
    fontSize: '0.625rem',
    fontWeight: '600',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  });
  title.textContent = evidenceContext.title ?? 'Agent Context';
  topRow.appendChild(title);

  if (evidenceContext.copyText) {
    const copyBtn = createStyledButton({
      color,
      text: 'Copy Context',
      padding: '4px 8px',
      fontSize: '0.625rem',
    });
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(evidenceContext.copyText ?? '');
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy Context';
        }, 1500);
      } catch {
        copyBtn.textContent = 'Copy Failed';
        setTimeout(() => {
          copyBtn.textContent = 'Copy Context';
        }, 1500);
      }
    };
    topRow.appendChild(copyBtn);
  }

  box.appendChild(topRow);

  const itemGrid = document.createElement('div');
  Object.assign(itemGrid.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '6px 10px',
  });

  for (const item of evidenceContext.items) {
    const pair = document.createElement('div');
    Object.assign(pair.style, { minWidth: '0' });

    const label = document.createElement('div');
    Object.assign(label.style, {
      color: CSS_COLORS.textMuted,
      fontSize: '0.5625rem',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: '2px',
    });
    label.textContent = item.label;
    pair.appendChild(label);

    const value = document.createElement('div');
    Object.assign(value.style, {
      color: CSS_COLORS.textSecondary,
      fontFamily: 'monospace',
      fontSize: '0.625rem',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
    value.title = item.value;
    value.textContent = item.value;
    pair.appendChild(value);

    itemGrid.appendChild(pair);
  }

  box.appendChild(itemGrid);
  return box;
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
    color: CSS_COLORS.textMuted,
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
    backgroundColor: withAlpha(color, 8),
    border: `1px solid ${withAlpha(color, 25)}`,
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
    Object.assign(textEl.style, { color: CSS_COLORS.textSecondary });
    textEl.textContent = content;
    box.appendChild(textEl);
  } else {
    content.forEach((el) => box.appendChild(el));
  }

  return box;
}
