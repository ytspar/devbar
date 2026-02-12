/**
 * H4: Schema module re-export tests
 *
 * Tests that the devbar schema module correctly re-exports
 * extractPageSchema, schemaToMarkdown, checkMissingTags,
 * extractFavicons, and isImageKey from sweetlink.
 *
 * Since the sweetlink schema.test.ts already has comprehensive tests,
 * these tests verify the re-export surface and key behaviors through
 * the devbar entry point.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkMissingTags,
  extractFavicons,
  extractPageSchema,
  isImageKey,
  schemaToMarkdown,
} from './schema.js';

function clearHead(): void {
  while (document.head.firstChild) document.head.removeChild(document.head.firstChild);
}

function clearBody(): void {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
}

beforeEach(() => {
  clearHead();
  clearBody();
});

afterEach(() => {
  clearHead();
  clearBody();
});

describe('extractPageSchema (re-exported)', () => {
  it('returns an empty schema when page has no structured data', () => {
    const schema = extractPageSchema();

    expect(schema.jsonLd).toEqual([]);
    expect(schema.metaTags).toEqual({});
    expect(schema.openGraph).toEqual({});
    expect(schema.twitter).toEqual({});
    expect(schema.microdata).toEqual([]);
  });

  it('extracts JSON-LD from script tags', () => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({ '@type': 'WebSite', name: 'Test' });
    document.head.appendChild(script);

    const schema = extractPageSchema();

    expect(schema.jsonLd.length).toBe(1);
    expect((schema.jsonLd[0] as any)['@type']).toBe('WebSite');
  });

  it('extracts og: meta tags into openGraph', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'og:title');
    meta.setAttribute('content', 'My Page');
    document.head.appendChild(meta);

    const schema = extractPageSchema();

    expect(schema.openGraph.title).toBe('My Page');
  });

  it('extracts twitter: meta tags into twitter', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'twitter:card');
    meta.setAttribute('content', 'summary');
    document.head.appendChild(meta);

    const schema = extractPageSchema();

    expect(schema.twitter.card).toBe('summary');
  });

  it('extracts standard meta tags', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'description');
    meta.setAttribute('content', 'A test page');
    document.head.appendChild(meta);

    const schema = extractPageSchema();

    expect(schema.metaTags.description).toBe('A test page');
  });

  it('extracts microdata from itemscope elements', () => {
    const div = document.createElement('div');
    div.setAttribute('itemscope', '');
    div.setAttribute('itemtype', 'https://schema.org/Article');

    const span = document.createElement('span');
    span.setAttribute('itemprop', 'headline');
    span.textContent = 'Article Title';
    div.appendChild(span);

    document.body.appendChild(div);

    const schema = extractPageSchema();

    expect(schema.microdata.length).toBe(1);
    expect(schema.microdata[0].type).toBe('https://schema.org/Article');
    expect(schema.microdata[0].properties.headline).toBe('Article Title');
  });

  it('skips invalid JSON-LD gracefully', () => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = 'not valid json';
    document.head.appendChild(script);

    const schema = extractPageSchema();

    expect(schema.jsonLd).toEqual([]);
  });
});

describe('schemaToMarkdown (re-exported)', () => {
  it('returns fallback message for empty schema', () => {
    const md = schemaToMarkdown({
      jsonLd: [],
      metaTags: {},
      openGraph: {},
      twitter: {},
      microdata: [],
    });

    expect(md).toBe('_No structured data found on this page_\n');
  });

  it('renders JSON-LD section', () => {
    const md = schemaToMarkdown({
      jsonLd: [{ '@type': 'Organization', name: 'Acme' }],
      metaTags: {},
      openGraph: {},
      twitter: {},
      microdata: [],
    });

    expect(md).toContain('## JSON-LD');
    expect(md).toContain('```json');
    expect(md).toContain('"name": "Acme"');
  });

  it('renders Open Graph section', () => {
    const md = schemaToMarkdown({
      jsonLd: [],
      metaTags: {},
      openGraph: { title: 'Hello', image: 'https://img.test/og.png' },
      twitter: {},
      microdata: [],
    });

    expect(md).toContain('## Open Graph');
    expect(md).toContain('- **title**: Hello');
    expect(md).toContain('- **image**: https://img.test/og.png');
  });

  it('renders Twitter Cards section', () => {
    const md = schemaToMarkdown({
      jsonLd: [],
      metaTags: {},
      openGraph: {},
      twitter: { card: 'summary_large_image' },
      microdata: [],
    });

    expect(md).toContain('## Twitter Cards');
    expect(md).toContain('- **card**: summary_large_image');
  });

  it('renders Meta Tags section', () => {
    const md = schemaToMarkdown({
      jsonLd: [],
      metaTags: { viewport: 'width=device-width' },
      openGraph: {},
      twitter: {},
      microdata: [],
    });

    expect(md).toContain('## Meta Tags');
    expect(md).toContain('- **viewport**: width=device-width');
  });

  it('renders Microdata section', () => {
    const md = schemaToMarkdown({
      jsonLd: [],
      metaTags: {},
      openGraph: {},
      twitter: {},
      microdata: [{ type: 'https://schema.org/Product', properties: { name: 'Widget' } }],
    });

    expect(md).toContain('## Microdata');
    expect(md).toContain('### Item 1 (https://schema.org/Product)');
    expect(md).toContain('- **name**: Widget');
  });

  it('renders missing tags section when provided via extras', () => {
    const md = schemaToMarkdown(
      { jsonLd: [], metaTags: {}, openGraph: {}, twitter: {}, microdata: [] },
      { missingTags: [{ tag: 'og:title', severity: 'error', hint: 'Required for sharing' }] },
    );

    expect(md).toContain('## Missing Tags');
    expect(md).toContain('**og:title**');
    expect(md).toContain('Required for sharing');
  });

  it('renders favicons section when provided via extras', () => {
    const md = schemaToMarkdown(
      { jsonLd: [], metaTags: {}, openGraph: {}, twitter: {}, microdata: [] },
      { favicons: [{ label: 'favicon', url: '/favicon.ico', size: '32x32' }] },
    );

    expect(md).toContain('## Favicons');
    expect(md).toContain('**favicon**');
    expect(md).toContain('/favicon.ico');
  });
});

describe('checkMissingTags (re-exported)', () => {
  it('reports missing critical tags for empty schema', () => {
    const missing = checkMissingTags({
      jsonLd: [],
      metaTags: {},
      openGraph: {},
      twitter: {},
      microdata: [],
    });

    const tags = missing.map((m) => m.tag);
    expect(tags).toContain('og:title');
    expect(tags).toContain('og:description');
    expect(tags).toContain('og:image');
    expect(tags).toContain('description');
    expect(tags).toContain('viewport');
  });

  it('does not report tags that are present', () => {
    // Add favicon and canonical links
    const iconLink = document.createElement('link');
    iconLink.setAttribute('rel', 'icon');
    iconLink.setAttribute('href', '/fav.ico');
    document.head.appendChild(iconLink);

    const canonLink = document.createElement('link');
    canonLink.setAttribute('rel', 'canonical');
    canonLink.setAttribute('href', 'https://example.com');
    document.head.appendChild(canonLink);

    const missing = checkMissingTags({
      jsonLd: [],
      metaTags: { description: 'desc', viewport: 'width=device-width' },
      openGraph: { title: 'T', description: 'D', image: 'img.png', url: 'u', type: 'website' },
      twitter: { card: 'summary', title: 'T', image: 'img.png' },
      microdata: [],
    });

    expect(missing.length).toBe(0);
  });
});

describe('extractFavicons (re-exported)', () => {
  it('returns empty array when no icons are present', () => {
    expect(extractFavicons()).toEqual([]);
  });

  it('extracts a favicon link', () => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'icon');
    link.setAttribute('href', '/favicon.png');
    link.setAttribute('sizes', '16x16');
    document.head.appendChild(link);

    const favicons = extractFavicons();

    expect(favicons.length).toBe(1);
    expect(favicons[0].size).toBe('16x16');
  });
});

describe('isImageKey (re-exported)', () => {
  it('identifies image keys', () => {
    expect(isImageKey('image')).toBe(true);
    expect(isImageKey('logo')).toBe(true);
    expect(isImageKey('thumbnail')).toBe(true);
  });

  it('rejects image metadata keys', () => {
    expect(isImageKey('image:width')).toBe(false);
    expect(isImageKey('image:height')).toBe(false);
    expect(isImageKey('image:alt')).toBe(false);
  });

  it('rejects non-image keys', () => {
    expect(isImageKey('title')).toBe(false);
    expect(isImageKey('description')).toBe(false);
  });
});
