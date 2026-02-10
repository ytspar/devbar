// @vitest-environment node

/**
 * saveMarkdownArtifact Tests
 *
 * Tests the shared utility for saving markdown artifacts (outlines, schemas, console logs)
 * to the file system with consistent frontmatter and directory handling.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted so mock fns are available inside vi.mock factories (which are hoisted)
const { mockMkdir, mockWriteFile } = vi.hoisted(() => ({
  mockMkdir: vi.fn().mockResolvedValue(undefined),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs', () => ({
  promises: {
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
  },
}));

vi.mock('../index.js', () => ({
  getProjectRoot: vi.fn(() => '/mock/project'),
}));

import { saveMarkdownArtifact } from './saveMarkdown.js';

describe('saveMarkdownArtifact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the screenshot directory recursively', async () => {
    await saveMarkdownArtifact({
      type: 'outline',
      markdown: '## Heading\n- Item 1',
      url: 'https://example.com/about',
      title: 'About Page',
      timestamp: 1700000000000,
    });

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('.tmp/sweetlink-screenshots'),
      { recursive: true },
    );
  });

  it('writes the markdown file with correct frontmatter', async () => {
    await saveMarkdownArtifact({
      type: 'outline',
      markdown: '## Heading\n- Item 1',
      url: 'https://example.com/about',
      title: 'About Page',
      timestamp: 1700000000000,
    });

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [filePath, content, encoding] = mockWriteFile.mock.calls[0];

    // File path should end with .md and contain 'outline'
    expect(filePath).toMatch(/outline.*\.md$/);
    expect(encoding).toBe('utf-8');

    // Check frontmatter
    expect(content).toContain('---');
    expect(content).toContain('title: About Page');
    expect(content).toContain('url: https://example.com/about');
    expect(content).toContain('timestamp:');

    // Check heading is capitalized
    expect(content).toContain('# Outline');

    // Check page reference
    expect(content).toContain('> Page: About Page');

    // Check body content
    expect(content).toContain('## Heading\n- Item 1');
  });

  it('returns the absolute file path', async () => {
    const result = await saveMarkdownArtifact({
      type: 'console-logs',
      markdown: 'Log content here',
      url: 'https://example.com/',
      title: 'Home',
      timestamp: 1700000000000,
    });

    expect(typeof result).toBe('string');
    expect(result).toMatch(/\.md$/);
    expect(result).toContain('console-logs');
  });

  it('capitalizes multi-word type names in heading', async () => {
    await saveMarkdownArtifact({
      type: 'console-logs',
      markdown: 'some logs',
      url: 'https://example.com/',
      title: 'Home',
      timestamp: 1700000000000,
    });

    const content = mockWriteFile.mock.calls[0][1] as string;
    expect(content).toContain('# Console Logs');
  });

  it('uses URL as fallback when title is empty', async () => {
    await saveMarkdownArtifact({
      type: 'schema',
      markdown: 'schema data',
      url: 'https://example.com/products',
      title: '',
      timestamp: 1700000000000,
    });

    const content = mockWriteFile.mock.calls[0][1] as string;
    // When title is empty, the frontmatter title falls back to the type heading
    expect(content).toContain('title: Schema');
    // The page reference line should use the url as fallback
    expect(content).toContain('> Page: https://example.com/products');
  });

  it('includes the generated timestamp in filename', async () => {
    const timestamp = 1700000000000;
    const result = await saveMarkdownArtifact({
      type: 'outline',
      markdown: 'content',
      url: 'https://example.com/',
      title: 'Home',
      timestamp,
    });

    // The filename should contain a date string derived from the timestamp
    const expectedDateFragment = new Date(timestamp)
      .toISOString()
      .replace(/[:.]/g, '-');
    expect(result).toContain(expectedDateFragment);
  });

  it('generates slug from URL path for filename', async () => {
    const result = await saveMarkdownArtifact({
      type: 'outline',
      markdown: 'content',
      url: 'https://example.com/docs/getting-started',
      title: 'Getting Started',
      timestamp: 1700000000000,
    });

    // Should include a slug derived from /docs/getting-started
    expect(result).toContain('docs-getting-started');
  });

  it('propagates fs.mkdir errors', async () => {
    mockMkdir.mockRejectedValueOnce(new Error('Permission denied'));

    await expect(
      saveMarkdownArtifact({
        type: 'outline',
        markdown: 'content',
        url: 'https://example.com/',
        title: 'Test',
        timestamp: 1700000000000,
      }),
    ).rejects.toThrow('Permission denied');
  });

  it('propagates fs.writeFile errors', async () => {
    mockWriteFile.mockRejectedValueOnce(new Error('Disk full'));

    await expect(
      saveMarkdownArtifact({
        type: 'schema',
        markdown: 'content',
        url: 'https://example.com/',
        title: 'Test',
        timestamp: 1700000000000,
      }),
    ).rejects.toThrow('Disk full');
  });
});
