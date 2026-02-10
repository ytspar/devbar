// @vitest-environment node

/**
 * Console Logs Handler Tests
 *
 * Tests handleSaveConsoleLogs which delegates to saveMarkdownArtifact.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSaveMarkdownArtifact } = vi.hoisted(() => ({
  mockSaveMarkdownArtifact: vi.fn().mockResolvedValue(
    '/mock/project/.tmp/sweetlink-screenshots/console-logs-index-2023-11-14T22-13-20-000Z.md',
  ),
}));

vi.mock('./saveMarkdown.js', () => ({
  saveMarkdownArtifact: mockSaveMarkdownArtifact,
}));

import { handleSaveConsoleLogs } from './consoleLogs.js';

describe('handleSaveConsoleLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls saveMarkdownArtifact with correct parameters', async () => {
    const data = {
      logs: [{ level: 'error', message: 'something broke', timestamp: 123 }],
      markdown: '## Console Logs\n- ERROR: something broke',
      url: 'https://example.com/',
      title: 'Home Page',
      timestamp: 1700000000000,
    };

    await handleSaveConsoleLogs(data);

    expect(mockSaveMarkdownArtifact).toHaveBeenCalledWith({
      type: 'console-logs',
      markdown: '## Console Logs\n- ERROR: something broke',
      url: 'https://example.com/',
      title: 'Home Page',
      timestamp: 1700000000000,
    });
  });

  it('returns the consoleLogsPath from saveMarkdownArtifact', async () => {
    const result = await handleSaveConsoleLogs({
      logs: [],
      markdown: 'Some logs',
      url: 'https://example.com/',
      title: 'Home',
      timestamp: 1700000000000,
    });

    expect(result).toEqual({
      consoleLogsPath:
        '/mock/project/.tmp/sweetlink-screenshots/console-logs-index-2023-11-14T22-13-20-000Z.md',
    });
  });

  it('uses fallback markdown when markdown is empty', async () => {
    await handleSaveConsoleLogs({
      logs: [],
      markdown: '',
      url: 'https://example.com/',
      title: 'Home',
      timestamp: 1700000000000,
    });

    expect(mockSaveMarkdownArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        markdown: '_No console logs recorded_',
      }),
    );
  });

  it('propagates errors from saveMarkdownArtifact', async () => {
    mockSaveMarkdownArtifact.mockRejectedValueOnce(new Error('Write failed'));

    await expect(
      handleSaveConsoleLogs({
        logs: [],
        markdown: 'content',
        url: 'https://example.com/',
        title: 'Test',
        timestamp: 1700000000000,
      }),
    ).rejects.toThrow('Write failed');
  });
});
