import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../GlobalDevBar.js', () => ({
  GlobalDevBar: {
    registerControl: vi.fn(),
    unregisterControl: vi.fn(),
  },
}));

import { GlobalDevBar } from '../GlobalDevBar.js';
import { appVersionPlugin } from './appVersion.js';

const mockRegisterControl = GlobalDevBar.registerControl as ReturnType<typeof vi.fn>;
const mockUnregisterControl = GlobalDevBar.unregisterControl as ReturnType<typeof vi.fn>;

describe('appVersionPlugin', () => {
  beforeEach(() => {
    mockRegisterControl.mockClear();
    mockUnregisterControl.mockClear();
  });

  it('registers control with version string', () => {
    const cleanup = appVersionPlugin('1.4.2');

    expect(mockRegisterControl).toHaveBeenCalledWith({
      id: 'devbar-plugin-app-version',
      label: 'v1.4.2',
      variant: 'default',
      onClick: undefined,
    });

    cleanup();
  });

  it('uses custom prefix', () => {
    const cleanup = appVersionPlugin('2.0.0', { prefix: 'ver ' });

    expect(mockRegisterControl).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'ver 2.0.0',
      })
    );

    cleanup();
  });

  it('uses custom variant', () => {
    const cleanup = appVersionPlugin('1.0.0', { variant: 'warning' });

    expect(mockRegisterControl).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'warning',
      })
    );

    cleanup();
  });

  it('passes onClick callback with version', () => {
    const onClick = vi.fn();
    const cleanup = appVersionPlugin('3.1.0', { onClick });

    const registeredControl = mockRegisterControl.mock.calls[0][0];
    expect(registeredControl.onClick).toBeDefined();
    registeredControl.onClick();

    expect(onClick).toHaveBeenCalledWith('3.1.0');

    cleanup();
  });

  it('handles prerelease version strings', () => {
    const cleanup = appVersionPlugin('2.0.0-beta.1');

    expect(mockRegisterControl).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'v2.0.0-beta.1',
      })
    );

    cleanup();
  });

  it('cleanup unregisters the control', () => {
    const cleanup = appVersionPlugin('1.0.0');
    cleanup();

    expect(mockUnregisterControl).toHaveBeenCalledWith('devbar-plugin-app-version');
  });
});
