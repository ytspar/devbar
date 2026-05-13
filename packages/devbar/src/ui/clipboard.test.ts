import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './clipboard.js';

describe('copyTextToClipboard', () => {
  const originalIsSecureContextDescriptor = Object.getOwnPropertyDescriptor(
    window,
    'isSecureContext'
  );

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.textContent = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    if (originalIsSecureContextDescriptor) {
      Object.defineProperty(window, 'isSecureContext', originalIsSecureContextDescriptor);
    } else {
      delete (window as Window & { isSecureContext?: boolean }).isSecureContext;
    }
  });

  it('uses navigator.clipboard.writeText when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await copyTextToClipboard('# Report');

    expect(writeText).toHaveBeenCalledWith('# Report');
  });

  it('falls back to a textarea copy when writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await copyTextToClipboard('# Context');

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('uses the textarea fallback immediately in insecure contexts', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await copyTextToClipboard('# Local Report');

    expect(writeText).not.toHaveBeenCalled();
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('throws when both clipboard methods fail', async () => {
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });

    await expect(copyTextToClipboard('nope')).rejects.toThrow('Clipboard write failed');
  });
});
