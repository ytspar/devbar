// @vitest-environment node

/**
 * Screenshot Constants Tests
 *
 * The CDP and Playwright pipelines both consume these constants. The
 * audit flagged them as a "missing test" but they're literal strings —
 * the testable contract is:
 *
 *   1. The CSS string targets every devbar selector our screenshot
 *      hide-pass needs to disable. A regression where someone renames
 *      `[data-devbar]` and forgets to update this CSS makes screenshots
 *      capture devbar chrome over the page content.
 *   2. The CSS uses `!important` (otherwise a host page's `display:
 *      block !important` would override our hide).
 *   3. The style ID is unique enough not to collide with host-page IDs.
 */

import { describe, expect, it } from 'vitest';
import {
  HIDE_DEVBAR_CSS,
  HIDE_DEVBAR_STYLE_ID,
  HOVER_TRANSITION_DELAY_MS,
  SELECTOR_TIMEOUT_MS,
} from './screenshotConstants.js';

describe('screenshotConstants', () => {
  it('exposes positive numeric timeouts', () => {
    expect(SELECTOR_TIMEOUT_MS).toBeGreaterThan(0);
    expect(HOVER_TRANSITION_DELAY_MS).toBeGreaterThan(0);
    // Sanity bounds: a 30s+ selector timeout would mask real bugs;
    // a 0ms hover delay would screenshot mid-transition.
    expect(SELECTOR_TIMEOUT_MS).toBeLessThan(30_000);
    expect(HOVER_TRANSITION_DELAY_MS).toBeGreaterThanOrEqual(100);
  });

  it('hide-style id is namespaced to avoid host-page collisions', () => {
    expect(HIDE_DEVBAR_STYLE_ID).toMatch(/sweetlink/);
    expect(HIDE_DEVBAR_STYLE_ID).not.toBe('hide');
  });

  it('CSS targets all three devbar selectors', () => {
    expect(HIDE_DEVBAR_CSS).toContain('[data-devbar]');
    expect(HIDE_DEVBAR_CSS).toContain('[data-devbar-overlay]');
    expect(HIDE_DEVBAR_CSS).toContain('[data-devbar-tooltip]');
  });

  it('CSS uses !important so host-page overrides do not defeat the hide', () => {
    const importantCount = (HIDE_DEVBAR_CSS.match(/!important/g) ?? []).length;
    expect(importantCount).toBeGreaterThanOrEqual(2);
    expect(HIDE_DEVBAR_CSS).toContain('visibility: hidden !important');
    expect(HIDE_DEVBAR_CSS).toContain('pointer-events: none !important');
  });
});
