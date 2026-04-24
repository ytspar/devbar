/**
 * Consent Debug Plugin for DevBar
 *
 * Adds a toolbar control for manually exercising a cookie-consent banner
 * without needing a VPN or a real geo lookup. Useful for apps that gate UI
 * on `window.__geo` + Cloudflare Zaraz's consent API (`window.zaraz.consent`).
 *
 * The control is only registered once `window.zaraz` is detected on the
 * page (Cloudflare injects it asynchronously). If Zaraz never arrives, the
 * plugin stays idle.
 *
 * Click the toolbar button to open a modal with:
 *   - Region presets (EU/UK/FR/CA/VA/JP/BR by default) that write to
 *     `window.__geo` and dispatch a host-configured "show banner" event
 *   - Accept All / Reject All (routed through Zaraz when available, else
 *     a fallback cookie)
 *   - Clear Cookies (removes the listed consent cookies)
 *   - Reset (clears cookies + `window.__geo`)
 *   - Live status readout (geo / Zaraz purposes / cookies)
 *
 * Usage:
 *   import { consentDebugPlugin } from '@ytspar/devbar/plugins/consent-debug';
 *   const cleanup = consentDebugPlugin({
 *     cookies: ['cf_consent', 's1k_consent'],
 *     events: { showBanner: 'showConsentBanner' },
 *   });
 *   // later: cleanup();
 */

import { getGlobalDevBar, GlobalDevBar } from '../GlobalDevBar.js';
import { CSS_COLORS, withAlpha } from '../constants.js';
import { createStyledButton } from '../ui/buttons.js';
import {
  createEmptyMessage,
  createModalBox,
  createModalContent,
  createModalHeader,
  createModalOverlay,
} from '../ui/modals.js';

const CONTROL_ID = 'devbar-plugin-consent-debug';
const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_MAX_WAIT_MS = 30_000;
const DEFAULT_COLOR = '#10b981';

export interface GeoMock {
  continent: string;
  country: string;
  isCAVA: boolean;
  isEU: boolean;
  region: string;
  timezone?: string;
}

export interface RegionPreset {
  geo: GeoMock;
  id: string;
  label: string;
}

export interface ConsentDebugOptions {
  /** Accent color for the control + modal. Default: `#10b981`. */
  color?: string;
  /** Consent cookie names cleared on reset. Default: `['cf_consent']`. */
  cookies?: string[];
  /** Custom event names dispatched for banner/notice/change. */
  events?: {
    changed?: string;
    showBanner?: string;
    showNotice?: string;
  };
  /** Region presets. Defaults cover EU/UK/FR/CA/VA/JP/BR. */
  regions?: RegionPreset[];
  /** Max time to wait for `window.zaraz` before giving up. Default 30s. */
  maxWaitMs?: number;
  /** Poll interval while waiting for Zaraz. Default 500ms. */
  pollIntervalMs?: number;
  /** Extra status-line callback merged into the readout. */
  extraStatus?: () => Record<string, unknown>;
}

const DEFAULT_REGIONS: RegionPreset[] = [
  {
    id: 'eu-de',
    label: 'EU (DE)',
    geo: {
      isEU: true,
      isCAVA: false,
      continent: 'EU',
      country: 'DE',
      region: 'Bavaria',
      timezone: 'Europe/Berlin',
    },
  },
  {
    id: 'eu-fr',
    label: 'EU (FR)',
    geo: {
      isEU: true,
      isCAVA: false,
      continent: 'EU',
      country: 'FR',
      region: 'Île-de-France',
      timezone: 'Europe/Paris',
    },
  },
  {
    id: 'uk',
    label: 'UK',
    geo: {
      isEU: true,
      isCAVA: false,
      continent: 'EU',
      country: 'GB',
      region: 'England',
      timezone: 'Europe/London',
    },
  },
  {
    id: 'us-ca',
    label: 'US (CA)',
    geo: {
      isEU: false,
      isCAVA: true,
      continent: 'NA',
      country: 'US',
      region: 'California',
      timezone: 'America/Los_Angeles',
    },
  },
  {
    id: 'us-va',
    label: 'US (VA)',
    geo: {
      isEU: false,
      isCAVA: true,
      continent: 'NA',
      country: 'US',
      region: 'Virginia',
      timezone: 'America/New_York',
    },
  },
  {
    id: 'jp',
    label: 'JP',
    geo: {
      isEU: false,
      isCAVA: false,
      continent: 'AS',
      country: 'JP',
      region: 'Tokyo',
      timezone: 'Asia/Tokyo',
    },
  },
  {
    id: 'br',
    label: 'BR',
    geo: {
      isEU: false,
      isCAVA: false,
      continent: 'SA',
      country: 'BR',
      region: 'São Paulo',
      timezone: 'America/Sao_Paulo',
    },
  },
];

// Matches the subset of Zaraz APIs the plugin uses. The real surface is
// wider (see Cloudflare docs) but we stay defensive and feature-detect.
interface ZarazLike {
  consent?: {
    getAll?: () => Record<string, boolean>;
    sendQueuedEvents?: () => void;
    setAll: (granted: boolean) => void;
  };
}

function getZaraz(): ZarazLike | undefined {
  return (window as unknown as { zaraz?: ZarazLike }).zaraz;
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}

function readCookie(name: string): string | null {
  const match = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function dispatchEvent(name: string, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, detail !== undefined ? { detail } : undefined));
}

interface ResolvedOptions {
  changedEvent: string;
  color: string;
  cookies: string[];
  extraStatus: (() => Record<string, unknown>) | undefined;
  maxWaitMs: number;
  pollIntervalMs: number;
  regions: RegionPreset[];
  showBannerEvent: string;
  showNoticeEvent: string;
}

function resolveOptions(options: ConsentDebugOptions): ResolvedOptions {
  return {
    color: options.color ?? DEFAULT_COLOR,
    cookies: options.cookies ?? ['cf_consent'],
    changedEvent: options.events?.changed ?? 'consentChanged',
    showBannerEvent: options.events?.showBanner ?? 'showConsentBanner',
    showNoticeEvent: options.events?.showNotice ?? 'showOptOutNotice',
    regions: options.regions ?? DEFAULT_REGIONS,
    pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    maxWaitMs: options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS,
    extraStatus: options.extraStatus,
  };
}

// --- modal rendering -------------------------------------------------------

function createSection(title: string, color: string): HTMLDivElement {
  const section = document.createElement('div');
  Object.assign(section.style, { marginBottom: '16px' });

  const heading = document.createElement('div');
  Object.assign(heading.style, {
    color,
    fontSize: '0.75rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '8px',
  });
  heading.textContent = title;
  section.appendChild(heading);

  return section;
}

function createButtonRow(): HTMLDivElement {
  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', flexWrap: 'wrap', gap: '8px' });
  return row;
}

function createStatusReadout(
  opts: ResolvedOptions,
  refresh: () => void
): { element: HTMLPreElement; render: () => void } {
  const box = document.createElement('pre');
  Object.assign(box.style, {
    backgroundColor: withAlpha(opts.color, 8),
    border: `1px solid ${withAlpha(opts.color, 25)}`,
    borderRadius: '6px',
    padding: '10px 12px',
    margin: '0',
    color: CSS_COLORS.textSecondary,
    fontFamily: 'monospace',
    fontSize: '0.6875rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    maxHeight: '180px',
    overflow: 'auto',
  });

  const render = (): void => {
    const cookies: Record<string, string | null> = {};
    for (const name of opts.cookies) {
      cookies[name] = readCookie(name);
    }
    const status: Record<string, unknown> = {
      geo: (window as unknown as { __geo?: unknown }).__geo,
      zaraz: getZaraz()?.consent?.getAll?.() ?? null,
      cookies,
    };
    if (opts.extraStatus) {
      try {
        Object.assign(status, opts.extraStatus());
      } catch {
        /* ignore */
      }
    }
    box.textContent = JSON.stringify(status, null, 2);
    refresh();
  };

  render();
  return { element: box, render };
}

function openModal(opts: ResolvedOptions): void {
  const instance = getGlobalDevBar();
  const existingOverlay = document.querySelector(
    '[data-devbar-overlay="true"]'
  );
  if (existingOverlay) {
    existingOverlay.remove();
  }

  const close = (): void => {
    overlay.remove();
    if (instance && instance.overlayElement === overlay) {
      instance.overlayElement = null;
    }
  };

  const overlay = createModalOverlay(close);
  const box = createModalBox(opts.color);

  const header = createModalHeader({
    color: opts.color,
    title: 'Consent Debug',
    onClose: close,
  });

  const content = createModalContent();
  const status = createStatusReadout(opts, () => {
    /* no-op; the node updates in place */
  });

  // Regions section
  const regions = createSection('Mock region', opts.color);
  const regionRow = createButtonRow();
  for (const region of opts.regions) {
    const btn = createStyledButton({ color: opts.color, text: region.label });
    btn.onclick = () => {
      (window as unknown as { __geo: GeoMock }).__geo = region.geo;
      dispatchEvent(opts.showBannerEvent, { region: region.id });
      status.render();
    };
    regionRow.appendChild(btn);
  }
  regions.appendChild(regionRow);
  content.appendChild(regions);

  // Actions section
  const actions = createSection('Actions', opts.color);
  const actionRow = createButtonRow();

  const mkAction = (text: string, handler: () => void): HTMLButtonElement => {
    const btn = createStyledButton({ color: opts.color, text });
    btn.onclick = () => {
      handler();
      status.render();
    };
    return btn;
  };

  actionRow.appendChild(
    mkAction('Show Banner', () => dispatchEvent(opts.showBannerEvent))
  );
  actionRow.appendChild(
    mkAction('Show Notice', () => dispatchEvent(opts.showNoticeEvent))
  );
  actionRow.appendChild(
    mkAction('Accept All', () => {
      const zaraz = getZaraz();
      if (zaraz?.consent) {
        zaraz.consent.setAll(true);
        zaraz.consent.sendQueuedEvents?.();
      }
      dispatchEvent(opts.changedEvent);
    })
  );
  actionRow.appendChild(
    mkAction('Reject All', () => {
      getZaraz()?.consent?.setAll(false);
      dispatchEvent(opts.changedEvent);
    })
  );
  actionRow.appendChild(
    mkAction('Clear Cookies', () => {
      for (const name of opts.cookies) deleteCookie(name);
      dispatchEvent(opts.changedEvent);
    })
  );
  actionRow.appendChild(
    mkAction('Reset', () => {
      for (const name of opts.cookies) deleteCookie(name);
      (window as unknown as { __geo?: unknown }).__geo = undefined;
      dispatchEvent(opts.changedEvent);
    })
  );
  actions.appendChild(actionRow);
  content.appendChild(actions);

  // Status section
  const statusSection = createSection('Status', opts.color);
  statusSection.appendChild(status.element);
  content.appendChild(statusSection);

  if (opts.regions.length === 0) {
    content.appendChild(createEmptyMessage('No region presets configured.'));
  }

  box.appendChild(header);
  box.appendChild(content);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Track overlay on the devbar so its log listener skips re-render while
  // the modal is open (prevents a tear-down/rebuild loop on console noise).
  if (instance) {
    instance.overlayElement = overlay;
  }
}

// --- plugin entry ----------------------------------------------------------

/**
 * Activate the consent-debug plugin.
 *
 * Registers a toolbar control once `window.zaraz` is detected. Polls at
 * `pollIntervalMs` and gives up after `maxWaitMs`. Returns a cleanup
 * function that stops polling and unregisters the control.
 */
export function consentDebugPlugin(
  options: ConsentDebugOptions = {}
): () => void {
  const opts = resolveOptions(options);

  let stopped = false;
  let registered = false;
  let pollHandle: ReturnType<typeof setInterval> | null = null;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const stopPolling = (): void => {
    if (pollHandle !== null) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  };

  const tryRegister = (): void => {
    if (stopped || registered) return;
    if (typeof window === 'undefined') return;
    if (!getZaraz()) return;
    GlobalDevBar.registerControl({
      id: CONTROL_ID,
      label: 'Consent',
      variant: 'info',
      onClick: () => openModal(opts),
    });
    registered = true;
    stopPolling();
  };

  // Attempt immediately — Zaraz may already be present.
  tryRegister();

  if (!registered && typeof window !== 'undefined') {
    pollHandle = setInterval(tryRegister, opts.pollIntervalMs);
    timeoutHandle = setTimeout(stopPolling, opts.maxWaitMs);
  }

  return () => {
    stopped = true;
    stopPolling();
    if (registered) {
      GlobalDevBar.unregisterControl(CONTROL_ID);
      registered = false;
    }
  };
}
