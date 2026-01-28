/**
 * DevBar Modals
 *
 * Modal creation utilities for the DevBar UI.
 */

import { MODAL_OVERLAY_STYLES, MODAL_BOX_BASE_STYLES } from '../constants.js';
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
  const { color, title, onClose, onCopyMd, onSave, sweetlinkConnected } = config;

  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: `1px solid ${color}40`,
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
  Object.assign(headerButtons.style, { display: 'flex', gap: '10px' });

  // Copy MD button
  const copyBtn = createStyledButton({ color, text: 'Copy MD' });
  copyBtn.onclick = async () => {
    try {
      await onCopyMd();
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy MD'; }, 1500);
    } catch {
      console.error('[GlobalDevBar] Failed to copy to clipboard');
    }
  };
  headerButtons.appendChild(copyBtn);

  // Save button (if Sweetlink connected)
  if (sweetlinkConnected && onSave) {
    const saveBtn = createStyledButton({ color, text: 'Save' });
    saveBtn.onclick = onSave;
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
 * Create a styled text element with common patterns
 */
export function createStyledText(
  text: string,
  styles: Partial<CSSStyleDeclaration>
): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, styles);
  el.textContent = text;
  return el;
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
    content.forEach(el => box.appendChild(el));
  }

  return box;
}
