// @vitest-environment node

/**
 * Screenshot Handler Tests
 *
 * Tests handleSaveScreenshot which saves a screenshot image,
 * metadata JSON, console logs (text + JSON), and optional a11y report.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../browser/screenshotUtils.js', () => ({
  extractBase64FromDataUrl: vi.fn((url: string) =>
    url.replace(/^data:image\/(png|jpeg);base64,/, ''),
  ),
}));

import { handleSaveScreenshot } from './screenshot.js';

const FAKE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAUA';
const FAKE_DATA_URL = `data:image/jpeg;base64,${FAKE_BASE64}`;

function makeScreenshotData(overrides: Record<string, unknown> = {}) {
  return {
    screenshot: FAKE_DATA_URL,
    url: 'https://example.com/',
    timestamp: 1700000000000,
    width: 1920,
    height: 1080,
    ...overrides,
  };
}

describe('handleSaveScreenshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the screenshot directory recursively', async () => {
    await handleSaveScreenshot(makeScreenshotData());

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('.tmp/sweetlink-screenshots'),
      { recursive: true },
    );
  });

  it('saves the screenshot as a binary JPEG file', async () => {
    await handleSaveScreenshot(makeScreenshotData());

    const writeFileCalls = mockWriteFile.mock.calls;
    // First writeFile call should be the screenshot binary
    const [screenshotPath, screenshotData] = writeFileCalls[0];

    expect(screenshotPath).toMatch(/screenshot-.*\.jpg$/);
    expect(Buffer.isBuffer(screenshotData)).toBe(true);
  });

  it('saves metadata JSON file', async () => {
    await handleSaveScreenshot(makeScreenshotData());

    const writeFileCalls = mockWriteFile.mock.calls;
    // Second writeFile call should be the metadata JSON
    const [metadataPath, metadataContent, encoding] = writeFileCalls[1];

    expect(metadataPath).toMatch(/-metrics\.json$/);
    expect(encoding).toBe('utf-8');

    const metadata = JSON.parse(metadataContent);
    expect(metadata.url).toBe('https://example.com/');
    expect(metadata.viewport).toEqual({ width: 1920, height: 1080 });
    expect(metadata.capturedAt).toBe(new Date(1700000000000).toISOString());
  });

  it('returns the screenshot file path', async () => {
    const result = await handleSaveScreenshot(makeScreenshotData());

    expect(typeof result).toBe('string');
    expect(result).toMatch(/screenshot-.*\.jpg$/);
  });

  it('includes webVitals in metadata when provided', async () => {
    await handleSaveScreenshot(
      makeScreenshotData({ webVitals: { fcp: 120, lcp: 450 } }),
    );

    const writeFileCalls = mockWriteFile.mock.calls;
    const metadata = JSON.parse(writeFileCalls[1][1]);
    expect(metadata.webVitals).toEqual({ fcp: 120, lcp: 450 });
  });

  it('includes pageSize in metadata when provided', async () => {
    await handleSaveScreenshot(makeScreenshotData({ pageSize: 524288 }));

    const writeFileCalls = mockWriteFile.mock.calls;
    const metadata = JSON.parse(writeFileCalls[1][1]);
    expect(metadata.pageSize).toBe(524288);
  });

  it('omits webVitals from metadata when empty object', async () => {
    await handleSaveScreenshot(makeScreenshotData({ webVitals: {} }));

    const writeFileCalls = mockWriteFile.mock.calls;
    const metadata = JSON.parse(writeFileCalls[1][1]);
    expect(metadata.webVitals).toBeUndefined();
  });

  it('saves console logs as text and JSON when logs are provided', async () => {
    const logs = [
      { timestamp: 1700000000000, level: 'log', message: 'Page loaded' },
      { timestamp: 1700000000001, level: 'error', message: 'Failed to fetch' },
      { timestamp: 1700000000002, level: 'warn', message: 'Deprecated API' },
    ];

    await handleSaveScreenshot(makeScreenshotData({ logs }));

    const writeFileCalls = mockWriteFile.mock.calls;
    // Expect: screenshot binary, metadata JSON, logs text, logs JSON = 4 calls
    expect(writeFileCalls.length).toBe(4);

    // Logs text file
    const [logsTextPath, logsTextContent] = writeFileCalls[2];
    expect(logsTextPath).toMatch(/-logs\.txt$/);
    expect(logsTextContent).toContain('=== CONSOLE LOGS ===');
    expect(logsTextContent).toContain('ERROR: Failed to fetch');
    expect(logsTextContent).toContain('WARN: Deprecated API');

    // Logs JSON file
    const [logsJsonPath, logsJsonContent] = writeFileCalls[3];
    expect(logsJsonPath).toMatch(/-logs\.json$/);
    const logsJson = JSON.parse(logsJsonContent);
    expect(logsJson.logs).toHaveLength(3);
    expect(logsJson.meta.url).toBe('https://example.com/');
  });

  it('includes console summary in metadata when logs are provided', async () => {
    const logs = [
      { timestamp: 1700000000000, level: 'error', message: 'err1' },
      { timestamp: 1700000000001, level: 'error', message: 'err2' },
      { timestamp: 1700000000002, level: 'warn', message: 'warn1' },
      { timestamp: 1700000000003, level: 'log', message: 'info1' },
    ];

    await handleSaveScreenshot(makeScreenshotData({ logs }));

    const writeFileCalls = mockWriteFile.mock.calls;
    const metadata = JSON.parse(writeFileCalls[1][1]);
    expect(metadata.consoleSummary).toEqual({
      errors: 2,
      warnings: 1,
      total: 4,
    });
  });

  it('does not save log files when no logs are provided', async () => {
    await handleSaveScreenshot(makeScreenshotData());

    const writeFileCalls = mockWriteFile.mock.calls;
    // Should only have screenshot binary + metadata JSON = 2 calls
    expect(writeFileCalls.length).toBe(2);
  });

  it('does not save log files when logs array is empty', async () => {
    await handleSaveScreenshot(makeScreenshotData({ logs: [] }));

    const writeFileCalls = mockWriteFile.mock.calls;
    expect(writeFileCalls.length).toBe(2);
  });

  it('saves a11y report when violations are provided', async () => {
    const a11y = [{ id: 'color-contrast', impact: 'serious', nodes: [] }];

    await handleSaveScreenshot(makeScreenshotData({ a11y }));

    const writeFileCalls = mockWriteFile.mock.calls;
    // screenshot binary + metadata JSON + a11y JSON = 3 calls
    expect(writeFileCalls.length).toBe(3);

    const [a11yPath, a11yContent] = writeFileCalls[2];
    expect(a11yPath).toMatch(/-a11y\.json$/);
    const a11yData = JSON.parse(a11yContent);
    expect(a11yData).toHaveLength(1);
    expect(a11yData[0].id).toBe('color-contrast');
  });

  it('does not save a11y file when array is empty', async () => {
    await handleSaveScreenshot(makeScreenshotData({ a11y: [] }));

    const writeFileCalls = mockWriteFile.mock.calls;
    // screenshot + metadata only = 2 calls (empty a11y is logged but not saved)
    expect(writeFileCalls.length).toBe(2);
  });

  it('propagates fs.mkdir errors', async () => {
    mockMkdir.mockRejectedValueOnce(new Error('Permission denied'));

    await expect(handleSaveScreenshot(makeScreenshotData())).rejects.toThrow(
      'Permission denied',
    );
  });

  it('propagates fs.writeFile errors', async () => {
    mockWriteFile.mockRejectedValueOnce(new Error('No space left'));

    await expect(handleSaveScreenshot(makeScreenshotData())).rejects.toThrow(
      'No space left',
    );
  });
});
