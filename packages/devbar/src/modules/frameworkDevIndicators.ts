/**
 * Suppress a framework's own floating dev indicator when the devbar is active —
 * but ONLY while it is benign, never while it is signalling an error.
 *
 * Next.js renders its dev-tools launcher (the "N" button + route/build badge)
 * inside a `nextjs-portal` **shadow root**, fixed to a bottom corner. In its
 * resting state it duplicates what the devbar already surfaces and, being a
 * fixed overlay, sits on top of page content and pollutes screenshots — so we
 * hide it. But that same badge flips to an **error state** (`data-error="true"`)
 * when the page has a build/runtime error, and that IS meaningful: a capture
 * showing the errored badge is telling you the captured page is broken. Hiding
 * it there would mask a real defect and let a broken page pass review, so the
 * rule below is scoped to the resting badge (`data-error="false"`) and leaves
 * the errored badge — and the `[data-nextjs-dialog-overlay]` error overlay —
 * fully visible. `data-error` is a live attribute, so the CSS reacts on its own
 * as errors come and go.
 *
 * Shadow-DOM encapsulation is why no capture pipeline can hide it from the
 * outside: a `<style>` (or html2canvas `ignoreElements`) in the *main* document
 * never reaches nodes inside the portal's shadow root. The only place that can
 * hide it is a style injected INTO that shadow root — which is exactly what this
 * module does, and why it lives on the page (in the devbar) rather than in a
 * capture backend: it then covers every backend (agent-browser, sweetlink
 * CDP/CLI, html2canvas) at once.
 */

const NEXT_PORTAL_TAG = 'nextjs-portal';
const STYLE_ID = 'devbar-hide-framework-dev-indicator';
// Only the resting (non-error) badge. `[data-error="true"]` stays visible so an
// errored capture still shows that the page is broken.
//
// This keys off `data-error="false"` — an undocumented Next.js internal (verified
// against the current dev overlay). If a future Next stops rendering that literal
// (e.g. a boolean attribute that's absent when clean, or `data-error="0"`), this
// rule simply stops matching and the resting badge REAPPEARS in captures. That's
// the harmless direction: cosmetic screenshot noise, never a hidden error — the
// errored badge is still shown. Deliberately not broadened to
// `:not([data-error="true"])`, which would hide a badge whose attribute went
// missing and shift the failure to the dangerous direction.
const HIDE_CSS = '[data-next-badge][data-error="false"]{display:none !important;}';

function injectIntoShadow(portal: Element): void {
  const root = (portal as HTMLElement).shadowRoot;
  if (!root) return;
  if (root.querySelector(`#${STYLE_ID}`)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = HIDE_CSS;
  root.appendChild(style);
}

/**
 * Hide the framework's floating dev indicator, now and whenever it (re)mounts.
 * The portal can appear after the devbar initializes and Next recreates it on
 * HMR, so keep watching. Returns a disposer that stops observing.
 */
export function suppressFrameworkDevIndicators(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }

  const existing = document.querySelector(NEXT_PORTAL_TAG);
  if (existing) injectIntoShadow(existing);

  const observer = new MutationObserver(() => {
    const portal = document.querySelector(NEXT_PORTAL_TAG);
    if (portal) injectIntoShadow(portal);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  return () => observer.disconnect();
}
