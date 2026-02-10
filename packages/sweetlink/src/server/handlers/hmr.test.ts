// @vitest-environment node

/**
 * HMR Handler Tests
 *
 * Tests handleHmrScreenshot which saves an HMR screenshot and logs JSON,
 * then returns paths and a log summary.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HmrScreenshotData } from '../../types.js';

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

import { handleHmrScreenshot } from './hmr.js';

const FAKE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAUA';
const FAKE_DATA_URL = `data:image/jpeg;base64,${FAKE_BASE64}`;

function makeHmrData(
  overrides: Partial<HmrScreenshotData> = {},
): HmrScreenshotData {
  return {
    trigger: 'file-change',
    screenshot: FAKE_DATA_URL,
    url: 'https://localhost:3000/',
    timestamp: 1700000000000,
    sequenceNumber: 1,
    logs: {
      all: [],
      errors: [],
      warnings: [],
      sinceLastCapture: 0,
    },
    ...overrides,
  };
}

describe('handleHmrScreenshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the HMR screenshot directory recursively', async () => {
    await handleHmrScreenshot(makeHmrData());

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('.tmp/hmr-screenshots'),
      { recursive: true },
    );
  });

  it('saves the screenshot as a binary JPEG file', async () => {
    await handleHmrScreenshot(makeHmrData());

    const writeFileCalls = mockWriteFile.mock.calls;
    const [screenshotPath, screenshotData] = writeFileCalls[0];

    expect(screenshotPath).toMatch(/hmr-.*\.jpg$/);
    expect(Buffer.isBuffer(screenshotData)).toBe(true);
  });

  it('saves logs as JSON file', async () => {
    const data = makeHmrData({
      logs: {
        all: [
          { level: 'log', message: 'HMR update', timestamp: 1700000000000 },
        ],
        errors: [],
        warnings: [],
        sinceLastCapture: 1,
      },
    });

    await handleHmrScreenshot(data);

    const writeFileCalls = mockWriteFile.mock.calls;
    const [logsPath, logsContent, encoding] = writeFileCalls[1];

    expect(logsPath).toMatch(/-logs\.json$/);
    expect(encoding).toBe('utf-8');

    const logsJson = JSON.parse(logsContent);
    expect(logsJson.meta.trigger).toBe('file-change');
    expect(logsJson.meta.url).toBe('https://localhost:3000/');
    expect(logsJson.logs.all).toHaveLength(1);
    expect(logsJson.logs.all[0].message).toBe('HMR update');
  });

  it('includes trigger in the filename', async () => {
    const result = await handleHmrScreenshot(
      makeHmrData({ trigger: 'style-update' }),
    );

    expect(result.screenshotPath).toContain('style-update');
    expect(result.logsPath).toContain('style-update');
  });

  it('returns correct result shape', async () => {
    const result = await handleHmrScreenshot(makeHmrData());

    expect(result).toHaveProperty('screenshotPath');
    expect(result).toHaveProperty('logsPath');
    expect(result).toHaveProperty('logSummary');
    expect(result.screenshotPath).toMatch(/\.jpg$/);
    expect(result.logsPath).toMatch(/-logs\.json$/);
  });

  it('returns correct log summary with no errors or warnings', async () => {
    const result = await handleHmrScreenshot(makeHmrData());

    expect(result.logSummary).toEqual({
      totalLogs: 0,
      errorCount: 0,
      warningCount: 0,
      hasNewErrors: false,
    });
  });

  it('returns correct log summary with errors and warnings', async () => {
    const data = makeHmrData({
      logs: {
        all: [
          { level: 'error', message: 'err1', timestamp: 1 },
          { level: 'error', message: 'err2', timestamp: 2 },
          { level: 'warn', message: 'warn1', timestamp: 3 },
          { level: 'log', message: 'info1', timestamp: 4 },
        ],
        errors: [
          { level: 'error', message: 'err1', timestamp: 1 },
          { level: 'error', message: 'err2', timestamp: 2 },
        ],
        warnings: [{ level: 'warn', message: 'warn1', timestamp: 3 }],
        sinceLastCapture: 4,
      },
    });

    const result = await handleHmrScreenshot(data);

    expect(result.logSummary).toEqual({
      totalLogs: 4,
      errorCount: 2,
      warningCount: 1,
      hasNewErrors: true,
    });
  });

  it('includes changedFile and hmrMetadata in logs JSON', async () => {
    const data = makeHmrData({
      changedFile: 'src/App.tsx',
      hmrMetadata: {
        modulesUpdated: ['src/App.tsx'],
        fullReload: false,
        updateDuration: 42,
      },
    });

    await handleHmrScreenshot(data);

    const writeFileCalls = mockWriteFile.mock.calls;
    const logsJson = JSON.parse(writeFileCalls[1][1]);
    expect(logsJson.meta.changedFile).toBe('src/App.tsx');
    expect(logsJson.meta.hmrMetadata).toEqual({
      modulesUpdated: ['src/App.tsx'],
      fullReload: false,
      updateDuration: 42,
    });
  });

  it('formats log timestamps as ISO strings in JSON output', async () => {
    const data = makeHmrData({
      logs: {
        all: [{ level: 'log', message: 'test', timestamp: 1700000000000 }],
        errors: [],
        warnings: [],
        sinceLastCapture: 1,
      },
    });

    await handleHmrScreenshot(data);

    const writeFileCalls = mockWriteFile.mock.calls;
    const logsJson = JSON.parse(writeFileCalls[1][1]);
    expect(logsJson.logs.all[0].timestamp).toBe(
      new Date(1700000000000).toISOString(),
    );
  });

  it('propagates fs.mkdir errors', async () => {
    mockMkdir.mockRejectedValueOnce(new Error('Permission denied'));

    await expect(handleHmrScreenshot(makeHmrData())).rejects.toThrow(
      'Permission denied',
    );
  });

  it('propagates fs.writeFile errors', async () => {
    mockWriteFile.mockRejectedValueOnce(new Error('No space left'));

    await expect(handleHmrScreenshot(makeHmrData())).rejects.toThrow(
      'No space left',
    );
  });
});
