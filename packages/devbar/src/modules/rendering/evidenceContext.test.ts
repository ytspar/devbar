/**
 * Evidence Context Tests
 *
 * The evidence-context modal is what AI agents read to ground their next
 * action. The shape it returns is a contract: every section that consumers
 * (Claude, Cursor, etc.) parse must be present, and the markdown copyText
 * must be the same content as the items list (so a screen-render and a
 * clipboard paste agree).
 *
 * We verify: (1) all 5 baseline items always appear; (2) optional
 * `observation` flows through to copyText only when provided; (3) a
 * fallback path is rendered when no screenshot or artifact has been
 * captured yet (instead of "undefined" leaking).
 */

import { describe, expect, it } from 'vitest';
import { createModalEvidenceContext } from './evidenceContext.js';
import type { DevBarState } from '../types.js';

function makeState(overrides: Partial<DevBarState> = {}): DevBarState {
  return { lastScreenshot: null, ...overrides } as DevBarState;
}

describe('createModalEvidenceContext', () => {
  it('always includes the 5 baseline items', () => {
    const ctx = createModalEvidenceContext(makeState(), 'Page Schema');
    const labels = ctx.items.map((i) => i.label);
    expect(labels).toEqual(['URL', 'Viewport', 'Screenshot', 'Artifact', 'Refs']);
    expect(ctx.title).toBe('Agent Context');
  });

  it('uses friendly fallbacks when nothing has been captured yet', () => {
    const ctx = createModalEvidenceContext(makeState({ lastScreenshot: null }), 'A11y');
    const screenshot = ctx.items.find((i) => i.label === 'Screenshot');
    const artifact = ctx.items.find((i) => i.label === 'Artifact');
    expect(screenshot!.value).toBe('not captured yet');
    expect(artifact!.value).toBe('not saved yet');
    // The copyText is the same content as the rendered items — never the
    // string "undefined".
    expect(ctx.copyText || '').not.toContain('undefined');
  });

  it('threads through a captured screenshot path', () => {
    const ctx = createModalEvidenceContext(
      makeState({ lastScreenshot: '/tmp/snap-001.png' } as Partial<DevBarState>),
      'Schema'
    );
    expect(ctx.items.find((i) => i.label === 'Screenshot')!.value).toBe('/tmp/snap-001.png');
    expect(ctx.copyText).toContain('Screenshot: /tmp/snap-001.png');
  });

  it('appends an Observation line only when provided', () => {
    const without = createModalEvidenceContext(makeState(), 'Outline');
    expect(without.copyText).not.toContain('Observation');

    const withObs = createModalEvidenceContext(makeState(), 'Outline', {
      observation: 'h1 missing on /pricing',
    });
    expect(withObs.copyText).toContain('- Observation: h1 missing on /pricing');
  });

  it('renders the title as a markdown H1 in copyText', () => {
    const ctx = createModalEvidenceContext(makeState(), 'A11y Audit');
    expect(ctx.copyText.split('\n')[0]).toBe('# A11y Audit');
  });

  it('reads viewport from window.innerWidth/Height with DPR suffix', () => {
    // happy-dom provides a window; we don't need to mock — just verify the
    // shape of the value matches "WxH @Nx".
    const ctx = createModalEvidenceContext(makeState(), 'Schema');
    const viewport = ctx.items.find((i) => i.label === 'Viewport')!.value;
    expect(viewport).toMatch(/^\d+x\d+ @\d+x$/);
  });

  it('items list and copyText agree on URL/Viewport/Screenshot/Artifact', () => {
    const ctx = createModalEvidenceContext(makeState(), 'Schema');
    for (const item of ctx.items) {
      expect(ctx.copyText).toContain(`- ${item.label}: ${item.value}`);
    }
  });
});
