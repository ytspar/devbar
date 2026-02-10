// @vitest-environment node

/**
 * Design Review Handler Tests
 *
 * Tests handleDesignReviewScreenshot which saves a screenshot,
 * calls Claude Vision API, and saves the review markdown.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockMkdir, mockWriteFile, mockCallClaude } = vi.hoisted(() => ({
  mockMkdir: vi.fn().mockResolvedValue(undefined),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
  mockCallClaude: vi.fn().mockResolvedValue({
    content: [
      { type: 'text', text: '# Design Review\n\n## Summary\nLooks great!' },
    ],
    usage: {
      input_tokens: 1000,
      output_tokens: 500,
    },
  }),
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

vi.mock('../../browser/screenshotUtils.js', () => ({
  extractBase64FromDataUrl: vi.fn((url: string) =>
    url.replace(/^data:image\/(png|jpeg);base64,/, ''),
  ),
  getMediaTypeFromDataUrl: vi.fn((url: string) =>
    url.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
  ),
}));

vi.mock('../anthropic.js', () => ({
  CLAUDE_MODEL: 'claude-test-model',
  CLAUDE_MAX_TOKENS: 2048,
  CLAUDE_PRICING: { input: 15, output: 75 },
  callClaude: mockCallClaude,
}));

import {
  handleDesignReviewScreenshot,
  DESIGN_REVIEW_PROMPT,
} from './designReview.js';

const FAKE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAUA';
const FAKE_DATA_URL = `data:image/png;base64,${FAKE_BASE64}`;

function makeDesignReviewData(overrides: Record<string, unknown> = {}) {
  return {
    screenshot: FAKE_DATA_URL,
    url: 'https://example.com/',
    timestamp: 1700000000000,
    width: 1920,
    height: 1080,
    ...overrides,
  };
}

describe('handleDesignReviewScreenshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the screenshot directory', async () => {
    await handleDesignReviewScreenshot(makeDesignReviewData());

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('.tmp/sweetlink-screenshots'),
      { recursive: true },
    );
  });

  it('saves the screenshot as a PNG file', async () => {
    await handleDesignReviewScreenshot(makeDesignReviewData());

    const writeFileCalls = mockWriteFile.mock.calls;
    const [screenshotPath, screenshotData] = writeFileCalls[0];

    expect(screenshotPath).toMatch(/design-review-.*\.png$/);
    expect(Buffer.isBuffer(screenshotData)).toBe(true);
  });

  it('calls Claude API with image and design review prompt', async () => {
    await handleDesignReviewScreenshot(makeDesignReviewData());

    expect(mockCallClaude).toHaveBeenCalledTimes(1);
    const payload = mockCallClaude.mock.calls[0][0];

    expect(payload.model).toBe('claude-test-model');
    expect(payload.max_tokens).toBe(2048);
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0].role).toBe('user');

    const content = payload.messages[0].content;
    expect(content).toHaveLength(2);

    // First block: image
    expect(content[0].type).toBe('image');
    expect(content[0].source.type).toBe('base64');
    expect(content[0].source.media_type).toBe('image/png');
    expect(content[0].source.data).toBe(FAKE_BASE64);

    // Second block: text prompt
    expect(content[1].type).toBe('text');
    expect(content[1].text).toBe(DESIGN_REVIEW_PROMPT);
  });

  it('saves review markdown with frontmatter and content', async () => {
    await handleDesignReviewScreenshot(makeDesignReviewData());

    const writeFileCalls = mockWriteFile.mock.calls;
    // First write = screenshot, second write = markdown
    const [mdPath, mdContent, encoding] = writeFileCalls[1];

    expect(mdPath).toMatch(/design-review-.*\.md$/);
    expect(encoding).toBe('utf-8');

    // Frontmatter
    expect(mdContent).toContain('url: https://example.com/');
    expect(mdContent).toContain('dimensions: 1920x1080');
    expect(mdContent).toContain('model: claude-test-model');
    expect(mdContent).toContain('input: 1000');
    expect(mdContent).toContain('output: 500');
    expect(mdContent).toContain('total: 1500');

    // Cost calculations: input = 1000/1M * 15 = 0.0150, output = 500/1M * 75 = 0.0375
    expect(mdContent).toContain('$0.0150');
    expect(mdContent).toContain('$0.0375');
    expect(mdContent).toContain('$0.0525');

    // Review content
    expect(mdContent).toContain('# Design Review');
    expect(mdContent).toContain('Looks great!');
  });

  it('returns screenshotPath and reviewPath', async () => {
    const result = await handleDesignReviewScreenshot(makeDesignReviewData());

    expect(result).toHaveProperty('screenshotPath');
    expect(result).toHaveProperty('reviewPath');
    expect(result.screenshotPath).toMatch(/\.png$/);
    expect(result.reviewPath).toMatch(/\.md$/);
  });

  it('includes console logs summary with errors and warnings', async () => {
    const logs = [
      {
        timestamp: 1700000000000,
        level: 'error',
        message: 'Failed to load image',
      },
      {
        timestamp: 1700000000001,
        level: 'warn',
        message: 'Deprecated CSS',
      },
      { timestamp: 1700000000002, level: 'log', message: 'Page loaded' },
    ];

    await handleDesignReviewScreenshot(makeDesignReviewData({ logs }));

    const writeFileCalls = mockWriteFile.mock.calls;
    const mdContent = writeFileCalls[1][1] as string;

    expect(mdContent).toContain('## Console Logs Summary');
    expect(mdContent).toContain('**ERROR**: Failed to load image');
    expect(mdContent).toContain('**WARN**: Deprecated CSS');
    // Regular log messages should NOT appear (only error/warn are included)
    expect(mdContent).not.toContain('Page loaded');
  });

  it('shows "no console logs captured" when logs are not provided', async () => {
    await handleDesignReviewScreenshot(makeDesignReviewData());

    const writeFileCalls = mockWriteFile.mock.calls;
    const mdContent = writeFileCalls[1][1] as string;
    expect(mdContent).toContain('_No console logs captured_');
  });

  it('shows "no errors or warnings" when logs have no errors/warnings', async () => {
    const logs = [
      { timestamp: 1700000000000, level: 'log', message: 'All good' },
    ];

    await handleDesignReviewScreenshot(makeDesignReviewData({ logs }));

    const writeFileCalls = mockWriteFile.mock.calls;
    const mdContent = writeFileCalls[1][1] as string;
    expect(mdContent).toContain('_No errors or warnings in console_');
  });

  it('handles multiple text blocks in Claude response', async () => {
    mockCallClaude.mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'Part 1' },
        { type: 'text', text: 'Part 2' },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    await handleDesignReviewScreenshot(makeDesignReviewData());

    const writeFileCalls = mockWriteFile.mock.calls;
    const mdContent = writeFileCalls[1][1] as string;
    expect(mdContent).toContain('Part 1');
    expect(mdContent).toContain('Part 2');
  });

  it('filters out non-text blocks from Claude response', async () => {
    mockCallClaude.mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'Review text' },
        { type: 'tool_use', id: 'test', name: 'test', input: {} },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    await handleDesignReviewScreenshot(makeDesignReviewData());

    const writeFileCalls = mockWriteFile.mock.calls;
    const mdContent = writeFileCalls[1][1] as string;
    expect(mdContent).toContain('Review text');
  });

  it('propagates Claude API errors', async () => {
    mockCallClaude.mockRejectedValueOnce(
      new Error('ANTHROPIC_API_KEY environment variable is not set'),
    );

    await expect(
      handleDesignReviewScreenshot(makeDesignReviewData()),
    ).rejects.toThrow('ANTHROPIC_API_KEY environment variable is not set');
  });

  it('propagates fs errors', async () => {
    mockMkdir.mockRejectedValueOnce(new Error('Cannot create directory'));

    await expect(
      handleDesignReviewScreenshot(makeDesignReviewData()),
    ).rejects.toThrow('Cannot create directory');
  });

  it('DESIGN_REVIEW_PROMPT is a non-empty string', () => {
    expect(typeof DESIGN_REVIEW_PROMPT).toBe('string');
    expect(DESIGN_REVIEW_PROMPT.length).toBeGreaterThan(100);
    expect(DESIGN_REVIEW_PROMPT).toContain('Visual Bugs');
    expect(DESIGN_REVIEW_PROMPT).toContain('Accessibility');
  });
});
