// @vitest-environment node

/**
 * Schema Handler Tests
 *
 * Tests handleSaveSchema which appends raw JSON to the markdown
 * before delegating to saveMarkdownArtifact.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSaveMarkdownArtifact } = vi.hoisted(() => ({
  mockSaveMarkdownArtifact: vi.fn().mockResolvedValue(
    '/mock/project/.tmp/sweetlink-screenshots/schema-products-2023-11-14T22-13-20-000Z.md',
  ),
}));

vi.mock('./saveMarkdown.js', () => ({
  saveMarkdownArtifact: mockSaveMarkdownArtifact,
}));

import { handleSaveSchema } from './schema.js';

describe('handleSaveSchema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls saveMarkdownArtifact with type "schema" and appended JSON', async () => {
    const schema = { '@type': 'Product', name: 'Widget' };
    const data = {
      schema,
      markdown: '## Structured Data\n- Product: Widget',
      url: 'https://example.com/products',
      title: 'Products',
      timestamp: 1700000000000,
    };

    await handleSaveSchema(data);

    expect(mockSaveMarkdownArtifact).toHaveBeenCalledTimes(1);
    const callArgs = mockSaveMarkdownArtifact.mock.calls[0][0];

    expect(callArgs.type).toBe('schema');
    expect(callArgs.url).toBe('https://example.com/products');
    expect(callArgs.title).toBe('Products');
    expect(callArgs.timestamp).toBe(1700000000000);

    // Markdown should contain original markdown + separator + raw JSON block
    expect(callArgs.markdown).toContain('## Structured Data\n- Product: Widget');
    expect(callArgs.markdown).toContain('---');
    expect(callArgs.markdown).toContain('## Raw JSON');
    expect(callArgs.markdown).toContain('```json');
    expect(callArgs.markdown).toContain(JSON.stringify(schema, null, 2));
    expect(callArgs.markdown).toContain('```');
  });

  it('returns the schemaPath from saveMarkdownArtifact', async () => {
    const result = await handleSaveSchema({
      schema: { test: true },
      markdown: 'Schema info',
      url: 'https://example.com/',
      title: 'Home',
      timestamp: 1700000000000,
    });

    expect(result).toEqual({
      schemaPath:
        '/mock/project/.tmp/sweetlink-screenshots/schema-products-2023-11-14T22-13-20-000Z.md',
    });
  });

  it('uses fallback markdown when markdown is empty', async () => {
    await handleSaveSchema({
      schema: {},
      markdown: '',
      url: 'https://example.com/',
      title: 'Home',
      timestamp: 1700000000000,
    });

    const callArgs = mockSaveMarkdownArtifact.mock.calls[0][0];
    expect(callArgs.markdown).toContain('_No structured data found on this page_');
    // Still should have the raw JSON section
    expect(callArgs.markdown).toContain('## Raw JSON');
  });

  it('serializes complex nested schema objects', async () => {
    const complexSchema = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      mainEntity: {
        '@type': 'Organization',
        name: 'Acme Corp',
        employees: [
          { '@type': 'Person', name: 'Alice' },
          { '@type': 'Person', name: 'Bob' },
        ],
      },
    };

    await handleSaveSchema({
      schema: complexSchema,
      markdown: 'Complex schema',
      url: 'https://example.com/',
      title: 'Home',
      timestamp: 1700000000000,
    });

    const callArgs = mockSaveMarkdownArtifact.mock.calls[0][0];
    expect(callArgs.markdown).toContain('"@context": "https://schema.org"');
    expect(callArgs.markdown).toContain('"name": "Alice"');
    expect(callArgs.markdown).toContain('"name": "Bob"');
  });

  it('handles null schema values', async () => {
    await handleSaveSchema({
      schema: null,
      markdown: 'No schema',
      url: 'https://example.com/',
      title: 'Home',
      timestamp: 1700000000000,
    });

    const callArgs = mockSaveMarkdownArtifact.mock.calls[0][0];
    expect(callArgs.markdown).toContain('null');
  });

  it('propagates errors from saveMarkdownArtifact', async () => {
    mockSaveMarkdownArtifact.mockRejectedValueOnce(new Error('IO error'));

    await expect(
      handleSaveSchema({
        schema: {},
        markdown: 'content',
        url: 'https://example.com/',
        title: 'Test',
        timestamp: 1700000000000,
      }),
    ).rejects.toThrow('IO error');
  });
});
