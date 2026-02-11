/**
 * Document Outline Extraction
 *
 * Functions for extracting and formatting the semantic document outline.
 */

import type { OutlineNode, SweetlinkResponse } from '../../types.js';

// ============================================================================
// Semantic Element Sets
// ============================================================================

const semanticElements = new Set([
  'article',
  'aside',
  'nav',
  'section',
  'main',
  'body',
  'header',
  'footer',
  'figure',
  'figcaption',
  'details',
  'summary',
  'dialog',
  'address',
  'hgroup',
  'form',
  'fieldset',
  'legend',
  'ul',
  'ol',
  'dl',
  'menu',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'caption',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);

const headingElements = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the semantic category for an element tag
 */
function getSemanticCategory(tag: string): string {
  if (headingElements.has(tag)) return 'heading';
  if (['article', 'section', 'aside', 'nav'].includes(tag)) return 'sectioning';
  if (['main', 'header', 'footer'].includes(tag)) return 'landmark';
  if (['figure', 'figcaption', 'details', 'summary'].includes(tag)) return 'grouping';
  if (['form', 'fieldset', 'legend'].includes(tag)) return 'form';
  if (['table', 'thead', 'tbody', 'tfoot', 'caption'].includes(tag)) return 'table';
  if (['ul', 'ol', 'dl', 'menu'].includes(tag)) return 'list';
  return 'other';
}

/**
 * Get trimmed text content from an element with optional max length
 */
function getTextContent(el: Element | null, maxLen: number): string {
  return el?.textContent?.trim().slice(0, maxLen) || '';
}

/**
 * Mapping of tag names to their child element selector for text extraction
 */
const childTextSelectors: Record<string, string> = {
  figure: 'figcaption',
  details: 'summary',
  fieldset: 'legend',
  table: 'caption',
};

/**
 * Get descriptive text for an element
 */
function getElementText(el: Element, tagName: string): string {
  // Check ARIA attributes first
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) return getTextContent(labelEl, 80);
  }

  // Headings: use direct text content
  if (headingElements.has(tagName)) {
    return getTextContent(el, 100);
  }

  // Elements with child selectors (figure, details, fieldset, table)
  const childSelector = childTextSelectors[tagName];
  if (childSelector) {
    const childEl = el.querySelector(childSelector);
    if (childEl) return getTextContent(childEl, 80);
  }

  // Form: use name or id attribute
  if (tagName === 'form') {
    const name = el.getAttribute('name') || el.getAttribute('id');
    if (name) return name;
  }

  // Nav: try heading first, then first link
  if (tagName === 'nav') {
    const heading = el.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading) return getTextContent(heading, 50);
    const firstLink = el.querySelector('a');
    if (firstLink) return `Navigation (${getTextContent(firstLink, 30)}...)`;
  }

  // Sectioning elements: try direct child heading, then class name
  if (['section', 'article', 'aside'].includes(tagName)) {
    const heading = el.querySelector(
      ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'
    );
    if (heading) return getTextContent(heading, 80);
    const className = el.className?.toString().split(' ')[0];
    if (className && className.length < 30) return className;
  }

  // Lists: count items
  if (['ul', 'ol'].includes(tagName)) {
    return `${el.querySelectorAll(':scope > li').length} items`;
  }
  if (tagName === 'dl') {
    return `${el.querySelectorAll(':scope > dt').length} terms`;
  }

  // Fallback to role attribute
  const role = el.getAttribute('role');
  if (role) return `[role="${role}"]`;

  return '';
}

/**
 * Check if an element is visible
 */
function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

/**
 * Recursively extract outline nodes from an element
 */
function extractFromElement(root: Element): OutlineNode[] {
  const nodes: OutlineNode[] = [];

  for (const child of Array.from(root.children)) {
    const tagName = child.tagName.toLowerCase();

    if (!isVisible(child)) continue;
    if (child.getAttribute('data-devbar')) continue;

    if (semanticElements.has(tagName)) {
      const text = getElementText(child, tagName);
      const isHeading = headingElements.has(tagName);
      const isLandmark = [
        'main',
        'nav',
        'header',
        'footer',
        'article',
        'section',
        'aside',
      ].includes(tagName);
      const hasText = text.length > 0;

      if (isHeading || isLandmark || hasText) {
        const level = isHeading ? parseInt(tagName[1], 10) : 0;

        const node: OutlineNode = {
          tagName,
          level,
          text: text || `<${tagName}>`,
          id: child.id || undefined,
          children: [],
          category: getSemanticCategory(tagName),
        };

        if (!isHeading) {
          node.children = extractFromElement(child);
        }

        nodes.push(node);
      } else {
        const childNodes = extractFromElement(child);
        nodes.push(...childNodes);
      }
    } else {
      const childNodes = extractFromElement(child);
      nodes.push(...childNodes);
    }
  }

  return nodes;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Extract the document outline from the page
 */
export function extractDocumentOutline(): OutlineNode[] {
  const body = document.body;
  if (!body) return [];

  return extractFromElement(body);
}

/**
 * Convert an outline to markdown format
 */
export function outlineToMarkdown(outline: OutlineNode[], indent = 0): string {
  let md = '';

  if (indent === 0) {
    md += '# Document Outline\n\n';
    md += '**Semantic Categories:**\n';
    md += '- `heading` - h1-h6 elements\n';
    md += '- `sectioning` - article, section, aside, nav\n';
    md += '- `landmark` - main, header, footer\n';
    md += '- `grouping` - figure, details, summary\n';
    md += '- `form` - form, fieldset\n';
    md += '- `table` - table elements\n';
    md += '- `list` - ul, ol, dl\n\n';
    md += '---\n\n';
  }

  for (const node of outline) {
    const prefix = '  '.repeat(indent);
    const tagLabel = `\`<${node.tagName}>\``;
    const anchor = node.id ? ` \`#${node.id}\`` : '';
    const category = node.category ? ` [${node.category}]` : '';

    if (node.category === 'heading' && indent === 0) {
      md += `${'#'.repeat(node.level)} ${tagLabel} ${node.text}${anchor}\n\n`;
    } else {
      md += `${prefix}- ${tagLabel}${category} ${node.text}${anchor}\n`;
    }

    if (node.children.length > 0) {
      md += outlineToMarkdown(node.children, indent + 1);
    }
  }

  return md;
}

/**
 * Handle get-outline command from CLI
 */
export function handleGetOutline(): SweetlinkResponse {
  try {
    const outline = extractDocumentOutline();
    const markdown = outlineToMarkdown(outline);

    return {
      success: true,
      data: {
        outline,
        markdown,
        url: window.location.href,
        title: document.title,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Outline extraction failed',
      timestamp: Date.now(),
    };
  }
}
