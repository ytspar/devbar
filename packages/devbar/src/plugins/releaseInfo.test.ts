import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../GlobalDevBar.js', () => ({
  GlobalDevBar: {
    registerControl: vi.fn(),
    unregisterControl: vi.fn(),
  },
}));

import { GlobalDevBar } from '../GlobalDevBar.js';
import {
  createReleaseInfoLabel,
  createReleaseInfoTooltip,
  formatReleaseTimestamp,
  releaseInfoPlugin,
} from './releaseInfo.js';

const mockRegisterControl = GlobalDevBar.registerControl as ReturnType<typeof vi.fn>;
const mockUnregisterControl = GlobalDevBar.unregisterControl as ReturnType<typeof vi.fn>;

describe('releaseInfoPlugin', () => {
  beforeEach(() => {
    mockRegisterControl.mockClear();
    mockUnregisterControl.mockClear();
  });

  it('registers a release control with version and timestamp', () => {
    const cleanup = releaseInfoPlugin(
      {
        version: '1.0.1',
        releasedAt: '2026-05-06T06:21:23Z',
        changelog: ['Show staging release metadata'],
      },
      { locale: 'en-US', timeZone: 'UTC' }
    );

    expect(mockRegisterControl).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'devbar-plugin-release-info',
        label: 'v1.0.1 May 6, 2026, 6:21 AM',
        variant: 'info',
      })
    );

    const registeredControl = mockRegisterControl.mock.calls[0][0];
    expect(registeredControl.tooltip()).toBe(
      [
        'Release v1.0.1',
        'Released: May 6, 2026, 6:21 AM',
        '',
        'Changelog',
        '- Show staging release metadata',
      ].join('\n')
    );

    cleanup();
  });

  it('supports timestamp-only releases', () => {
    const cleanup = releaseInfoPlugin(
      { releasedAt: '2026-05-06T06:21:23Z' },
      { locale: 'en-US', timeZone: 'UTC' }
    );

    expect(mockRegisterControl).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'May 6, 2026, 6:21 AM',
      })
    );

    cleanup();
  });

  it('uses custom label, id, and variant', () => {
    const cleanup = releaseInfoPlugin(
      { releasedAt: '2026-05-06T06:21:23Z' },
      { id: 'release-alt', label: 'staging build', variant: 'warning' }
    );

    expect(mockRegisterControl).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'release-alt',
        label: 'staging build',
        variant: 'warning',
      })
    );

    cleanup();
    expect(mockUnregisterControl).toHaveBeenCalledWith('release-alt');
  });

  it('passes release metadata to onClick', () => {
    const onClick = vi.fn();
    const release = { version: '1.0.1', releasedAt: '2026-05-06T06:21:23Z' };
    const cleanup = releaseInfoPlugin(release, { onClick });

    const registeredControl = mockRegisterControl.mock.calls[0][0];
    registeredControl.onClick();

    expect(onClick).toHaveBeenCalledWith(release);

    cleanup();
  });

  it('cleanup unregisters the control', () => {
    const cleanup = releaseInfoPlugin({ version: '1.0.1', releasedAt: '2026-05-06T06:21:23Z' });
    cleanup();

    expect(mockUnregisterControl).toHaveBeenCalledWith('devbar-plugin-release-info');
  });
});

describe('release info formatting helpers', () => {
  it('falls back to the raw timestamp for invalid dates', () => {
    expect(formatReleaseTimestamp('not-a-date')).toBe('not-a-date');
    expect(createReleaseInfoLabel({ version: '1.0.1', releasedAt: 'not-a-date' })).toBe(
      'v1.0.1 not-a-date'
    );
  });

  it('omits changelog header when there are no changelog lines', () => {
    expect(createReleaseInfoTooltip({ releasedAt: 'not-a-date' })).toBe(
      ['Release', 'Released: not-a-date'].join('\n')
    );
  });
});
