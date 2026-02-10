/**
 * Modals UI tests
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyMessage,
  createInfoBox,
  createModalBox,
  createModalContent,
  createModalHeader,
  createModalOverlay,
} from './modals.js';

describe('createModalOverlay', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('creates a div with data-devbar attribute', () => {
    const overlay = createModalOverlay(() => {});
    expect(overlay.tagName).toBe('DIV');
    expect(overlay.getAttribute('data-devbar')).toBe('true');
  });

  it('applies fixed positioning overlay styles', () => {
    const overlay = createModalOverlay(() => {});
    expect(overlay.style.position).toBe('fixed');
    // happy-dom normalizes '0' to '0px' for length properties
    expect(overlay.style.top).toBe('0px');
    expect(overlay.style.left).toBe('0px');
    expect(overlay.style.right).toBe('0px');
    expect(overlay.style.bottom).toBe('0px');
    expect(overlay.style.zIndex).toBe('10002');
    expect(overlay.style.display).toBe('flex');
    expect(overlay.style.alignItems).toBe('center');
    expect(overlay.style.justifyContent).toBe('center');
  });

  it('calls onClose when clicking directly on the overlay', () => {
    const onClose = vi.fn();
    const overlay = createModalOverlay(onClose);

    // Click on the overlay itself
    overlay.onclick!({ target: overlay } as any);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking on a child element', () => {
    const onClose = vi.fn();
    const overlay = createModalOverlay(onClose);
    const child = document.createElement('div');
    overlay.appendChild(child);

    // Click on a child element
    overlay.onclick!({ target: child } as any);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('createModalBox', () => {
  it('creates a styled div with border and shadow', () => {
    const modal = createModalBox('#10b981');

    expect(modal.tagName).toBe('DIV');
    expect(modal.style.border).toBe('1px solid #10b981');
    expect(modal.style.borderRadius).toBe('12px');
    expect(modal.style.maxWidth).toBe('700px');
    expect(modal.style.width).toBe('90%');
    expect(modal.style.maxHeight).toBe('80vh');
    expect(modal.style.display).toBe('flex');
    expect(modal.style.flexDirection).toBe('column');
  });

  it('uses the provided color for border', () => {
    const modal = createModalBox('#ef4444');
    expect(modal.style.border).toBe('1px solid #ef4444');
  });

  it('includes box shadow with the color', () => {
    const modal = createModalBox('#3b82f6');
    expect(modal.style.boxShadow).toContain('#3b82f6');
  });
});

describe('createModalHeader', () => {
  it('creates a header with title', () => {
    const header = createModalHeader({
      color: '#10b981',
      title: 'Test Modal',
      onClose: vi.fn(),
      onCopyMd: vi.fn().mockResolvedValue(undefined),
      sweetlinkConnected: false,
    });

    expect(header.tagName).toBe('DIV');
    const titleEl = header.querySelector('h2');
    expect(titleEl).not.toBeNull();
    expect(titleEl!.textContent).toBe('Test Modal');
    expect(titleEl!.style.color).toBe('#10b981');
  });

  it('includes a Copy MD button', () => {
    const header = createModalHeader({
      color: '#10b981',
      title: 'Title',
      onClose: vi.fn(),
      onCopyMd: vi.fn().mockResolvedValue(undefined),
      sweetlinkConnected: false,
    });

    const buttons = header.querySelectorAll('button');
    const copyBtn = Array.from(buttons).find((btn) => btn.textContent === 'Copy MD');
    expect(copyBtn).toBeTruthy();
  });

  it('includes a close button with X character', () => {
    const onClose = vi.fn();
    const header = createModalHeader({
      color: '#10b981',
      title: 'Title',
      onClose,
      onCopyMd: vi.fn().mockResolvedValue(undefined),
      sweetlinkConnected: false,
    });

    const buttons = header.querySelectorAll('button');
    const closeBtn = Array.from(buttons).find((btn) =>
      btn.textContent === '\u00d7' || btn.textContent === '×'
    );
    expect(closeBtn).toBeTruthy();
    closeBtn!.click();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows Save button when sweetlinkConnected and saveLocation is local', () => {
    const onSave = vi.fn();
    const header = createModalHeader({
      color: '#10b981',
      title: 'Title',
      onClose: vi.fn(),
      onCopyMd: vi.fn().mockResolvedValue(undefined),
      onSave,
      sweetlinkConnected: true,
      saveLocation: 'local',
    });

    const buttons = header.querySelectorAll('button');
    const saveBtn = Array.from(buttons).find((btn) => btn.textContent === 'Save');
    expect(saveBtn).toBeTruthy();
    saveBtn!.click();
    expect(onSave).toHaveBeenCalled();
  });

  it('shows Download button when saveLocation is download', () => {
    const onSave = vi.fn();
    const header = createModalHeader({
      color: '#10b981',
      title: 'Title',
      onClose: vi.fn(),
      onCopyMd: vi.fn().mockResolvedValue(undefined),
      onSave,
      sweetlinkConnected: false,
      saveLocation: 'download',
    });

    const buttons = header.querySelectorAll('button');
    const downloadBtn = Array.from(buttons).find((btn) => btn.textContent === 'Download');
    expect(downloadBtn).toBeTruthy();
    downloadBtn!.click();
    expect(onSave).toHaveBeenCalled();
  });

  it('shows Save button when auto and connected', () => {
    const onSave = vi.fn();
    const header = createModalHeader({
      color: '#10b981',
      title: 'Title',
      onClose: vi.fn(),
      onCopyMd: vi.fn().mockResolvedValue(undefined),
      onSave,
      sweetlinkConnected: true,
      saveLocation: 'auto',
    });

    const buttons = header.querySelectorAll('button');
    const saveBtn = Array.from(buttons).find((btn) => btn.textContent === 'Save');
    expect(saveBtn).toBeTruthy();
    saveBtn!.click();
    expect(onSave).toHaveBeenCalled();
  });

  it('shows Download button when auto and not connected', () => {
    const onSave = vi.fn();
    const header = createModalHeader({
      color: '#10b981',
      title: 'Title',
      onClose: vi.fn(),
      onCopyMd: vi.fn().mockResolvedValue(undefined),
      onSave,
      sweetlinkConnected: false,
      saveLocation: 'auto',
    });

    const buttons = header.querySelectorAll('button');
    const downloadBtn = Array.from(buttons).find((btn) => btn.textContent === 'Download');
    expect(downloadBtn).toBeTruthy();
    downloadBtn!.click();
    expect(onSave).toHaveBeenCalled();
  });

  it('disables Save button when saveLocation is local and not connected', () => {
    const header = createModalHeader({
      color: '#10b981',
      title: 'Title',
      onClose: vi.fn(),
      onCopyMd: vi.fn().mockResolvedValue(undefined),
      onSave: vi.fn(),
      sweetlinkConnected: false,
      saveLocation: 'local',
    });

    const buttons = header.querySelectorAll('button');
    const saveBtn = Array.from(buttons).find((btn) => btn.textContent === 'Save');
    expect(saveBtn).toBeTruthy();
    expect(saveBtn!.style.opacity).toBe('0.6');
    expect(saveBtn!.style.cursor).toBe('not-allowed');
  });

  it('shows "Saving..." text and disables button when isSaving with local', () => {
    const header = createModalHeader({
      color: '#10b981',
      title: 'Title',
      onClose: vi.fn(),
      onCopyMd: vi.fn().mockResolvedValue(undefined),
      onSave: vi.fn(),
      sweetlinkConnected: true,
      saveLocation: 'local',
      isSaving: true,
    });

    const buttons = header.querySelectorAll('button');
    const savingBtn = Array.from(buttons).find((btn) => btn.textContent === 'Saving...');
    expect(savingBtn).toBeTruthy();
    expect(savingBtn!.style.opacity).toBe('0.6');
    expect(savingBtn!.style.cursor).toBe('not-allowed');
  });

  it('shows "Downloading..." text when isSaving with download', () => {
    const header = createModalHeader({
      color: '#10b981',
      title: 'Title',
      onClose: vi.fn(),
      onCopyMd: vi.fn().mockResolvedValue(undefined),
      onSave: vi.fn(),
      sweetlinkConnected: false,
      saveLocation: 'download',
      isSaving: true,
    });

    const buttons = header.querySelectorAll('button');
    const downloadingBtn = Array.from(buttons).find((btn) => btn.textContent === 'Downloading...');
    expect(downloadingBtn).toBeTruthy();
  });

  it('shows saved path confirmation when savedPath is provided', () => {
    const header = createModalHeader({
      color: '#10b981',
      title: 'Title',
      onClose: vi.fn(),
      onCopyMd: vi.fn().mockResolvedValue(undefined),
      sweetlinkConnected: true,
      savedPath: '/project/outline.md',
    });

    expect(header.textContent).toContain('Saved to /project/outline.md');
  });

  it('shows Downloaded confirmation when savedPath ends with "downloaded"', () => {
    const header = createModalHeader({
      color: '#10b981',
      title: 'Title',
      onClose: vi.fn(),
      onCopyMd: vi.fn().mockResolvedValue(undefined),
      sweetlinkConnected: false,
      savedPath: 'outline downloaded',
    });

    expect(header.textContent).toContain('Downloaded');
    expect(header.textContent).not.toContain('Saved to');
  });

  it('does not show saved confirmation when no savedPath', () => {
    const header = createModalHeader({
      color: '#10b981',
      title: 'Title',
      onClose: vi.fn(),
      onCopyMd: vi.fn().mockResolvedValue(undefined),
      sweetlinkConnected: false,
    });

    expect(header.textContent).not.toContain('Saved to');
  });

  it('Copy MD button calls onCopyMd handler', async () => {
    const onCopyMd = vi.fn().mockResolvedValue(undefined);
    const header = createModalHeader({
      color: '#10b981',
      title: 'Title',
      onClose: vi.fn(),
      onCopyMd,
      sweetlinkConnected: false,
    });

    const buttons = header.querySelectorAll('button');
    const copyBtn = Array.from(buttons).find((btn) => btn.textContent === 'Copy MD')!;

    // Trigger the click handler
    copyBtn.click();

    // Flush microtasks so the async onclick resolves
    await new Promise((r) => setTimeout(r, 0));

    expect(onCopyMd).toHaveBeenCalledTimes(1);
  });
});

describe('createModalContent', () => {
  it('creates a content div with proper styles', () => {
    const content = createModalContent();

    expect(content.tagName).toBe('DIV');
    // happy-dom normalizes flex: '1' to the shorthand '1 1 0%'
    expect(content.style.flex).toBe('1 1 0%');
    expect(content.style.overflow).toBe('auto');
    expect(content.style.padding).toBe('16px 20px');
  });
});

describe('createEmptyMessage', () => {
  it('creates a centered message element', () => {
    const msg = createEmptyMessage('No data found');

    expect(msg.tagName).toBe('DIV');
    expect(msg.textContent).toBe('No data found');
    expect(msg.style.textAlign).toBe('center');
    expect(msg.style.padding).toBe('40px');
    expect(msg.style.fontSize).toBe('0.875rem');
  });

  it('uses gray text color', () => {
    const msg = createEmptyMessage('Empty');
    expect(msg.style.color).toBe('#6b7280');
  });
});

describe('createInfoBox', () => {
  it('creates an info box with title and string content', () => {
    const box = createInfoBox('#3b82f6', 'Information', 'Some details here');

    expect(box.tagName).toBe('DIV');
    expect(box.style.borderRadius).toBe('8px');
    expect(box.style.padding).toBe('14px');
    expect(box.style.marginBottom).toBe('16px');

    // Title
    const titleEl = box.children[0] as HTMLElement;
    expect(titleEl.textContent).toBe('Information');
    expect(titleEl.style.color).toBe('#3b82f6');
    expect(titleEl.style.fontWeight).toBe('600');

    // Content text
    const contentEl = box.children[1] as HTMLElement;
    expect(contentEl.textContent).toBe('Some details here');
    expect(contentEl.style.color).toBe('#94a3b8');
  });

  it('creates an info box with HTML element content', () => {
    const el1 = document.createElement('span');
    el1.textContent = 'Element 1';
    const el2 = document.createElement('span');
    el2.textContent = 'Element 2';

    const box = createInfoBox('#ef4444', 'Error', [el1, el2]);

    // Title + 2 child elements
    expect(box.children.length).toBe(3);
    expect(box.children[1].textContent).toBe('Element 1');
    expect(box.children[2].textContent).toBe('Element 2');
  });

  it('applies color-tinted background and border', () => {
    const box = createInfoBox('#10b981', 'Title', 'Content');

    expect(box.style.backgroundColor).toContain('#10b981');
    expect(box.style.border).toContain('#10b981');
  });
});
