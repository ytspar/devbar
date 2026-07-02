/**
 * Constants shared between the CDP and Playwright screenshot pipelines.
 *
 * Both pipelines need to wait for the same selector timeout, give hover
 * transitions the same settle window, and hide the devbar with the same
 * CSS — keeping these here ensures a change to the hide rules (e.g. to
 * cover a new overlay) takes effect everywhere instead of drifting.
 */

export const SELECTOR_TIMEOUT_MS = 5000;
export const HOVER_TRANSITION_DELAY_MS = 300;
export const HIDE_DEVBAR_STYLE_ID = 'sweetlink-hide-devbar-for-screenshot';

// `opacity: 0` (not just `visibility: hidden`) is load-bearing. When the devbar
// is EXPANDED, its toolbar buttons/icons are descendants that set their own
// `visibility`, so a container-level `visibility: hidden` is escaped and the
// bar leaks into the screenshot. `opacity` compounds down the subtree — a child
// cannot render above its ancestor's `opacity: 0` — so it hides the whole bar
// regardless of descendant styles, and the attribute-scoped rule keeps covering
// the container even though the devbar recreates it on every render
// (rendering/index.ts). The explicit descendant (` *`) selectors are belt-and-
// suspenders for anything that computes its own opacity. Layout is preserved
// (both properties keep the box), which is fine for these fixed overlays.
export const HIDE_DEVBAR_CSS = `
[data-devbar],
[data-devbar] *,
[data-devbar-overlay],
[data-devbar-overlay] *,
[data-devbar-tooltip],
[data-devbar-tooltip] *,
[data-devbar-ruler],
[data-devbar-ruler] * {
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

/* Third-party dev overlays that also pollute screenshots. Scoped to the
   specific devtools launcher/indicator — deliberately NOT the whole
   \`nextjs-portal\`, which also hosts the Next.js error overlay we DO want in
   the shot. */
[class*="tsqd-"],
[class*="tsqd-"] *,
[data-nextjs-dev-tools-button],
[data-nextjs-dev-tools-button] * {
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
`;
