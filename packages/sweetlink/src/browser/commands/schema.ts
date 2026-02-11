/**
 * Page Schema Extraction
 *
 * Functions for extracting and formatting structured data from pages.
 */

import type { MetaImage, MissingTag, PageSchema, SweetlinkResponse } from '../../types.js';

/** Metadata-about-the-image keys (dimensions, type, alt) — NOT image URLs */
const IMAGE_META_SUFFIXES = new Set(['width', 'height', 'type', 'alt']);

/** Check whether a meta-tag key holds an image URL (not dimensions/alt/type metadata) */
export function isImageKey(key: string): boolean {
  const lower = key.toLowerCase();
  // Explicit image keys
  if (lower === 'image' || lower === 'logo' || lower === 'thumbnail') return true;
  // image:url, image:secure_url — but NOT image:width, image:height, image:type, image:alt
  if (lower.startsWith('image:')) {
    const suffix = lower.slice(6);
    return !IMAGE_META_SUFFIXES.has(suffix);
  }
  return false;
}

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

/**
 * Extract favicon and touch-icon links from the page
 */
export function extractFavicons(): MetaImage[] {
  const icons: MetaImage[] = [];
  const seen = new Set<string>();

  const iconLinks = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]'
  );
  iconLinks.forEach((link) => {
    const href = link.href;
    if (!href || seen.has(href)) return;
    seen.add(href);
    const rel = link.getAttribute('rel') || '';
    const sizes = link.getAttribute('sizes') || undefined;
    const type = link.getAttribute('type') || undefined;
    const label = rel.includes('apple') ? 'apple-touch-icon' : 'favicon';
    const suffix = [sizes, type].filter(Boolean).join(' ');
    icons.push({
      label: suffix ? `${label} (${suffix})` : label,
      url: href,
      size: sizes,
    });
  });

  return icons;
}

/**
 * Check for missing recommended meta tags
 */
export function checkMissingTags(schema: PageSchema): MissingTag[] {
  const missing: MissingTag[] = [];

  const check = (
    tag: string,
    present: boolean,
    severity: 'error' | 'warning',
    hint: string
  ) => {
    if (!present) missing.push({ tag, severity, hint });
  };

  // Critical tags
  check('og:title', !!schema.openGraph['title'], 'error', 'Required for social media unfurls');
  check('og:description', !!schema.openGraph['description'], 'error', 'Required for social media unfurls');
  check('og:image', !!schema.openGraph['image'], 'error', 'Required for social media preview images');
  check('og:url', !!schema.openGraph['url'], 'warning', 'Canonical URL for the shared page');
  check('og:type', !!schema.openGraph['type'], 'warning', 'Content type (website, article, etc.)');

  // Twitter
  check('twitter:card', !!schema.twitter['card'], 'warning', 'Card type (summary, summary_large_image)');
  check('twitter:title', !!schema.twitter['title'], 'warning', 'Falls back to og:title if missing');
  check('twitter:image', !!schema.twitter['image'], 'warning', 'Falls back to og:image if missing');

  // Standard
  check('description', !!schema.metaTags['description'], 'error', 'Essential for SEO');
  check('viewport', !!schema.metaTags['viewport'], 'error', 'Required for responsive design');

  // Favicon
  const hasFavicon = !!document.querySelector(
    'link[rel="icon"], link[rel="shortcut icon"]'
  );
  check('favicon', hasFavicon, 'warning', '<link rel="icon"> for browser tabs');

  // Canonical
  const hasCanonical = !!document.querySelector('link[rel="canonical"]');
  check('canonical', hasCanonical, 'warning', '<link rel="canonical"> for SEO');

  return missing;
}

/**
 * Handle get-schema command from CLI
 */
export function handleGetSchema(): SweetlinkResponse {
  try {
    const schema = extractPageSchema();
    const markdown = schemaToMarkdown(schema);

    return {
      success: true,
      data: {
        schema,
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
      error: error instanceof Error ? error.message : 'Schema extraction failed',
      timestamp: Date.now(),
    };
  }
}
