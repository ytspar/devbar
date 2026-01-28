import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractPageSchema, schemaToMarkdown } from './schema.js';
import type { PageSchema } from './types.js';

describe('extractPageSchema', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('returns empty schema for page with no structured data', () => {
    const schema = extractPageSchema();

    expect(schema.jsonLd).toEqual([]);
    expect(schema.metaTags).toEqual({});
    expect(schema.openGraph).toEqual({});
    expect(schema.twitter).toEqual({});
    expect(schema.microdata).toEqual([]);
  });

  it('extracts JSON-LD schema', () => {
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Test Org',
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);

    const schema = extractPageSchema();

    expect(schema.jsonLd.length).toBe(1);
    const firstSchema = schema.jsonLd[0] as Record<string, unknown>;
    expect(firstSchema['@type']).toBe('Organization');
    expect(firstSchema.name).toBe('Test Org');
  });

  it('extracts multiple JSON-LD scripts', () => {
    const schemas = [
      { '@type': 'WebPage' },
      { '@type': 'BreadcrumbList' },
    ];

    schemas.forEach(s => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(s);
      document.head.appendChild(script);
    });

    const schema = extractPageSchema();

    expect(schema.jsonLd.length).toBe(2);
  });

  it('handles invalid JSON-LD gracefully', () => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = '{invalid json}';
    document.head.appendChild(script);

    const schema = extractPageSchema();

    expect(schema.jsonLd.length).toBe(0);
  });

  it('extracts Open Graph meta tags', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'og:title');
    meta.setAttribute('content', 'Test Title');
    document.head.appendChild(meta);

    const meta2 = document.createElement('meta');
    meta2.setAttribute('property', 'og:description');
    meta2.setAttribute('content', 'Test Description');
    document.head.appendChild(meta2);

    const schema = extractPageSchema();

    expect(schema.openGraph.title).toBe('Test Title');
    expect(schema.openGraph.description).toBe('Test Description');
  });

  it('extracts Twitter card meta tags', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'twitter:card');
    meta.setAttribute('content', 'summary_large_image');
    document.head.appendChild(meta);

    const meta2 = document.createElement('meta');
    meta2.setAttribute('name', 'twitter:site');
    meta2.setAttribute('content', '@testaccount');
    document.head.appendChild(meta2);

    const schema = extractPageSchema();

    expect(schema.twitter.card).toBe('summary_large_image');
    expect(schema.twitter.site).toBe('@testaccount');
  });

  it('extracts standard meta tags', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'description');
    meta.setAttribute('content', 'Page description');
    document.head.appendChild(meta);

    const meta2 = document.createElement('meta');
    meta2.setAttribute('name', 'author');
    meta2.setAttribute('content', 'John Doe');
    document.head.appendChild(meta2);

    const schema = extractPageSchema();

    expect(schema.metaTags.description).toBe('Page description');
    expect(schema.metaTags.author).toBe('John Doe');
  });

  it('extracts microdata', () => {
    const div = document.createElement('div');
    div.setAttribute('itemscope', '');
    div.setAttribute('itemtype', 'https://schema.org/Product');

    const nameSpan = document.createElement('span');
    nameSpan.setAttribute('itemprop', 'name');
    nameSpan.textContent = 'Test Product';
    div.appendChild(nameSpan);

    const priceSpan = document.createElement('span');
    priceSpan.setAttribute('itemprop', 'price');
    priceSpan.setAttribute('content', '29.99');
    div.appendChild(priceSpan);

    document.body.appendChild(div);

    const schema = extractPageSchema();

    expect(schema.microdata.length).toBe(1);
    expect(schema.microdata[0].type).toBe('https://schema.org/Product');
    expect(schema.microdata[0].properties.name).toBe('Test Product');
    expect(schema.microdata[0].properties.price).toBe('29.99');
  });

  it('extracts microdata with href values', () => {
    const div = document.createElement('div');
    div.setAttribute('itemscope', '');
    div.setAttribute('itemtype', 'https://schema.org/WebPage');

    const link = document.createElement('a');
    link.setAttribute('itemprop', 'url');
    link.setAttribute('href', 'https://example.com');
    link.textContent = 'Link';
    div.appendChild(link);

    document.body.appendChild(div);

    const schema = extractPageSchema();

    expect(schema.microdata[0].properties.url).toBe('https://example.com');
  });
});

describe('schemaToMarkdown', () => {
  it('returns message when no structured data', () => {
    const schema: PageSchema = {
      jsonLd: [],
      metaTags: {},
      openGraph: {},
      twitter: {},
      microdata: [],
    };

    const md = schemaToMarkdown(schema);

    expect(md).toBe('_No structured data found on this page_\n');
  });

  it('formats JSON-LD as code blocks', () => {
    const schema: PageSchema = {
      jsonLd: [{ '@type': 'Organization', name: 'Test' }],
      metaTags: {},
      openGraph: {},
      twitter: {},
      microdata: [],
    };

    const md = schemaToMarkdown(schema);

    expect(md).toContain('## JSON-LD');
    expect(md).toContain('### Schema 1');
    expect(md).toContain('```json');
    expect(md).toContain('"@type": "Organization"');
  });

  it('formats Open Graph data as list', () => {
    const schema: PageSchema = {
      jsonLd: [],
      metaTags: {},
      openGraph: { title: 'Test Title', description: 'Test Desc' },
      twitter: {},
      microdata: [],
    };

    const md = schemaToMarkdown(schema);

    expect(md).toContain('## Open Graph');
    expect(md).toContain('- **title**: Test Title');
    expect(md).toContain('- **description**: Test Desc');
  });

  it('formats Twitter cards data', () => {
    const schema: PageSchema = {
      jsonLd: [],
      metaTags: {},
      openGraph: {},
      twitter: { card: 'summary', site: '@test' },
      microdata: [],
    };

    const md = schemaToMarkdown(schema);

    expect(md).toContain('## Twitter Cards');
    expect(md).toContain('- **card**: summary');
    expect(md).toContain('- **site**: @test');
  });

  it('formats meta tags', () => {
    const schema: PageSchema = {
      jsonLd: [],
      metaTags: { description: 'Page desc', author: 'Jane' },
      openGraph: {},
      twitter: {},
      microdata: [],
    };

    const md = schemaToMarkdown(schema);

    expect(md).toContain('## Meta Tags');
    expect(md).toContain('- **description**: Page desc');
    expect(md).toContain('- **author**: Jane');
  });

  it('formats microdata items', () => {
    const schema: PageSchema = {
      jsonLd: [],
      metaTags: {},
      openGraph: {},
      twitter: {},
      microdata: [
        {
          type: 'https://schema.org/Product',
          properties: { name: 'Widget', price: '9.99' },
        },
      ],
    };

    const md = schemaToMarkdown(schema);

    expect(md).toContain('## Microdata');
    expect(md).toContain('### Item 1 (https://schema.org/Product)');
    expect(md).toContain('- **name**: Widget');
    expect(md).toContain('- **price**: 9.99');
  });

  it('formats microdata without type', () => {
    const schema: PageSchema = {
      jsonLd: [],
      metaTags: {},
      openGraph: {},
      twitter: {},
      microdata: [{ type: null, properties: { value: 'test' } }],
    };

    const md = schemaToMarkdown(schema);

    expect(md).toContain('### Item 1\n');
    expect(md).not.toContain('(null)');
  });
});
