/**
 * Page Schema Extraction
 *
 * Functions for extracting and formatting structured data from pages.
 */

import type { PageSchema } from './types.js';

// ============================================================================
// Public API
// ============================================================================

/**
 * Extract structured data (JSON-LD, meta tags, Open Graph, etc.) from the page
 */
export function extractPageSchema(): PageSchema {
  const schema: PageSchema = {
    jsonLd: [],
    metaTags: {},
    openGraph: {},
    twitter: {},
    microdata: [],
  };

  // Extract JSON-LD
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  jsonLdScripts.forEach((script) => {
    try {
      const data = JSON.parse(script.textContent || '');
      schema.jsonLd.push(data);
    } catch {
      // Invalid JSON-LD, skip
    }
  });

  // Extract meta tags
  const metaTags = document.querySelectorAll('meta[name], meta[property]');
  metaTags.forEach((meta) => {
    const name = meta.getAttribute('name') || meta.getAttribute('property') || '';
    const content = meta.getAttribute('content') || '';

    if (name.startsWith('og:')) {
      schema.openGraph[name.replace('og:', '')] = content;
    } else if (name.startsWith('twitter:')) {
      schema.twitter[name.replace('twitter:', '')] = content;
    } else if (name) {
      schema.metaTags[name] = content;
    }
  });

  // Extract microdata
  const microdataItems = document.querySelectorAll('[itemscope]');
  microdataItems.forEach((item) => {
    const itemType = item.getAttribute('itemtype');
    const props: Record<string, string> = {};

    item.querySelectorAll('[itemprop]').forEach((prop) => {
      const propName = prop.getAttribute('itemprop') || '';
      const propValue =
        prop.getAttribute('content') ||
        prop.getAttribute('href') ||
        prop.textContent?.trim().slice(0, 200) ||
        '';
      if (propName) props[propName] = propValue;
    });

    if (itemType || Object.keys(props).length > 0) {
      schema.microdata.push({ type: itemType ?? undefined, properties: props });
    }
  });

  return schema;
}

/**
 * Convert a page schema to markdown format
 */
export function schemaToMarkdown(schema: PageSchema): string {
  let md = '';

  if (schema.jsonLd.length > 0) {
    md += '## JSON-LD\n\n';
    schema.jsonLd.forEach((item, i) => {
      md += `### Schema ${i + 1}\n\n`;
      md += `\`\`\`json\n${JSON.stringify(item, null, 2)}\n\`\`\`\n\n`;
    });
  }

  if (Object.keys(schema.openGraph).length > 0) {
    md += '## Open Graph\n\n';
    for (const [key, value] of Object.entries(schema.openGraph)) {
      md += `- **${key}**: ${value}\n`;
    }
    md += '\n';
  }

  if (Object.keys(schema.twitter).length > 0) {
    md += '## Twitter Cards\n\n';
    for (const [key, value] of Object.entries(schema.twitter)) {
      md += `- **${key}**: ${value}\n`;
    }
    md += '\n';
  }

  if (Object.keys(schema.metaTags).length > 0) {
    md += '## Meta Tags\n\n';
    for (const [key, value] of Object.entries(schema.metaTags)) {
      md += `- **${key}**: ${value}\n`;
    }
    md += '\n';
  }

  if (schema.microdata.length > 0) {
    md += '## Microdata\n\n';
    schema.microdata.forEach((item, i) => {
      md += `### Item ${i + 1}${item.type ? ` (${item.type})` : ''}\n\n`;
      for (const [key, value] of Object.entries(item.properties ?? {})) {
        md += `- **${key}**: ${value}\n`;
      }
      md += '\n';
    });
  }

  if (!md) {
    md = '_No structured data found on this page_\n';
  }

  return md;
}
