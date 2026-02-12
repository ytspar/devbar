// @vitest-environment node

/**
 * H5: A11y handler tests
 *
 * Tests handleSaveA11y which delegates to saveMarkdownArtifact.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSaveMarkdownArtifact } = vi.hoisted(() => ({
  mockSaveMarkdownArtifact: vi.fn().mockResolvedValue(
    '/mock/project/.tmp/sweetlink-screenshots/a11y-homepage-2024-01-15T10-30-00-000Z.md',
  ),
}));

vi.mock('./saveMarkdown.js', () => ({
  saveMarkdownArtifact: mockSaveMarkdownArtifact,
}));

import { handleSaveA11y } from './a11y.js';

describe('handleSaveA11y', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls saveMarkdownArtifact with type "a11y"', async () => {
    const data = {
      markdown: '## Violations\n\n- Missing alt text on 3 images',
      url: 'https://example.com/',
      title: 'Homepage',
      timestamp: 1705312200000,
    };

    await handleSaveA11y(data);

    expect(mockSaveMarkdownArtifact).toHaveBeenCalledWith({
      type: 'a11y',
      markdown: '## Violations\n\n- Missing alt text on 3 images',
      url: 'https://example.com/',
      title: 'Homepage',
      timestamp: 1705312200000,
    });
  });

  it('returns the a11yPath from saveMarkdownArtifact', async () => {
    const result = await handleSaveA11y({
      markdown: 'Some audit content',
      url: 'https://example.com/about',
      title: 'About',
      timestamp: 1705312200000,
    });

    expect(result).toEqual({
      a11yPath:
        '/mock/project/.tmp/sweetlink-screenshots/a11y-homepage-2024-01-15T10-30-00-000Z.md',
    });
  });

  it('uses fallback markdown when markdown is empty', async () => {
    await handleSaveA11y({
      markdown: '',
      url: 'https://example.com/',
      title: 'Clean Page',
      timestamp: 1705312200000,
    });

    expect(mockSaveMarkdownArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        markdown: '_No accessibility violations found_',
      }),
    );
  });

  it('passes through non-empty markdown without modification', async () => {
    const markdown = '## Critical\n\n- Buttons without accessible names\n\n## Serious\n\n- Low contrast text';
    await handleSaveA11y({
      markdown,
      url: 'https://example.com/dashboard',
      title: 'Dashboard',
      timestamp: 1705312200000,
    });

    expect(mockSaveMarkdownArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ markdown }),
    );
  });

  it('propagates errors from saveMarkdownArtifact', async () => {
    mockSaveMarkdownArtifact.mockRejectedValueOnce(new Error('Permission denied'));

    await expect(
      handleSaveA11y({
        markdown: 'content',
        url: 'https://example.com/',
        title: 'Test',
        timestamp: 1705312200000,
      }),
    ).rejects.toThrow('Permission denied');
  });

  it('passes all data fields correctly', async () => {
    const data = {
      markdown: '## No Issues\n\nAll checks passed.',
      url: 'https://mysite.dev/contact',
      title: 'Contact Us',
      timestamp: 1700000000000,
    };

    await handleSaveA11y(data);

    const call = mockSaveMarkdownArtifact.mock.calls[0][0];
    expect(call.type).toBe('a11y');
    expect(call.url).toBe('https://mysite.dev/contact');
    expect(call.title).toBe('Contact Us');
    expect(call.timestamp).toBe(1700000000000);
  });
});

describe('A11ySaveResult type', () => {
  it('exports the correct result shape', async () => {
    const result = await handleSaveA11y({
      markdown: 'test',
      url: 'https://example.com',
      title: 'Test',
      timestamp: Date.now(),
    });

    expect(result).toHaveProperty('a11yPath');
    expect(typeof result.a11yPath).toBe('string');
  });
});
