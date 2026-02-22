// @vitest-environment node

/**
 * Settings Handler Tests
 *
 * Tests handleSaveSettings and handleLoadSettings which read/write
 * .devbar/settings.json to the file system.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockMkdir, mockWriteFile, mockReadFile } = vi.hoisted(() => ({
  mockMkdir: vi.fn().mockResolvedValue(undefined),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
  mockReadFile: vi.fn().mockResolvedValue('{}'),
}));

vi.mock('fs', () => ({
  promises: {
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
    readFile: mockReadFile,
  },
}));

vi.mock('../index.js', () => ({
  getProjectRoot: vi.fn(() => '/mock/project'),
}));

import { handleSaveSettings, handleLoadSettings } from './settings.js';
import type { DevBarSettings } from './settings.js';

function makeSettings(overrides: Partial<DevBarSettings> = {}): DevBarSettings {
  return {
    version: 1,
    position: 'bottom-left',
    themeMode: 'system',
    compactMode: false,
    accentColor: '#10b981',
    showScreenshot: true,
    showConsoleBadges: true,
    showTooltips: true,
    saveLocation: 'auto',
    screenshotQuality: 0.7,
    showMetrics: {
      breakpoint: true,
      fcp: true,
      lcp: true,
      cls: true,
      inp: true,
      pageSize: true,
    },
    debug: false,
    ...overrides,
  };
}

describe('handleSaveSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the .devbar directory recursively', async () => {
    const settings = makeSettings();
    await handleSaveSettings({ settings });

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('.devbar'),
      { recursive: true },
    );
  });

  it('writes settings as JSON to settings.json', async () => {
    const settings = makeSettings({ position: 'top-right', themeMode: 'dark' });
    await handleSaveSettings({ settings });

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [filePath, content, encoding] = mockWriteFile.mock.calls[0];

    expect(filePath).toMatch(/\.devbar\/settings\.json$/);
    expect(encoding).toBe('utf-8');

    const parsed = JSON.parse(content);
    expect(parsed.position).toBe('top-right');
    expect(parsed.themeMode).toBe('dark');
    expect(parsed.version).toBe(1);
  });

  it('returns the settings file path', async () => {
    const settings = makeSettings();
    const result = await handleSaveSettings({ settings });

    expect(result).toHaveProperty('settingsPath');
    expect(result.settingsPath).toMatch(/\.devbar\/settings\.json$/);
  });

  it('propagates fs.mkdir errors', async () => {
    mockMkdir.mockRejectedValueOnce(new Error('Permission denied'));

    await expect(
      handleSaveSettings({ settings: makeSettings() }),
    ).rejects.toThrow('Permission denied');
  });

  it('propagates fs.writeFile errors', async () => {
    mockWriteFile.mockRejectedValueOnce(new Error('Disk full'));

    await expect(
      handleSaveSettings({ settings: makeSettings() }),
    ).rejects.toThrow('Disk full');
  });

  it('writes pretty-printed JSON (indented with 2 spaces)', async () => {
    const settings = makeSettings();
    await handleSaveSettings({ settings });

    const content = mockWriteFile.mock.calls[0][1] as string;
    // Pretty-printed JSON has newlines
    expect(content).toContain('\n');
    expect(content).toBe(JSON.stringify(settings, null, 2));
  });
});

describe('handleLoadSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads and parses settings from settings.json', async () => {
    const settings = makeSettings({ position: 'top-left', debug: true });
    mockReadFile.mockResolvedValueOnce(JSON.stringify(settings));

    const result = await handleLoadSettings();

    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining('.devbar/settings.json'),
      'utf-8',
    );
    expect(result).toEqual(settings);
  });

  it('returns null when file does not exist (ENOENT)', async () => {
    const enoentError = Object.assign(new Error('File not found'), { code: 'ENOENT' });
    mockReadFile.mockRejectedValueOnce(enoentError);

    const result = await handleLoadSettings();

    expect(result).toBeNull();
  });

  it('returns null on invalid JSON', async () => {
    mockReadFile.mockResolvedValueOnce('not valid json {{{');

    const result = await handleLoadSettings();

    expect(result).toBeNull();
  });

  it('returns null on non-ENOENT errors', async () => {
    const permError = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    mockReadFile.mockRejectedValueOnce(permError);

    const result = await handleLoadSettings();

    expect(result).toBeNull();
  });

  it('returns full settings object with all fields', async () => {
    const settings = makeSettings({
      position: 'bottom-right',
      compactMode: true,
      accentColor: '#ff0000',
      screenshotQuality: 0.9,
      showMetrics: {
        breakpoint: false,
        fcp: true,
        lcp: true,
        cls: false,
        inp: true,
        pageSize: false,
      },
    });
    mockReadFile.mockResolvedValueOnce(JSON.stringify(settings));

    const result = await handleLoadSettings();

    expect(result).not.toBeNull();
    expect(result!.position).toBe('bottom-right');
    expect(result!.compactMode).toBe(true);
    expect(result!.screenshotQuality).toBe(0.9);
    expect(result!.showMetrics.breakpoint).toBe(false);
  });
});
