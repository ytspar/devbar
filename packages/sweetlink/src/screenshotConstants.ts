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
export const HIDE_DEVBAR_CSS = `
[data-devbar],
[data-devbar-overlay],
[data-devbar-tooltip] {
  visibility: hidden !important;
  pointer-events: none !important;
}
`;
