/**
 * Playground Theme Utilities
 *
 * Uses shared constants from @ytspar/devbar for consistent styling.
 */

import { TAILWIND_BREAKPOINTS, type TailwindBreakpoint } from '@ytspar/devbar';

/**
 * Generate and inject CSS for the breakpoint indicator
 * Uses TAILWIND_BREAKPOINTS from devbar as the source of truth
 */
export function injectBreakpointIndicator(): void {
  if (typeof document === 'undefined') return;

  const styleId = 'playground-breakpoint-indicator';
  let style = document.getElementById(styleId) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.appendChild(style);
  }

  // Generate media queries from TAILWIND_BREAKPOINTS
  const breakpointNames = Object.keys(TAILWIND_BREAKPOINTS) as TailwindBreakpoint[];

  // Sort by min value to ensure correct cascade order
  const sortedBreakpoints = breakpointNames
    .map(name => ({ name, ...TAILWIND_BREAKPOINTS[name] }))
    .sort((a, b) => a.min - b.min);

  const mediaQueries = sortedBreakpoints.map(({ name, min }) => {
    const label = name.toUpperCase();

    if (min === 0) {
      // Base breakpoint - no media query needed
      return `body::before { content: '${label}'; }`;
    }

    return `@media (min-width: ${min}px) { body::before { content: '${label}'; } }`;
  });

  style.textContent = mediaQueries.join('\n');
}
