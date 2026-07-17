/**
 * frameworkDevIndicators tests
 *
 * The Next.js dev-tools badge lives in a `nextjs-portal` shadow root that no
 * main-document CSS or html2canvas ignore-pass can reach — the only fix is a
 * style injected INTO that shadow root. These tests assert that injection
 * happens for a portal present up front, for one that mounts later, that it
 * doesn't double-inject, and that the disposer stops watching.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { suppressFrameworkDevIndicators } from './frameworkDevIndicators.js';

const STYLE_ID = 'devbar-hide-framework-dev-indicator';

// The hide rule the module injects; kept in sync with frameworkDevIndicators.ts.
const HIDE_SELECTOR = '[data-next-badge][data-error="false"]';

function makeBadge(hasError: boolean): HTMLElement {
  const badge = document.createElement('div');
  badge.setAttribute('data-next-badge', 'true');
  badge.setAttribute('data-error', String(hasError));
  const button = document.createElement('button');
  button.setAttribute('data-nextjs-dev-tools-button', '');
  badge.appendChild(button);
  return badge;
}

function makePortalWithButton(hasError = false): { portal: HTMLElement; root: ShadowRoot } {
  const portal = document.createElement('nextjs-portal');
  const root = portal.attachShadow({ mode: 'open' });
  root.appendChild(makeBadge(hasError));
  return { portal, root };
}

afterEach(() => {
  document.body.innerHTML = '';
  document.querySelectorAll('nextjs-portal').forEach((el) => el.remove());
});

describe('suppressFrameworkDevIndicators', () => {
  it('injects a hide style into a portal already in the document', () => {
    const { portal, root } = makePortalWithButton();
    document.body.appendChild(portal);

    const dispose = suppressFrameworkDevIndicators();

    const style = root.querySelector(`#${STYLE_ID}`);
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain(HIDE_SELECTOR);
    dispose();
  });

  it('hides the resting badge but leaves an errored badge visible', () => {
    const { portal } = makePortalWithButton();
    document.body.appendChild(portal);
    const dispose = suppressFrameworkDevIndicators();
    dispose();

    // The injected rule targets only the benign badge; an errored badge
    // (data-error="true") must NOT match, so a broken page still shows it.
    const benign = makeBadge(false);
    const errored = makeBadge(true);
    expect(benign.matches(HIDE_SELECTOR)).toBe(true);
    expect(errored.matches(HIDE_SELECTOR)).toBe(false);
  });

  it('injects when the portal mounts after init', async () => {
    const dispose = suppressFrameworkDevIndicators();

    const { portal, root } = makePortalWithButton();
    document.body.appendChild(portal);

    // MutationObserver callbacks are async (microtask); let them flush.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.querySelector(`#${STYLE_ID}`)).not.toBeNull();
    dispose();
  });

  it('retries injection when the shadow root attaches after the portal mounts', async () => {
    // Portal present but shadow root not yet attached — the quiescent-capture
    // race. The observer fires on this light-DOM insertion (shadow still null);
    // the later shadow attach is invisible to it, so only the bounded retry
    // saves the injection.
    const portal = document.createElement('nextjs-portal');
    document.body.appendChild(portal);

    const dispose = suppressFrameworkDevIndicators();

    // Shadow root + badge attach a beat later, with no further light-DOM change.
    const root = portal.attachShadow({ mode: 'open' });
    root.appendChild(makeBadge(false));

    // Let the retry frames run.
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(root.querySelector(`#${STYLE_ID}`)).not.toBeNull();
    dispose();
  });

  it('does not inject twice into the same shadow root', () => {
    const { portal, root } = makePortalWithButton();
    document.body.appendChild(portal);

    const dispose = suppressFrameworkDevIndicators();
    // A second call (e.g. re-init) must not add a duplicate style element.
    const dispose2 = suppressFrameworkDevIndicators();

    expect(root.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);
    dispose();
    dispose2();
  });

  it('the disposer stops the observer without throwing', async () => {
    const dispose = suppressFrameworkDevIndicators();
    dispose();

    // After disposal a newly mounted portal is not touched.
    const { portal, root } = makePortalWithButton();
    document.body.appendChild(portal);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.querySelector(`#${STYLE_ID}`)).toBeNull();
  });
});
