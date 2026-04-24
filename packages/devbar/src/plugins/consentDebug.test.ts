import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../GlobalDevBar.js', () => ({
  getGlobalDevBar: vi.fn(),
  GlobalDevBar: {
    registerControl: vi.fn(),
    unregisterControl: vi.fn(),
  },
}));

import { GlobalDevBar } from '../GlobalDevBar.js';
import { consentDebugPlugin } from './consentDebug.js';

const mockRegister = GlobalDevBar.registerControl as ReturnType<typeof vi.fn>;
const mockUnregister = GlobalDevBar.unregisterControl as ReturnType<typeof vi.fn>;

type ZarazStub = {
  consent: {
    setAll: ReturnType<typeof vi.fn>;
    sendQueuedEvents?: ReturnType<typeof vi.fn>;
    getAll?: () => Record<string, boolean>;
  };
};

declare global {
  interface Window {
    zaraz?: ZarazStub;
    __geo?: unknown;
  }
}

function installZaraz(): ZarazStub {
  const zaraz: ZarazStub = {
    consent: {
      setAll: vi.fn(),
      sendQueuedEvents: vi.fn(),
      getAll: () => ({ analytics: true }),
    },
  };
  (window as Window).zaraz = zaraz;
  return zaraz;
}

function uninstallZaraz(): void {
  delete (window as Window).zaraz;
}

describe('consentDebugPlugin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockRegister.mockClear();
    mockUnregister.mockClear();
    uninstallZaraz();
    (window as Window).__geo = undefined;
    document.cookie = 'cf_consent=; Max-Age=0; Path=/';
  });

  afterEach(() => {
    vi.useRealTimers();
    uninstallZaraz();
  });

  it('registers immediately when zaraz is already present', () => {
    installZaraz();

    const cleanup = consentDebugPlugin();

    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'devbar-plugin-consent-debug', label: 'Consent' })
    );

    cleanup();
    expect(mockUnregister).toHaveBeenCalledWith('devbar-plugin-consent-debug');
  });

  it('waits for zaraz then registers on a later tick', () => {
    const cleanup = consentDebugPlugin({ pollIntervalMs: 100 });
    expect(mockRegister).not.toHaveBeenCalled();

    installZaraz();
    vi.advanceTimersByTime(100);

    expect(mockRegister).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('stops polling after maxWaitMs when zaraz never arrives', () => {
    const cleanup = consentDebugPlugin({ pollIntervalMs: 100, maxWaitMs: 300 });
    vi.advanceTimersByTime(500);
    expect(mockRegister).not.toHaveBeenCalled();

    // Zaraz arriving after the deadline must NOT cause late registration.
    installZaraz();
    vi.advanceTimersByTime(1000);
    expect(mockRegister).not.toHaveBeenCalled();

    cleanup();
    expect(mockUnregister).not.toHaveBeenCalled();
  });

  it('cleanup during the wait window is a no-op for registration', () => {
    const cleanup = consentDebugPlugin({ pollIntervalMs: 100 });
    cleanup();

    installZaraz();
    vi.advanceTimersByTime(500);

    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockUnregister).not.toHaveBeenCalled();
  });
});
