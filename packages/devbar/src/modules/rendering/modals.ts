/**
 * Modal rendering for the DevBar: outline, schema, a11y, and design review modals.
 */

import { BUTTON_COLORS, CATEGORY_COLORS, CSS_COLORS, FONT_MONO, withAlpha } from '../../constants.js';
import { extractDocumentOutline, outlineToMarkdown } from '../../outline.js';
import { checkMissingTags, extractFavicons, extractPageSchema, isImageKey, schemaToMarkdown } from '../../schema.js';
import type { OutlineNode } from '../../types.js';
import {
  createEmptyMessage,
  createInfoBox,
  createModalBox,
  createModalContent,
  createModalHeader,
  createModalOverlay,
  createStyledButton,
} from '../../ui/index.js';
import {
  a11yToMarkdown,
  runA11yAudit,
  groupViolationsByImpact,
  getImpactColor,
  getViolationCounts,
} from '../../accessibility.js';
import type { AxeViolation } from '../../accessibility.js';
import {
  calculateCostEstimate,
  closeDesignReviewConfirm,
  handleSaveA11yAudit,
  handleSaveOutline,
  handleSaveSchema,
  proceedWithDesignReview,
} from '../screenshot.js';
import type { DevBarState } from '../types.js';
import { clearChildren } from './common.js';

// ============================================================================
// Outline Modal
// ============================================================================

export function renderOutlineModal(state: DevBarState): void {
  const outline = extractDocumentOutline();
  const color = BUTTON_COLORS.outline;

  const closeModal = () => {
    state.showOutlineModal = false;
    state.render();
  };

  const overlay = createModalOverlay(closeModal);
  const modal = createModalBox(color);

  const header = createModalHeader({
    color,
    title: 'Document Outline',
    onClose: closeModal,
    onCopyMd: async () => {
      const markdown = outlineToMarkdown(outline);
      await navigator.clipboard.writeText(markdown);
    },
    onSave: () => handleSaveOutline(state),
    sweetlinkConnected: state.sweetlinkConnected,
    saveLocation: state.options.saveLocation,
    isSaving: state.savingOutline,
    savedPath: state.lastOutline,
  });
  modal.appendChild(header);

  const content = createModalContent();

  if (outline.length === 0) {
    content.appendChild(createEmptyMessage('No semantic elements found in this document'));
  } else {
    renderOutlineNodes(outline, content, 0, { lastHeadingLevel: 0 });
  }

  modal.appendChild(content);
  overlay.appendChild(modal);

  state.overlayElement = overlay;
  document.body.appendChild(overlay);
}

function renderOutlineNodes(
  nodes: OutlineNode[],
  parentEl: HTMLElement,
  depth: number,
  headingTracker: { lastHeadingLevel: number }
): void {
  for (const node of nodes) {
    const isHeading = node.category === 'heading' && node.level > 0;
    const skippedLevel = isHeading && node.level > headingTracker.lastHeadingLevel + 1;

    if (isHeading) {
      headingTracker.lastHeadingLevel = node.level;
    }

    const nodeEl = document.createElement('div');
    Object.assign(nodeEl.style, {
      padding: `4px 0 4px ${depth * 16}px`,
    });

    // Warning icon for heading hierarchy breaks
    if (skippedLevel) {
      const warn = document.createElement('span');
      Object.assign(warn.style, {
        color: CSS_COLORS.error,
        fontSize: '0.625rem',
        marginRight: '4px',
      });
      warn.textContent = '\u26A0';
      warn.title = `Heading level skipped (expected h${node.level - 1} or higher before h${node.level})`;
      nodeEl.appendChild(warn);
    }

    const tagSpan = document.createElement('span');
    const categoryColor = CATEGORY_COLORS[node.category || 'other'] || CATEGORY_COLORS.other;
    Object.assign(tagSpan.style, {
      color: skippedLevel ? CSS_COLORS.error : categoryColor,
      fontSize: '0.6875rem',
      fontWeight: '500',
    });
    tagSpan.textContent = `<${node.tagName}>`;
    nodeEl.appendChild(tagSpan);

    if (node.category) {
      const categorySpan = document.createElement('span');
      Object.assign(categorySpan.style, {
        color: CSS_COLORS.textMuted,
        fontSize: '0.625rem',
        marginLeft: '6px',
      });
      categorySpan.textContent = `[${node.category}]`;
      nodeEl.appendChild(categorySpan);
    }

    const textSpan = document.createElement('span');
    Object.assign(textSpan.style, {
      color: '#d1d5db',
      fontSize: '0.6875rem',
      marginLeft: '8px',
    });
    const truncatedText = node.text.length > 60 ? `${node.text.slice(0, 60)}...` : node.text;
    textSpan.textContent = truncatedText;
    nodeEl.appendChild(textSpan);

    if (node.id) {
      const idSpan = document.createElement('span');
      Object.assign(idSpan.style, {
        color: CSS_COLORS.textSecondary,
        fontSize: '0.625rem',
        marginLeft: '6px',
      });
      idSpan.textContent = `#${node.id}`;
      nodeEl.appendChild(idSpan);
    }

    parentEl.appendChild(nodeEl);

    if (node.children.length > 0) {
      renderOutlineNodes(node.children, parentEl, depth + 1, headingTracker);
    }
  }
}

// ============================================================================
// Schema Modal
// ============================================================================

export function renderSchemaModal(state: DevBarState): void {
  const schema = extractPageSchema();
  const color = BUTTON_COLORS.schema;

  const closeModal = () => {
    state.showSchemaModal = false;
    state.render();
  };

  const overlay = createModalOverlay(closeModal);
  const modal = createModalBox(color);

  const missingTags = checkMissingTags(schema);
  const favicons = extractFavicons();

  const header = createModalHeader({
    color,
    title: 'Page Schema',
    onClose: closeModal,
    onCopyMd: async () => {
      const markdown = schemaToMarkdown(schema, { missingTags, favicons });
      await navigator.clipboard.writeText(markdown);
    },
    onSave: () => handleSaveSchema(state),
    sweetlinkConnected: state.sweetlinkConnected,
    saveLocation: state.options.saveLocation,
    isSaving: state.savingSchema,
    savedPath: state.lastSchema,
  });
  modal.appendChild(header);

  const content = createModalContent();

  const hasContent =
    schema.jsonLd.length > 0 ||
    Object.keys(schema.openGraph).length > 0 ||
    Object.keys(schema.twitter).length > 0 ||
    Object.keys(schema.metaTags).length > 0 ||
    favicons.length > 0 ||
    missingTags.length > 0;

  if (!hasContent) {
    content.appendChild(createEmptyMessage('No structured data found on this page'));
  } else {
    if (missingTags.length > 0) renderMissingTagsSection(content, missingTags);
    renderSchemaSection(content, 'Open Graph', schema.openGraph, CSS_COLORS.info);
    renderSchemaSection(content, 'Twitter Cards', schema.twitter, CSS_COLORS.cyan);
    if (favicons.length > 0) renderFaviconsSection(content, favicons);
    renderSchemaSection(content, 'JSON-LD', schema.jsonLd, color);
    renderSchemaSection(content, 'Meta Tags', schema.metaTags, CSS_COLORS.textMuted);
  }

  modal.appendChild(content);
  overlay.appendChild(modal);

  state.overlayElement = overlay;
  document.body.appendChild(overlay);
}

function renderSchemaSectionHeader(
  section: HTMLElement,
  title: string,
  color: string,
  count: number
): void {
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '10px',
    paddingBottom: '6px',
    borderBottom: `1px solid ${withAlpha(color, 19)}`,
  });

  const titleEl = document.createElement('h3');
  Object.assign(titleEl.style, {
    color,
    fontSize: '0.8125rem',
    fontWeight: '600',
    margin: '0',
  });
  titleEl.textContent = title;
  header.appendChild(titleEl);

  const badge = document.createElement('span');
  Object.assign(badge.style, {
    color: withAlpha(color, 80),
    fontSize: '0.5625rem',
    backgroundColor: withAlpha(color, 9),
    padding: '1px 6px',
    borderRadius: '8px',
    letterSpacing: '0.03em',
  });
  badge.textContent = String(count);
  header.appendChild(badge);

  section.appendChild(header);
}

function renderSchemaSection(
  container: HTMLElement,
  title: string,
  items: Record<string, string> | unknown[],
  color: string
): void {
  const count = Array.isArray(items) ? items.length : Object.keys(items).length;
  if (count === 0) return;

  const section = document.createElement('div');
  section.style.marginBottom = '20px';

  renderSchemaSectionHeader(section, title, color, count);

  if (Array.isArray(items)) {
    renderJsonLdItems(section, items, color);
  } else {
    renderKeyValueItems(section, items);
  }

  container.appendChild(section);
}

function renderJsonLdItems(container: HTMLElement, items: unknown[], color: string): void {
  items.forEach((item, i) => {
    const itemEl = document.createElement('div');
    itemEl.style.marginBottom = '10px';

    // Extract @type for a meaningful label
    const typed = item as Record<string, unknown>;
    const schemaType = typeof typed?.['@type'] === 'string' ? typed['@type'] : null;

    const itemHeader = document.createElement('div');
    Object.assign(itemHeader.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      marginBottom: '4px',
    });

    const itemTitle = document.createElement('span');
    Object.assign(itemTitle.style, {
      color: CSS_COLORS.textSecondary,
      fontSize: '0.6875rem',
    });
    itemTitle.textContent = `Schema ${i + 1}`;
    itemHeader.appendChild(itemTitle);

    if (schemaType) {
      const typeTag = document.createElement('span');
      Object.assign(typeTag.style, {
        color: withAlpha(color, 80),
        fontSize: '0.5625rem',
        backgroundColor: withAlpha(color, 8),
        border: `1px solid ${withAlpha(color, 15)}`,
        padding: '0 5px',
        borderRadius: '3px',
      });
      typeTag.textContent = schemaType;
      itemHeader.appendChild(typeTag);
    }

    itemEl.appendChild(itemHeader);

    const codeEl = document.createElement('pre');
    Object.assign(codeEl.style, {
      backgroundColor: 'rgba(0, 0, 0, 0.25)',
      borderRadius: '4px',
      borderLeft: `2px solid ${withAlpha(color, 31)}`,
      padding: '10px 10px 10px 12px',
      fontSize: '0.625rem',
      margin: '0',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    });
    appendHighlightedJson(codeEl, JSON.stringify(item, null, 2));
    itemEl.appendChild(codeEl);

    container.appendChild(itemEl);
  });
}

function appendHighlightedJson(container: HTMLElement, json: string): void {
  // Color map for different token types
  const colors: Record<string, string> = {
    key: CSS_COLORS.primary, // green
    string: CSS_COLORS.warning, // amber/yellow
    number: CSS_COLORS.purple, // purple
    boolean: CSS_COLORS.info, // blue
    nullVal: CSS_COLORS.error, // red
    punct: CSS_COLORS.textMuted, // gray
  };

  // Simple tokenizer for JSON using matchAll for safety
  const tokenPattern =
    /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|(\btrue\b|\bfalse\b)|(\bnull\b)|(-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)|([{}[\],])|(\s+)/g;

  for (const match of json.matchAll(tokenPattern)) {
    const [, str, colon, bool, nullToken, num, punct, whitespace] = match;

    if (whitespace) {
      container.appendChild(document.createTextNode(whitespace));
    } else if (str !== undefined) {
      const span = document.createElement('span');
      span.style.color = colon ? colors.key : colors.string;
      span.textContent = str;
      container.appendChild(span);
      if (colon) {
        const colonSpan = document.createElement('span');
        colonSpan.style.color = colors.punct;
        colonSpan.textContent = ':';
        container.appendChild(colonSpan);
      }
    } else if (bool) {
      const span = document.createElement('span');
      span.style.color = colors.boolean;
      span.textContent = bool;
      container.appendChild(span);
    } else if (nullToken) {
      const span = document.createElement('span');
      span.style.color = colors.nullVal;
      span.textContent = nullToken;
      container.appendChild(span);
    } else if (num) {
      const span = document.createElement('span');
      span.style.color = colors.number;
      span.textContent = num;
      container.appendChild(span);
    } else if (punct) {
      const span = document.createElement('span');
      span.style.color = colors.punct;
      span.textContent = punct;
      container.appendChild(span);
    }
  }
}

function renderKeyValueItems(container: HTMLElement, items: Record<string, string>): void {
  const entries = Object.entries(items);
  entries.forEach(([key, value], i) => {
    const isImage = isImageKey(key);

    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      padding: isImage ? '6px 8px' : '3px 8px',
      alignItems: 'flex-start',
      borderRadius: '3px',
      backgroundColor: i % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
    });

    const keyEl = document.createElement('span');
    Object.assign(keyEl.style, {
      color: CSS_COLORS.textSecondary,
      fontSize: '0.6875rem',
      width: '120px',
      minWidth: '120px',
      maxWidth: '120px',
      flexShrink: '0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      paddingTop: isImage ? '2px' : '0',
    });
    keyEl.textContent = key;
    if (key.length > 18) keyEl.title = key;
    row.appendChild(keyEl);

    if (isImage && value) {
      const valueCol = document.createElement('div');
      Object.assign(valueCol.style, { flex: '1', minWidth: '0' });

      // Image frame with subtle border -- fixed height to prevent layout jitter
      const frame = document.createElement('div');
      Object.assign(frame.style, {
        display: 'inline-block',
        padding: '4px',
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '4px',
        marginBottom: '4px',
        minHeight: '60px',
        minWidth: '80px',
      });

      const thumb = document.createElement('img');
      Object.assign(thumb.style, {
        width: '200px',
        height: '120px',
        objectFit: 'contain',
        borderRadius: '2px',
        display: 'block',
      });
      thumb.src = value;
      thumb.alt = key;
      thumb.onerror = () => { frame.style.display = 'none'; };
      thumb.onload = () => {
        if (thumb.naturalWidth) {
          dimEl.textContent = `${thumb.naturalWidth}\u00d7${thumb.naturalHeight}`;
        }
      };
      frame.appendChild(thumb);
      valueCol.appendChild(frame);

      // Reserve space for dimension text to avoid reflow
      const dimEl = document.createElement('div');
      Object.assign(dimEl.style, {
        color: CSS_COLORS.textMuted,
        fontSize: '0.5625rem',
        minHeight: '0.75rem',
        letterSpacing: '0.02em',
      });
      valueCol.appendChild(dimEl);

      const urlEl = document.createElement('div');
      Object.assign(urlEl.style, {
        color: CSS_COLORS.textMuted,
        fontSize: '0.5625rem',
        wordBreak: 'break-all',
        opacity: '0.7',
      });
      urlEl.textContent = value;
      valueCol.appendChild(urlEl);

      row.appendChild(valueCol);
    } else {
      const valueEl = document.createElement('span');
      Object.assign(valueEl.style, {
        color: CSS_COLORS.text,
        fontSize: '0.6875rem',
        flex: '1',
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        opacity: '0.85',
      });
      valueEl.textContent = String(value);
      row.appendChild(valueEl);
    }

    container.appendChild(row);
  });
}

/** Derive intended device/purpose from favicon label and declared size */
function faviconDevice(label: string, size?: string): { text: string; color: string } {
  const s = parseInt(size || '', 10);
  if (label.includes('apple'))
    return { text: 'Apple home screen', color: CSS_COLORS.info };
  if (size === 'any' || label.includes('svg'))
    return { text: 'Scalable (any)', color: CSS_COLORS.cyan };
  if (s >= 192)
    return { text: 'Android / PWA', color: CSS_COLORS.primary };
  if (s >= 48)
    return { text: 'Taskbar / shortcut', color: CSS_COLORS.purple };
  if (s > 0)
    return { text: 'Browser tab', color: CSS_COLORS.textSecondary };
  return { text: 'General', color: CSS_COLORS.textMuted };
}

function renderFaviconsSection(
  container: HTMLElement,
  icons: Array<{ label: string; url: string; size?: string }>
): void {
  const color = CSS_COLORS.purple;
  const section = document.createElement('div');
  section.style.marginBottom = '20px';

  renderSchemaSectionHeader(section, 'Favicons', color, icons.length);

  icons.forEach((icon, i) => {
    const device = faviconDevice(icon.label, icon.size);

    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      padding: '6px 8px',
      gap: '10px',
      borderRadius: '3px',
      backgroundColor: i % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
    });

    // Thumbnail frame
    const frame = document.createElement('div');
    Object.assign(frame.style, {
      width: '32px',
      height: '32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.25)',
      border: '1px solid rgba(255, 255, 255, 0.06)',
      borderRadius: '4px',
      flexShrink: '0',
    });

    const thumb = document.createElement('img');
    Object.assign(thumb.style, {
      width: '22px',
      height: '22px',
      objectFit: 'contain',
    });
    thumb.src = icon.url;
    thumb.alt = icon.label;
    thumb.onerror = () => { frame.style.opacity = '0.3'; };
    frame.appendChild(thumb);
    row.appendChild(frame);

    // Info column: label, device, dimensions + URL
    const infoCol = document.createElement('div');
    Object.assign(infoCol.style, {
      flex: '1',
      minWidth: '0',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    });

    // Top row: label + device pill
    const topRow = document.createElement('div');
    Object.assign(topRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    });

    const labelEl = document.createElement('span');
    Object.assign(labelEl.style, {
      color: CSS_COLORS.text,
      fontSize: '0.6875rem',
      fontWeight: '500',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
    labelEl.textContent = icon.label;
    if (icon.label.length > 24) labelEl.title = icon.label;
    topRow.appendChild(labelEl);

    const devicePill = document.createElement('span');
    Object.assign(devicePill.style, {
      color: device.color,
      fontSize: '0.5rem',
      backgroundColor: withAlpha(device.color, 7),
      padding: '1px 6px',
      borderRadius: '6px',
      letterSpacing: '0.03em',
      whiteSpace: 'nowrap',
      flexShrink: '0',
    });
    devicePill.textContent = device.text;
    topRow.appendChild(devicePill);

    infoCol.appendChild(topRow);

    // Bottom row: declared size + actual dimensions + URL
    const bottomRow = document.createElement('div');
    Object.assign(bottomRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '0.5625rem',
      color: CSS_COLORS.textMuted,
    });

    if (icon.size) {
      const declaredEl = document.createElement('span');
      declaredEl.textContent = icon.size;
      declaredEl.style.opacity = '0.8';
      bottomRow.appendChild(declaredEl);
    }

    // Actual dimensions (populated on load)
    const dimEl = document.createElement('span');
    dimEl.style.letterSpacing = '0.02em';
    bottomRow.appendChild(dimEl);

    thumb.onload = () => {
      if (thumb.naturalWidth) {
        const actual = `${thumb.naturalWidth}\u00d7${thumb.naturalHeight}`;
        if (icon.size) {
          dimEl.textContent = `\u2192 ${actual}`;
        } else {
          dimEl.textContent = actual;
        }
      }
    };

    const sep = document.createElement('span');
    sep.textContent = '\u00b7';
    sep.style.opacity = '0.4';
    bottomRow.appendChild(sep);

    const urlEl = document.createElement('span');
    Object.assign(urlEl.style, {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      opacity: '0.6',
    });
    urlEl.textContent = icon.url;
    urlEl.title = icon.url;
    bottomRow.appendChild(urlEl);

    infoCol.appendChild(bottomRow);
    row.appendChild(infoCol);

    section.appendChild(row);
  });

  container.appendChild(section);
}

function renderMissingTagsSection(
  container: HTMLElement,
  tags: Array<{ tag: string; severity: 'error' | 'warning'; hint: string }>
): void {
  const section = document.createElement('div');
  section.style.marginBottom = '20px';

  const errorCount = tags.filter((t) => t.severity === 'error').length;
  const warnCount = tags.length - errorCount;
  const hasErrors = errorCount > 0;
  const sectionColor = hasErrors ? CSS_COLORS.error : CSS_COLORS.warning;

  renderSchemaSectionHeader(section, 'Missing Tags', sectionColor, tags.length);

  // Summary pill row
  if (errorCount > 0 || warnCount > 0) {
    const summary = document.createElement('div');
    Object.assign(summary.style, {
      display: 'flex',
      gap: '8px',
      marginBottom: '8px',
    });

    if (errorCount > 0) {
      const errPill = document.createElement('span');
      Object.assign(errPill.style, {
        color: CSS_COLORS.error,
        fontSize: '0.5625rem',
        backgroundColor: withAlpha(CSS_COLORS.error, 8),
        padding: '2px 8px',
        borderRadius: '8px',
        letterSpacing: '0.03em',
      });
      errPill.textContent = `${errorCount} error${errorCount > 1 ? 's' : ''}`;
      summary.appendChild(errPill);
    }

    if (warnCount > 0) {
      const warnPill = document.createElement('span');
      Object.assign(warnPill.style, {
        color: CSS_COLORS.warning,
        fontSize: '0.5625rem',
        backgroundColor: withAlpha(CSS_COLORS.warning, 8),
        padding: '2px 8px',
        borderRadius: '8px',
        letterSpacing: '0.03em',
      });
      warnPill.textContent = `${warnCount} warning${warnCount > 1 ? 's' : ''}`;
      summary.appendChild(warnPill);
    }

    section.appendChild(summary);
  }

  tags.forEach((tag, i) => {
    const isError = tag.severity === 'error';
    const tagColor = isError ? CSS_COLORS.error : CSS_COLORS.warning;

    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      padding: '4px 8px',
      gap: '8px',
      borderRadius: '3px',
      backgroundColor: i % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
      borderLeft: `2px solid ${withAlpha(tagColor, 25)}`,
    });

    const icon = document.createElement('span');
    Object.assign(icon.style, {
      fontSize: '0.625rem',
      flexShrink: '0',
      width: '14px',
      textAlign: 'center',
      color: tagColor,
    });
    icon.textContent = isError ? '\u2718' : '\u26a0';
    row.appendChild(icon);

    const tagName = document.createElement('span');
    Object.assign(tagName.style, {
      color: CSS_COLORS.text,
      fontSize: '0.6875rem',
      width: '120px',
      minWidth: '120px',
      flexShrink: '0',
      fontWeight: '500',
    });
    tagName.textContent = tag.tag;
    row.appendChild(tagName);

    const hint = document.createElement('span');
    Object.assign(hint.style, {
      color: CSS_COLORS.textMuted,
      fontSize: '0.6875rem',
      flex: '1',
      opacity: '0.85',
    });
    hint.textContent = tag.hint;
    row.appendChild(hint);

    section.appendChild(row);
  });

  container.appendChild(section);
}

// ============================================================================
// Accessibility Audit Modal
// ============================================================================

export function renderA11yModal(state: DevBarState): void {
  const color = BUTTON_COLORS.a11y;

  const closeModal = () => {
    state.showA11yModal = false;
    state.render();
  };

  const overlay = createModalOverlay(closeModal);
  const modal = createModalBox(color);

  // Show loading state initially
  const loadingContent = createModalContent();
  const loadingMsg = document.createElement('div');
  Object.assign(loadingMsg.style, {
    textAlign: 'center',
    padding: '40px',
    color: CSS_COLORS.textSecondary,
    fontSize: '0.875rem',
  });
  loadingMsg.textContent = 'Running accessibility audit...';
  loadingMsg.style.animation = 'pulse 1.5s ease-in-out infinite';
  loadingContent.appendChild(loadingMsg);

  // Temporary header without save/copy (shown during loading)
  const loadingHeader = createModalHeader({
    color,
    title: 'Accessibility Audit',
    onClose: closeModal,
    onCopyMd: async () => {},
    sweetlinkConnected: state.sweetlinkConnected,
    saveLocation: state.options.saveLocation,
  });
  modal.appendChild(loadingHeader);
  modal.appendChild(loadingContent);
  overlay.appendChild(modal);

  state.overlayElement = overlay;
  document.body.appendChild(overlay);

  // Run the audit async and replace content when done
  runA11yAudit().then((result) => {
    // Check modal is still open
    if (!state.showA11yModal) return;

    const markdown = a11yToMarkdown(result);

    // Replace modal content
    clearChildren(modal);

    const violationCount = result.violations.length;
    const titleText = violationCount === 0
      ? 'Accessibility Audit \u2014 No Issues'
      : `Accessibility Audit \u2014 ${violationCount} Violation${violationCount === 1 ? '' : 's'}`;

    const header = createModalHeader({
      color,
      title: titleText,
      onClose: closeModal,
      onCopyMd: async () => {
        await navigator.clipboard.writeText(markdown);
      },
      onSave: () => handleSaveA11yAudit(state, result),
      sweetlinkConnected: state.sweetlinkConnected,
      saveLocation: state.options.saveLocation,
      isSaving: state.savingA11yAudit,
      savedPath: state.lastA11yAudit,
    });
    modal.appendChild(header);

    const content = createModalContent();

    if (result.violations.length === 0) {
      const successMsg = document.createElement('div');
      Object.assign(successMsg.style, {
        textAlign: 'center',
        padding: '40px',
        color: CSS_COLORS.primary,
        fontSize: '0.875rem',
      });
      successMsg.textContent = 'No accessibility violations found!';
      content.appendChild(successMsg);

      // Show pass count
      if (result.passes.length > 0) {
        const passInfo = document.createElement('div');
        Object.assign(passInfo.style, {
          textAlign: 'center',
          color: CSS_COLORS.textMuted,
          fontSize: '0.75rem',
          marginTop: '8px',
        });
        passInfo.textContent = `${result.passes.length} rules passed`;
        content.appendChild(passInfo);
      }
    } else {
      // Summary bar
      const counts = getViolationCounts(result.violations);
      const summaryBar = document.createElement('div');
      Object.assign(summaryBar.style, {
        display: 'flex',
        gap: '12px',
        marginBottom: '16px',
        padding: '10px 12px',
        backgroundColor: withAlpha(color, 6),
        border: `1px solid ${withAlpha(color, 19)}`,
        borderRadius: '6px',
        flexWrap: 'wrap',
      });

      for (const impact of ['critical', 'serious', 'moderate', 'minor'] as const) {
        if (counts[impact] === 0) continue;
        const badge = document.createElement('span');
        const impactColor = getImpactColor(impact);
        Object.assign(badge.style, {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '0.6875rem',
          fontWeight: '600',
          color: impactColor,
        });
        const dot = document.createElement('span');
        Object.assign(dot.style, {
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: impactColor,
        });
        badge.appendChild(dot);
        badge.appendChild(document.createTextNode(`${counts[impact]} ${impact}`));
        summaryBar.appendChild(badge);
      }
      content.appendChild(summaryBar);

      // Grouped violations
      const grouped = groupViolationsByImpact(result.violations);
      for (const [impact, violations] of grouped) {
        if (violations.length === 0) continue;
        renderA11yViolationGroup(content, impact, violations);
      }
    }

    modal.appendChild(content);
  }).catch((err) => {
    if (!state.showA11yModal) return;

    clearChildren(modal);
    const header = createModalHeader({
      color: CSS_COLORS.error,
      title: 'Accessibility Audit \u2014 Error',
      onClose: closeModal,
      onCopyMd: async () => {},
      sweetlinkConnected: state.sweetlinkConnected,
      saveLocation: state.options.saveLocation,
    });
    modal.appendChild(header);

    const content = createModalContent();
    content.appendChild(
      createInfoBox(CSS_COLORS.error, 'Audit Failed', `${err instanceof Error ? err.message : 'Unknown error'}`)
    );
    modal.appendChild(content);
  });
}

function renderA11yViolationGroup(
  container: HTMLElement,
  impact: string,
  violations: AxeViolation[]
): void {
  const impactColor = getImpactColor(impact);

  const section = document.createElement('div');
  section.style.marginBottom = '20px';

  // Section header
  const sectionTitle = document.createElement('h3');
  Object.assign(sectionTitle.style, {
    color: impactColor,
    fontSize: '0.8125rem',
    fontWeight: '600',
    marginBottom: '10px',
    borderBottom: `1px solid ${withAlpha(impactColor, 25)}`,
    paddingBottom: '6px',
    textTransform: 'capitalize',
  });
  sectionTitle.textContent = `${impact} (${violations.length})`;
  section.appendChild(sectionTitle);

  for (const violation of violations) {
    const violationEl = document.createElement('div');
    Object.assign(violationEl.style, {
      marginBottom: '12px',
      padding: '10px 12px',
      backgroundColor: withAlpha(impactColor, 3),
      border: `1px solid ${withAlpha(impactColor, 13)}`,
      borderRadius: '6px',
    });

    // Rule ID
    const ruleId = document.createElement('div');
    Object.assign(ruleId.style, {
      color: impactColor,
      fontSize: '0.6875rem',
      fontWeight: '600',
      marginBottom: '4px',
    });
    ruleId.textContent = violation.id;
    violationEl.appendChild(ruleId);

    // Help text
    const helpText = document.createElement('div');
    Object.assign(helpText.style, {
      color: CSS_COLORS.text,
      fontSize: '0.75rem',
      marginBottom: '4px',
    });
    helpText.textContent = violation.help;
    violationEl.appendChild(helpText);

    // Description
    const desc = document.createElement('div');
    Object.assign(desc.style, {
      color: CSS_COLORS.textSecondary,
      fontSize: '0.6875rem',
      marginBottom: '6px',
    });
    desc.textContent = violation.description;
    violationEl.appendChild(desc);

    // Node count
    const nodeCount = document.createElement('div');
    Object.assign(nodeCount.style, {
      color: CSS_COLORS.textMuted,
      fontSize: '0.625rem',
      marginBottom: '4px',
    });
    nodeCount.textContent = `${violation.nodes.length} element${violation.nodes.length === 1 ? '' : 's'} affected`;
    violationEl.appendChild(nodeCount);

    // Affected nodes (collapsed by default, show first 3)
    const nodesPreview = document.createElement('div');
    Object.assign(nodesPreview.style, {
      marginTop: '6px',
    });

    const visibleNodes = violation.nodes.slice(0, 3);
    for (const node of visibleNodes) {
      const nodeEl = document.createElement('div');
      Object.assign(nodeEl.style, {
        padding: '3px 6px',
        marginBottom: '2px',
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: '3px',
        fontSize: '0.625rem',
        color: CSS_COLORS.textSecondary,
        fontFamily: 'monospace',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      });
      nodeEl.textContent = node.html.length > 100 ? `${node.html.slice(0, 100)}...` : node.html;
      nodeEl.title = node.html;
      nodesPreview.appendChild(nodeEl);
    }

    if (violation.nodes.length > 3) {
      const moreBtn = document.createElement('button');
      Object.assign(moreBtn.style, {
        background: 'none',
        border: 'none',
        color: impactColor,
        fontSize: '0.625rem',
        cursor: 'pointer',
        padding: '2px 0',
        fontFamily: FONT_MONO,
      });
      moreBtn.textContent = `+ ${violation.nodes.length - 3} more`;
      moreBtn.onclick = () => {
        // Show remaining nodes
        moreBtn.remove();
        for (const node of violation.nodes.slice(3)) {
          const nodeEl = document.createElement('div');
          Object.assign(nodeEl.style, {
            padding: '3px 6px',
            marginBottom: '2px',
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: '3px',
            fontSize: '0.625rem',
            color: CSS_COLORS.textSecondary,
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          });
          nodeEl.textContent = node.html.length > 100 ? `${node.html.slice(0, 100)}...` : node.html;
          nodeEl.title = node.html;
          nodesPreview.appendChild(nodeEl);
        }
      };
      nodesPreview.appendChild(moreBtn);
    }

    violationEl.appendChild(nodesPreview);
    section.appendChild(violationEl);
  }

  container.appendChild(section);
}

// ============================================================================
// Design Review Confirmation Modal
// ============================================================================

export function renderDesignReviewConfirmModal(state: DevBarState): void {
  const color = BUTTON_COLORS.review;
  const closeModal = () => closeDesignReviewConfirm(state);

  const overlay = createModalOverlay(closeModal);
  const modal = createModalBox(color);
  modal.style.maxWidth = '450px';

  // Minimal header (title + close only, no Copy MD / Save)
  modal.appendChild(createModalHeader({ color, title: 'AI Design Review', onClose: closeModal }));

  // Content
  const content = createModalContent();
  Object.assign(content.style, {
    color: CSS_COLORS.text,
    fontSize: '0.8125rem',
    lineHeight: '1.6',
  });

  if (state.apiKeyStatus === null) {
    content.appendChild(createEmptyMessage('Checking API key configuration...'));
  } else if (!state.apiKeyStatus.configured) {
    content.appendChild(renderApiKeyNotConfiguredContent());
  } else {
    content.appendChild(renderApiKeyConfiguredContent(state));
  }

  modal.appendChild(content);

  // Footer with action button
  if (state.apiKeyStatus?.configured) {
    const footer = document.createElement('div');
    Object.assign(footer.style, {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '10px',
      padding: '14px 18px',
      borderTop: `1px solid ${CSS_COLORS.border}`,
    });

    const proceedBtn = createStyledButton({ color, text: 'Run Review', padding: '8px 16px' });
    proceedBtn.style.backgroundColor = withAlpha(color, 13);
    proceedBtn.onclick = () => proceedWithDesignReview(state);
    footer.appendChild(proceedBtn);

    modal.appendChild(footer);
  }

  overlay.appendChild(modal);

  state.overlayElement = overlay;
  document.body.appendChild(overlay);
}

function renderApiKeyNotConfiguredContent(): HTMLElement {
  const wrapper = document.createElement('div');

  wrapper.appendChild(
    createInfoBox(
      CSS_COLORS.error,
      'API Key Not Configured',
      'The ANTHROPIC_API_KEY environment variable is not set.'
    )
  );

  // Instructions
  const instructions = document.createElement('div');
  Object.assign(instructions.style, { marginBottom: '12px' });

  const instructTitle = document.createElement('div');
  Object.assign(instructTitle.style, {
    color: CSS_COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: '8px',
  });
  instructTitle.textContent = 'To configure:';
  instructions.appendChild(instructTitle);

  const steps = [
    { text: '1. Get an API key from console.anthropic.com', highlight: false },
    { text: '2. Add to your .env file:', highlight: false },
    { text: '   ANTHROPIC_API_KEY=sk-ant-...', highlight: true },
    { text: '3. Restart your dev server', highlight: false },
  ];

  steps.forEach(({ text, highlight }) => {
    const stepDiv = document.createElement('div');
    Object.assign(stepDiv.style, {
      color: highlight ? CSS_COLORS.primary : CSS_COLORS.textMuted,
      fontSize: '0.75rem',
      marginBottom: '4px',
      fontFamily: FONT_MONO,
    });
    stepDiv.textContent = text;
    instructions.appendChild(stepDiv);
  });

  wrapper.appendChild(instructions);
  return wrapper;
}

function renderApiKeyConfiguredContent(state: DevBarState): HTMLElement {
  const wrapper = document.createElement('div');
  Object.assign(wrapper.style, { marginBottom: '16px' });

  const desc = document.createElement('p');
  Object.assign(desc.style, { color: CSS_COLORS.textSecondary, marginBottom: '12px' });
  desc.textContent = 'This will capture a screenshot and send it to Claude for design analysis.';
  wrapper.appendChild(desc);

  // Cost estimate
  const estimate = calculateCostEstimate(state);
  if (estimate) {
    const costBox = createInfoBox(CSS_COLORS.primary, 'Estimated Cost', []);
    // Remove default margin and adjust padding
    costBox.style.marginBottom = '0';
    costBox.style.padding = '12px';

    const costDetails = document.createElement('div');
    Object.assign(costDetails.style, {
      display: 'flex',
      justifyContent: 'space-between',
      color: CSS_COLORS.textSecondary,
      fontSize: '0.75rem',
    });

    const tokensSpan = document.createElement('span');
    tokensSpan.textContent = `~${estimate.tokens.toLocaleString()} tokens`;
    costDetails.appendChild(tokensSpan);

    const priceSpan = document.createElement('span');
    Object.assign(priceSpan.style, { color: CSS_COLORS.warning, fontWeight: '600' });
    priceSpan.textContent = estimate.cost;
    costDetails.appendChild(priceSpan);

    costBox.appendChild(costDetails);
    wrapper.appendChild(costBox);
  }

  // Model info
  if (state.apiKeyStatus?.model) {
    const modelDiv = document.createElement('div');
    Object.assign(modelDiv.style, {
      color: CSS_COLORS.textMuted,
      fontSize: '0.6875rem',
      marginTop: '12px',
    });
    modelDiv.textContent = `Model: ${state.apiKeyStatus.model}`;
    wrapper.appendChild(modelDiv);
  }

  return wrapper;
}
