// @vitest-environment node

/**
 * Outline Handler Tests
 *
 * Tests handleSaveOutline which delegates to saveMarkdownArtifact.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSaveMarkdownArtifact } = vi.hoisted(() => ({
  mockSaveMarkdownArtifact: vi.fn().mockResolvedValue(
    '/mock/project/.tmp/sweetlink-screenshots/outline-about-2023-11-14T22-13-20-000Z.md',
  ),
}));

vi.mock('./saveMarkdown.js', () => ({
  saveMarkdownArtifact: mockSaveMarkdownArtifact,
}));

import { handleSaveOutline } from './outline.js';

describe('handleSaveOutline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls saveMarkdownArtifact with type "outline"', async () => {
    const data = {
      outline: [
        { level: 1, text: 'Introduction' },
        { level: 2, text: 'Getting Started' },
      ],
      markdown: '# Introduction\n## Getting Started',
      url: 'https://example.com/docs',
      title: 'Documentation',
      timestamp: 1700000000000,
    };

    await handleSaveOutline(data);

    expect(mockSaveMarkdownArtifact).toHaveBeenCalledWith({
      type: 'outline',
      markdown: '# Introduction\n## Getting Started',
      url: 'https://example.com/docs',
      title: 'Documentation',
      timestamp: 1700000000000,
    });
  });

  it('returns the outlinePath from saveMarkdownArtifact', async () => {
    const result = await handleSaveOutline({
      outline: [],
      markdown: 'Outline content',
      url: 'https://example.com/about',
      title: 'About',
      timestamp: 1700000000000,
    });

    expect(result).toEqual({
      outlinePath:
        '/mock/project/.tmp/sweetlink-screenshots/outline-about-2023-11-14T22-13-20-000Z.md',
    });
  });

  it('uses fallback markdown when markdown is empty', async () => {
    await handleSaveOutline({
      outline: [],
      markdown: '',
      url: 'https://example.com/',
      title: 'Home',
      timestamp: 1700000000000,
    });

    expect(mockSaveMarkdownArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        markdown: '_No headings found in this document_',
      }),
    );
  });

  it('passes through non-empty markdown without modification', async () => {
    const markdown = '## Section 1\n### Subsection\n## Section 2';
    await handleSaveOutline({
      outline: [{ level: 2, text: 'Section 1' }],
      markdown,
      url: 'https://example.com/',
      title: 'Home',
      timestamp: 1700000000000,
    });

    expect(mockSaveMarkdownArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ markdown }),
    );
  });

  it('propagates errors from saveMarkdownArtifact', async () => {
    mockSaveMarkdownArtifact.mockRejectedValueOnce(new Error('Disk error'));

    await expect(
      handleSaveOutline({
        outline: [],
        markdown: 'content',
        url: 'https://example.com/',
        title: 'Test',
        timestamp: 1700000000000,
      }),
    ).rejects.toThrow('Disk error');
  });
});
