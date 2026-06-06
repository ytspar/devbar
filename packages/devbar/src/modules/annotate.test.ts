/**
 * Annotate Module Tests (DEV-4516)
 *
 * Covers the pure helpers (selector building, viewport bucketing, pin POST
 * shape) and the activate/cleanup lifecycle, mirroring ruler.test.ts. happy-dom
 * doesn't compute layout (getBoundingClientRect → zero rects), so we assert
 * structure + the data-devbar markers the capture pipeline hides on, not pixels.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activateAnnotateMode,
  buildSelector,
  type DevbarPin,
  registerAnnotateControl,
  submitPin,
  viewportBucket,
} from './annotate.js';

describe('buildSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers an id', () => {
    const el = document.createElement('div');
    el.id = 'hero-cta';
    document.body.appendChild(el);
    expect(buildSelector(el)).toBe('#hero-cta');
  });

  it('falls back to a tag + nth-of-type path', () => {
    document.body.innerHTML = '<section><button>a</button><button>b</button></section>';
    const second = document.querySelectorAll('button')[1];
    const sel = buildSelector(second);
    expect(sel).toContain('button:nth-of-type(2)');
    // Resolving the selector finds the same element.
    expect(document.querySelector(sel)).toBe(second);
  });

  it('stops at the nearest id ancestor', () => {
    document.body.innerHTML = '<main id="app"><div><span>x</span></div></main>';
    const span = document.querySelector('span') as Element;
    expect(buildSelector(span).startsWith('#app')).toBe(true);
  });
});

describe('viewportBucket', () => {
  it('buckets by width', () => {
    expect(viewportBucket(390)).toBe('mobile');
    expect(viewportBucket(800)).toBe('tablet');
    expect(viewportBucket(1440)).toBe('desktop');
  });
});

describe('submitPin', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs a {pins:[pin]} body fire-and-forget (no-cors, text/plain)', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(null, { status: 0 });
      })
    );
    const pin: DevbarPin = {
      id: 'pin_1',
      source: 'devbar',
      kind: 'fix',
      comment: 'tighten this gap',
    };
    await submitPin(pin, 'http://localhost:3846/api/feedback');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://localhost:3846/api/feedback');
    expect(calls[0].init.mode).toBe('no-cors');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.pins[0]).toMatchObject({ id: 'pin_1', source: 'devbar', kind: 'fix' });
  });

  it('swallows network errors (best-effort)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('listener down');
      })
    );
    const pin: DevbarPin = { id: 'pin_2', source: 'devbar', kind: 'question', comment: 'why?' };
    await expect(submitPin(pin, 'http://localhost:3846/api/feedback')).resolves.toBeUndefined();
  });
});

describe('activateAnnotateMode', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns an idempotent cleanup and mounts a hidden-on-capture overlay', () => {
    const cleanup = activateAnnotateMode();
    const overlay = document.querySelector('[data-devbar="annotate-overlay"]');
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('data-devbar-overlay')).toBe('');
    cleanup();
    expect(document.querySelector('[data-devbar="annotate-overlay"]')).toBeNull();
    // Idempotent — second call does not throw.
    expect(() => cleanup()).not.toThrow();
  });
});

describe('registerAnnotateControl', () => {
  it('registers an "annotate" control whose click toggles active', () => {
    const registered: Array<{ id: string; active?: boolean; onClick?: () => void }> = [];
    registerAnnotateControl((c) => registered.push(c));
    const last = () => registered[registered.length - 1];
    expect(registered[0].id).toBe('annotate');
    expect(registered[0].active).toBe(false);
    // Click → enters annotate mode, re-registers with active:true.
    last().onClick?.();
    expect(last().active).toBe(true);
    // Click again → exits.
    last().onClick?.();
    expect(last().active).toBe(false);
  });
});
